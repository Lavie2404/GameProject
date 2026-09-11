/**
 * View-model for the quota modal: every decision the modal makes, as data.
 *
 * The modal itself lives in App.tsx (this codebase keeps all React components
 * there), so without this the wording would exist twice — once in the JSX and
 * once in `formatKeyPoolStatus`'s plain-text version — and the two would drift
 * the first time either is edited. The JSX now just renders what this returns.
 *
 * Kept in `systems/ui/` alongside the other pure presentation helpers
 * (bannerQueue, layout, fontScale...): logic only, no JSX.
 *
 * Two sources feed it (2026-09-11): the platform pool (`defaultGemini` mode)
 * and the player's own key (`userKey` mode). In `userKey` mode the credential
 * pool `requestAi` actually walks is `[own key, ...platform keys]` (see
 * `buildAiCredentials` / `resolveApiKeys`), so the modal shows the same
 * per-key countdown table — the personal key is simply row 0. Before this the
 * personal-key path fell through to a plain-text MessageModal that dumped
 * Google's raw 429 body and pointed the player at a dropdown that is disabled
 * in that mode.
 *
 * Quota scope (2026-09-11, player report "hết đếm ngược thử lại vẫn 429"):
 * the countdown is the key BREAKER, not a promise of quota. It used to be a
 * flat 60s because the browser cannot read Google's `retry-after` header; it
 * now follows Google's own retryDelay from the 429 body. Even so, a per-DAY
 * bucket does not refill when the breaker expires, and a per-MINUTE token
 * bucket refills but the next turn may itself be bigger than the bucket. The
 * modal therefore says WHICH bucket tripped and what that implies, instead of
 * letting the countdown imply "wait this long and it works".
 */

import { formatSecondsLeft, keyPoolStatus, keySlotLabel, type KeySlotStatus } from '../ai/keyPoolStatus';
import type { QuotaErrorInfo, QuotaScope } from '../ai/requestAi';

/** Semantic tone, so the component picks colours and this file stays styling-free. */
export type QuotaRowTone = 'ok' | 'wait' | 'bad';

/** Which credential pool tripped the 429. */
export type QuotaSource = 'platform' | 'userKey';

export interface QuotaModalRow {
  index: number;
  label: string;
  /** Right-hand text, already formatted for display. */
  text: string;
  tone: QuotaRowTone;
  /** Optional small second line: how much of this key's minute bucket we used. */
  sub?: string;
}

export interface QuotaModalView {
  /** The one-line explanation above the table: which source ran out. */
  headline: string;
  rows: QuotaModalRow[];
  /** The sentence under the table telling the player what to do next. */
  advice: string;
  /**
   * What the countdown actually means for the bucket Google named — the
   * answer to "hết đếm ngược mà vẫn 429, vậy đếm ngược sai à?". Empty when
   * nothing is known about the bucket.
   */
  hint: string;
  /** Button caption: an invitation when a key is free, an acknowledgement otherwise. */
  buttonLabel: string;
  /** True when at least one key is usable right now, so the button can lead. */
  anyReady: boolean;
}

/** Token telemetry from the session, so the hint can quote real sizes. */
export interface QuotaUsageInfo {
  /** `promptTokenCount` of the most recent successful call, if any. */
  lastPromptTokens?: number | null;
  /** Serialized length of the most recent request (the one that got 429). */
  lastRequestChars?: number | null;
  /** Prompt tokens Google accepted per key in the trailing 60s (floor: rejected calls are not counted). */
  tokensLastMinuteByKey?: Record<string, number>;
}

export interface QuotaModalExtra {
  /** `aiSessionState.key_quota_scope`: which bucket each key's last 429 named. */
  scopeByKey?: Record<string, QuotaScope>;
  /** What the failing call's 429 body said (the `quota` field of the AiResult). */
  quotaInfo?: QuotaErrorInfo | null;
  usage?: QuotaUsageInfo | null;
}

const TONE: Record<KeySlotStatus['state'], QuotaRowTone> = {
  ready: 'ok',
  quota: 'wait',
  rejected: 'bad',
};

const HEADLINE: Record<QuotaSource, string> = {
  platform: 'Nguồn AI mặc định vừa báo hết quota (Lỗi 429).',
  userKey: 'API Key Gemini của riêng ngươi vừa báo hết quota (Lỗi 429).',
};

/**
 * Row label per source. Platform rows keep the "Key AI Ưu Tiên" dropdown
 * wording. In userKey mode row 0 is the player's own key and the platform keys
 * follow in canonical order, so their dropdown names are kept in brackets —
 * the dropdown is disabled in that mode, but the names are still how the
 * settings screen refers to them.
 */
export function quotaRowLabel(index: number, source: QuotaSource): string {
  if (source === 'platform') return keySlotLabel(index);
  if (index === 0) return 'Key riêng của ngươi';
  return `Key nền tảng (${keySlotLabel(index - 1).toLowerCase()})`;
}

/**
 * When Google's free-tier DAY buckets reset, as a local wall-clock time:
 * midnight in America/Los_Angeles (Pacific Time, DST-aware). Falls back to
 * the Vietnam-time approximation when the runtime lacks time-zone support.
 */
export function nextPacificMidnightLocal(nowMs: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
    const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const elapsed = get('hour') * 3600 + get('minute') * 60 + get('second');
    const reset = new Date(nowMs + (86400 - elapsed) * 1000);
    return reset.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'khoảng 14:00–15:00 giờ Việt Nam';
  }
}

function formatInt(n: number): string {
  return n.toLocaleString('vi-VN');
}

function bucketPhrase(info: QuotaErrorInfo): string {
  const unit = /token/i.test(info.metric || '') ? 'token' : 'lượt gọi';
  const per = info.scope === 'day' ? 'ngày' : 'phút';
  const model = info.model ? ` cho model ${info.model}` : '';
  return info.limit !== undefined ? `${formatInt(info.limit)} ${unit}/${per}${model}` : `${unit}/${per}${model}`;
}

/** Rough token size of a request from its serialized length (~3 chars/token for Vietnamese). */
function estimateTokens(chars: number | null | undefined): number | null {
  return typeof chars === 'number' && chars > 0 ? Math.round(chars / 3) : null;
}

/**
 * The measured-size sentence: what this client actually sent, so the player
 * can see whether one turn alone fills the bucket. Empty when nothing was measured.
 */
export function usageSentence(usage: QuotaUsageInfo | null | undefined, info: QuotaErrorInfo | null | undefined): string {
  if (!usage) return '';
  const parts: string[] = [];
  const est = estimateTokens(usage.lastRequestChars);
  if (est !== null) parts.push(`lệnh gọi vừa bị từ chối dài ${formatInt(usage.lastRequestChars as number)} ký tự (ước chừng ${formatInt(est)} token)`);
  if (typeof usage.lastPromptTokens === 'number') parts.push(`lệnh gọi thành công gần nhất tốn ${formatInt(usage.lastPromptTokens)} token đầu vào theo Google`);
  if (parts.length === 0) return '';
  const limitNote =
    info && info.scope === 'minute' && typeof info.limit === 'number' && /token/i.test(info.metric || '')
      ? ` so với hạn mức ${formatInt(info.limit)} token/phút`
      : '';
  return `Số đo thực tế: ${parts.join('; ')}${limitNote}.`;
}

/** The paragraph that explains what the countdown can and cannot promise. */
export function quotaHint(info: QuotaErrorInfo | null | undefined, nowSec: number): string {
  if (!info) return '';
  if (info.scope === 'day') {
    return (
      `Google báo hạn mức theo NGÀY đã cạn (${bucketPhrase(info)}). Đếm ngược ở trên chỉ là thời gian chờ tối thiểu, ` +
      `hết giờ thử lại vẫn sẽ bị 429. Hạn mức ngày được đặt lại lúc 00:00 giờ Thái Bình Dương, tức khoảng ` +
      `${nextPacificMidnightLocal(nowSec * 1000)} theo giờ máy ngươi. Muốn chơi tiếp ngay thì cần key của một dự án Google khác.`
    );
  }
  if (info.scope === 'minute') {
    return (
      `Google báo hạn mức theo PHÚT: ${bucketPhrase(info)}. Đếm ngược là số giây Google yêu cầu chờ để cửa sổ một phút trôi qua, ` +
      `không phải cam kết lượt sau sẽ lọt. Hết giờ mà vẫn 429 nghĩa là chính lượt vừa gửi đã lớn hơn hạn mức đó ` +
      `(ngữ cảnh và lịch sử gửi kèm quá dài), không phải đồng hồ sai. Hãy rút gọn ngữ cảnh, hoặc dùng key có hạn mức cao hơn.`
    );
  }
  return (
    'Đếm ngược là thời gian chờ Google đề nghị (hoặc 60 giây mặc định khi Google không nêu). ' +
    'Hết giờ mà vẫn 429 thì hạn mức bị cạn là loại theo ngày, hoặc một lượt gửi đang vượt hạn mức theo phút.'
  );
}

function rowText(row: KeySlotStatus, scope: QuotaScope | undefined): string {
  if (row.state === 'rejected') return 'bị từ chối';
  if (scope === 'day') return row.state === 'ready' ? 'hết hạn mức ngày' : `hết hạn mức ngày (chờ tối thiểu ${formatSecondsLeft(row.secondsLeft)})`;
  if (row.state === 'ready') return 'còn dùng được';
  return `hồi sau ${formatSecondsLeft(row.secondsLeft)}`;
}

export function quotaModalView(
  keys: readonly string[],
  cooldownUntil: Record<string, number>,
  nowSec: number,
  source: QuotaSource = 'platform',
  extra: QuotaModalExtra = {},
): QuotaModalView {
  const scopeByKey = extra.scopeByKey || {};
  const status = keyPoolStatus(keys, cooldownUntil, nowSec).map((r) => ({
    ...r,
    label: quotaRowLabel(r.index, source),
    scope: scopeByKey[keys[r.index]] as QuotaScope | undefined,
  }));
  const perKeyTokens = extra.usage?.tokensLastMinuteByKey || {};
  const rows = status.map((r) => {
    const used = perKeyTokens[keys[r.index]];
    const row: QuotaModalRow = {
      index: r.index,
      label: r.label,
      text: rowText(r, r.scope),
      tone: r.scope === 'day' && r.state !== 'rejected' ? 'bad' : TONE[r.state],
    };
    if (typeof used === 'number' && used > 0) row.sub = `đã gửi ${formatInt(used)} token trong 60 giây qua`;
    return row;
  });
  const headline = HEADLINE[source];
  const hint = [quotaHint(extra.quotaInfo, nowSec), usageSentence(extra.usage, extra.quotaInfo)].filter(Boolean).join(' ');

  // A key whose DAY bucket is gone is not "ready" just because its breaker
  // expired — the next request would answer 429 again.
  const ready = status.filter((r) => r.state === 'ready' && r.scope !== 'day');
  if (ready.length > 0) {
    const names = ready.map((r) => `"${r.label}"`).join(' hoặc ');
    return {
      headline,
      rows,
      advice:
        source === 'platform'
          ? `${names} đã sẵn sàng — bấm "Thử Lại" để chơi tiếp, hoặc chọn key đó ở mục "Key AI Ưu Tiên" trong Thiết Lập API Key.`
          : `${names} đã sẵn sàng — bấm "Thử Lại" để chơi tiếp, hệ thống sẽ tự dùng key còn rảnh.`,
      hint,
      buttonLabel: 'Thử Lại',
      anyReady: true,
    };
  }

  // A rejected key never recovers, and a day-exhausted key does not recover
  // with its breaker, so neither can be the one to wait for.
  const recovering = status.filter((r) => r.state === 'quota' && r.scope !== 'day');
  const soonest = recovering.reduce<(typeof status)[number] | null>(
    (best, r) => (best === null || r.secondsLeft < best.secondsLeft ? r : best),
    null,
  );
  // "Waiting does not help" only when a DAY bucket is actually involved —
  // a pool of purely rejected keys is a different problem (wrong keys).
  const allDay =
    status.some((r) => r.scope === 'day') && status.every((r) => r.scope === 'day' || r.state === 'rejected');

  let advice: string;
  if (soonest) {
    advice = `Chưa key nào rảnh. Key hồi sớm nhất là "${soonest.label}" — bảng trên tự cập nhật, hết giờ là bấm "Thử Lại" được ngay.`;
  } else if (allDay) {
    advice =
      source === 'platform'
        ? 'Mọi key nền tảng đều đã cạn hạn mức NGÀY — đợi không giúp. Hãy nhập API Key Gemini của riêng ngươi ở "Thiết Lập API Key".'
        : 'Mọi key đều đã cạn hạn mức NGÀY — đợi không giúp. Hãy dùng một API Key của dự án Google khác.';
  } else if (source === 'platform') {
    advice = 'Không key nào còn dùng được. Hãy nhập API Key Gemini của riêng ngươi ở "Thiết Lập API Key".';
  } else {
    advice =
      'Không key nào còn dùng được. Hãy kiểm tra lại API Key riêng của ngươi ở "Thiết Lập API Key" (key sai hoặc đã hết hạn), hoặc nhập một key khác.';
  }

  return {
    headline,
    rows,
    advice,
    hint,
    buttonLabel: 'Tuân Mệnh',
    anyReady: false,
  };
}
