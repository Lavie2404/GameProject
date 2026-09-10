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
 */

import { formatSecondsLeft, keyPoolStatus, type KeySlotStatus } from '../ai/keyPoolStatus';

/** Semantic tone, so the component picks colours and this file stays styling-free. */
export type QuotaRowTone = 'ok' | 'wait' | 'bad';

export interface QuotaModalRow {
  index: number;
  label: string;
  /** Right-hand text, already formatted for display. */
  text: string;
  tone: QuotaRowTone;
}

export interface QuotaModalView {
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

function rowText(row: KeySlotStatus): string {
  if (row.state === 'ready') return 'còn dùng được';
  if (row.state === 'rejected') return 'bị từ chối';
  return `hồi sau ${formatSecondsLeft(row.secondsLeft)}`;
}

export function quotaModalView(
  keys: readonly string[],
  cooldownUntil: Record<string, number>,
  nowSec: number,
): QuotaModalView {
  const status = keyPoolStatus(keys, cooldownUntil, nowSec);
  const rows = status.map((r) => ({ index: r.index, label: r.label, text: rowText(r), tone: TONE[r.state] }));

  const ready = status.filter((r) => r.state === 'ready');
  if (ready.length > 0) {
    const names = ready.map((r) => `"${r.label}"`).join(' hoặc ');
    return {
      rows,
      advice: `${names} đã sẵn sàng — bấm "Thử Lại" để chơi tiếp, hoặc chọn key đó ở mục "Key AI Ưu Tiên" trong Thiết Lập API Key.`,
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

  return {
    rows,
    advice: soonest
      ? `Chưa key nào rảnh. Key hồi sớm nhất là "${soonest.label}" — bảng trên tự cập nhật, hết giờ là bấm "Thử Lại" được ngay.`
      : 'Không key nào còn dùng được. Hãy nhập API Key Gemini của riêng ngươi ở "Thiết Lập API Key".',
    buttonLabel: 'Tuân Mệnh',
    anyReady: false,
  };
}
