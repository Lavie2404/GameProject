/**
 * Turn the AI session's per-key cooldown map into something a player can read.
 *
 * `requestAi` already records, per key, whether it is resting off a 429 and
 * until when (`session.key_cooldown_until`, set to +Infinity when the key was
 * rejected outright). None of that ever reached the screen: the quota error
 * said "the AI has run out of free usage" with no hint of WHICH key ran out or
 * whether a spare was still good, which is useless to someone holding three
 * keys and a "Key AI Ưu Tiên" picker.
 *
 * IMPORTANT — index vs slot: the pool handed to `requestAi` is REORDERED when
 * the player picks a preferred slot (see `orderPlatformKeysByPreferredSlot`),
 * so the `key_index` on a runtime event is a position in that rotated array,
 * NOT the slot the player sees in the dropdown. Labels here are therefore
 * derived from the CANONICAL pool order and matched by key string, so
 * "Key dự phòng 1" always means the same key the dropdown calls that.
 */

export type KeyState = 'ready' | 'quota' | 'rejected';

export interface KeySlotStatus {
  /** Canonical slot index: 0 is the primary key. */
  index: number;
  /** What the settings dropdown calls this slot. */
  label: string;
  state: KeyState;
  /** Seconds until this key is usable again; 0 when ready, Infinity when rejected. */
  secondsLeft: number;
}

/** Matches the wording of the "Key AI Ưu Tiên" dropdown. */
export function keySlotLabel(index: number): string {
  return index === 0 ? 'Key chính' : `Key dự phòng ${index}`;
}

/** "42 giây" / "2 phút 5 giây" — rounded up, because rounding down reads as a lie. */
export function formatSecondsLeft(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'không xác định';
  const total = Math.max(0, Math.ceil(seconds));
  if (total < 60) return `${total} giây`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return secs === 0 ? `${mins} phút` : `${mins} phút ${secs} giây`;
}

/**
 * One row per key of the canonical pool, in slot order.
 * `cooldownUntil` is keyed by the key string, exactly as `requestAi` writes it.
 */
export function keyPoolStatus(
  keys: readonly string[],
  cooldownUntil: Record<string, number>,
  nowSec: number,
): KeySlotStatus[] {
  return keys.map((key, index) => {
    const until = cooldownUntil[key] ?? 0;
    if (!Number.isFinite(until) && until > 0) {
      // requestAi parks a rejected key at +Infinity: it is not resting, it is broken.
      return { index, label: keySlotLabel(index), state: 'rejected' as const, secondsLeft: Infinity };
    }
    if (until > nowSec) {
      return { index, label: keySlotLabel(index), state: 'quota' as const, secondsLeft: until - nowSec };
    }
    return { index, label: keySlotLabel(index), state: 'ready' as const, secondsLeft: 0 };
  });
}

const STATE_TEXT: Record<KeyState, string> = {
  ready: 'còn dùng được',
  quota: 'đã hết quota',
  rejected: 'bị từ chối (key sai hoặc đã hết hạn)',
};

/**
 * The player-facing block appended to a quota error.
 *
 * Ends with an actionable line rather than just a table: when a spare is still
 * good, the fix is one dropdown away, and the error is the only place the
 * player is looking at that moment.
 */
export function formatKeyPoolStatus(rows: readonly KeySlotStatus[]): string {
  if (rows.length === 0) return '';

  const lines = rows.map((r) => {
    const detail =
      r.state === 'quota' ? `${STATE_TEXT.quota}, thử lại sau ${formatSecondsLeft(r.secondsLeft)}` : STATE_TEXT[r.state];
    return `  • ${r.label}: ${detail}`;
  });

  const ready = rows.filter((r) => r.state === 'ready');
  if (ready.length > 0) {
    const which = ready.length > 1 ? 'một trong số đó' : `"${ready[0].label}"`;
    const advice = `\n→ ${ready.map((r) => `"${r.label}"`).join(' hoặc ')} vẫn dùng được. Vào "Thiết Lập API Key" → mục "Key AI Ưu Tiên" và chọn ${which} để chơi tiếp ngay.`;
    return `\n\nTình trạng key nền tảng:\n${lines.join('\n')}${advice}`;
  }

  // Nothing usable right now. Naming the key that comes back FIRST, with its
  // wait, is the only actionable thing left — "đợi key sớm nhất hồi lại" without
  // saying which one or how long leaves the player guessing, and this is by far
  // the most common way the error is actually seen (a pool only reports 429
  // once every key in it has already been tried and refused).
  // A rejected key never recovers, so it is not a candidate.
  const recovering = rows.filter((r) => r.state === 'quota');
  const soonest = recovering.reduce<KeySlotStatus | null>(
    (best, r) => (best === null || r.secondsLeft < best.secondsLeft ? r : best),
    null,
  );
  const wait = soonest
    ? `Key hồi sớm nhất là "${soonest.label}" (sau ${formatSecondsLeft(soonest.secondsLeft)}) — đợi chừng đó rồi thử lại`
    : 'Không key nào còn dùng được';
  const advice = `\n→ Không còn key nền tảng nào rảnh. ${wait}, hoặc nhập API Key Gemini của riêng ngươi ở "Thiết Lập API Key" để dùng được ngay.`;
  return `\n\nTình trạng key nền tảng:\n${lines.join('\n')}${advice}`;
}

/** The whole block in one call; empty string when there is no pool to report on. */
export function describeKeyPool(
  keys: readonly string[],
  cooldownUntil: Record<string, number>,
  nowSec: number,
): string {
  return formatKeyPoolStatus(keyPoolStatus(keys, cooldownUntil, nowSec));
}
