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
 */

import { formatSecondsLeft, keyPoolStatus, keySlotLabel, type KeySlotStatus } from '../ai/keyPoolStatus';

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
}

export interface QuotaModalView {
  /** The one-line explanation above the table: which source ran out. */
  headline: string;
  rows: QuotaModalRow[];
  /** The sentence under the table telling the player what to do next. */
  advice: string;
  /** Button caption: an invitation when a key is free, an acknowledgement otherwise. */
  buttonLabel: string;
  /** True when at least one key is usable right now, so the button can lead. */
  anyReady: boolean;
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

function rowText(row: KeySlotStatus): string {
  if (row.state === 'ready') return 'còn dùng được';
  if (row.state === 'rejected') return 'bị từ chối';
  return `hồi sau ${formatSecondsLeft(row.secondsLeft)}`;
}

export function quotaModalView(
  keys: readonly string[],
  cooldownUntil: Record<string, number>,
  nowSec: number,
  source: QuotaSource = 'platform',
): QuotaModalView {
  const status = keyPoolStatus(keys, cooldownUntil, nowSec).map((r) => ({
    ...r,
    label: quotaRowLabel(r.index, source),
  }));
  const rows = status.map((r) => ({ index: r.index, label: r.label, text: rowText(r), tone: TONE[r.state] }));
  const headline = HEADLINE[source];

  const ready = status.filter((r) => r.state === 'ready');
  if (ready.length > 0) {
    const names = ready.map((r) => `"${r.label}"`).join(' hoặc ');
    return {
      headline,
      rows,
      advice:
        source === 'platform'
          ? `${names} đã sẵn sàng — bấm "Thử Lại" để chơi tiếp, hoặc chọn key đó ở mục "Key AI Ưu Tiên" trong Thiết Lập API Key.`
          : `${names} đã sẵn sàng — bấm "Thử Lại" để chơi tiếp, hệ thống sẽ tự dùng key còn rảnh.`,
      buttonLabel: 'Thử Lại',
      anyReady: true,
    };
  }

  // A rejected key never recovers, so it can never be the one to wait for.
  const recovering = status.filter((r) => r.state === 'quota');
  const soonest = recovering.reduce<KeySlotStatus | null>(
    (best, r) => (best === null || r.secondsLeft < best.secondsLeft ? r : best),
    null,
  );

  let advice: string;
  if (soonest) {
    advice = `Chưa key nào rảnh. Key hồi sớm nhất là "${soonest.label}" — bảng trên tự cập nhật, hết giờ là bấm "Thử Lại" được ngay.`;
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
    buttonLabel: 'Tuân Mệnh',
    anyReady: false,
  };
}
