/**
 * Starting age of the player character, and the timeline rule that keeps
 * every AI inference (role, backstory, appearance, goal, opening scene,
 * narration) consistent with it.
 *
 * Requested 2026-09-23: "Thêm chức năng độ tuổi bắt đầu. Khi cho AI suy diễn
 * cũng sẽ bám vào các mốc thời gian trong độ tuổi của nhân vật."
 *
 * WHY A RULE AND NOT JUST A NUMBER
 * A bare "Tuổi: 20" in the context is easy to ignore. The failure this guards
 * against is specific: a known figure (Triệu Vân at 20) being given the
 * career of the same figure at 45, or a fresh character with "ba mươi năm
 * luyện kiếm" at age 18. The rule states the arithmetic and the canon
 * timeline constraint explicitly, with a worked example.
 *
 * TIME MODEL
 * The game clock is `{ year, month, day, hour }` starting at year 0, month 1,
 * day 1, with a 360-day year (12 x 30) everywhere in App.tsx. Current age is
 * the starting age plus whole elapsed years on that calendar.
 *
 * Pure module: no React, no I/O, no RNG.
 */

export const MIN_STARTING_AGE = 1;
/** Immortal cultivators exist; a sane upper bound still catches typos. */
export const MAX_STARTING_AGE = 10000;

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

/** Integer within [MIN, MAX], or null for blank / non-numeric / out-of-range. */
export function parseStartingAge(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < MIN_STARTING_AGE || i > MAX_STARTING_AGE) return null;
  return i;
}

export interface GameTimeLike {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

/** Whole days since the game clock's origin (year 0, month 1, day 1). */
export function elapsedDays(time: GameTimeLike | null | undefined): number {
  const year = Number(time?.year) || 0;
  const month = Number(time?.month) || 1;
  const day = Number(time?.day) || 1;
  return Math.max(0, year * DAYS_PER_YEAR + (month - 1) * DAYS_PER_MONTH + (day - 1));
}

/** Starting age plus whole elapsed years; null when there is no starting age. */
export function currentAge(startingAge: unknown, time: GameTimeLike | null | undefined): number | null {
  const start = parseStartingAge(startingAge);
  if (start === null) return null;
  return start + Math.floor(elapsedDays(time) / DAYS_PER_YEAR);
}

// ---------------------------------------------------------------------------
// Prompt text
// ---------------------------------------------------------------------------

/** Context line for the world-setup prompts (same shape as the other lines). */
export function ageContextLine(startingAge: unknown): string {
  const age = parseStartingAge(startingAge);
  return `- Độ tuổi bắt đầu: "${age === null ? '[Chưa có]' : `${age} tuổi`}"`;
}

/** Mission text for the suggest button and "Điền Tự Động". */
export const CHARACTER_AGE_MISSION =
  'xác định MỘT độ tuổi bắt đầu (số nguyên dương, tính bằng năm): nếu nhân vật có sẵn trong lịch sử/nguyên tác, ' +
  'chọn tuổi tại mốc thời gian câu chuyện nên bắt đầu và ghi rõ mốc đó trong tiểu sử; nếu nhân vật mới, chọn tuổi ' +
  'hợp với thân phận/tiểu sử đã có';

/** The rule block shared by every prompt that infers character details. */
export const AGE_TIMELINE_RULE = [
  'QUY TẮC ĐỘ TUỔI & MỐC THỜI GIAN (ÁP DỤNG CHO MỌI CHI TIẾT SUY DIỄN):',
  '- Mọi chi tiết suy diễn (thân phận, tiểu sử, ngoại hình, mục tiêu, kỹ năng/thiên phú khởi đầu) PHẢI khớp với độ tuổi bắt đầu: ' +
    'số năm học nghệ/tu luyện/từng trải không được vượt quá số tuổi trừ đi thời thơ ấu; ngoại hình tả đúng lứa tuổi; ' +
    'mục tiêu hợp với giai đoạn đời; xưng hô của người khác với nhân vật hợp với tuổi.',
  '- NẾU nhân vật có sẵn trong lịch sử/nguyên tác: lấy ĐÚNG mốc thời gian mà nhân vật ở độ tuổi đó theo lịch sử/nguyên tác. ' +
    'Thân phận là thân phận TẠI thời điểm đó; tiểu sử CHỈ gồm những gì đã xảy ra TRƯỚC hoặc TẠI độ tuổi đó; ' +
    'không kể sự kiện tương lai như đã xảy ra, không gán chức vụ/danh hiệu nhân vật chưa có ở tuổi đó.',
  '- VÍ DỤ: "Triệu Vân" 20 tuổi → thanh niên Thường Sơn mới theo Công Tôn Toản, chưa gặp Lưu Bị, chưa có trận Trường Bản. ' +
    '"Triệu Vân" 45 tuổi → đại tướng Thục Hán, đã qua Trường Bản và Hán Trung.',
  '- NẾU độ tuổi là "[Chưa có]": tự chọn một tuổi hợp lý theo thân phận/tiểu sử (nhân vật có sẵn: tuổi tại mốc câu chuyện nên bắt đầu) ' +
    'rồi bám theo tuổi đó trong mọi chi tiết khác.',
].join('\n');

/**
 * One sentence for the per-turn narration prompts, or '' when no age is set.
 * Callers add their own bullet/indent, so an unset age costs no blank line.
 */
export function ageNarrationLine(startingAge: unknown, time: GameTimeLike | null | undefined): string {
  const start = parseStartingAge(startingAge);
  if (start === null) return '';
  const now = currentAge(start, time) as number;
  const sinceStart = now > start ? ` (bắt đầu hành trình ở ${start} tuổi)` : '';
  return (
    `Tuổi hiện tại của nhân vật chính: ${now} tuổi${sinceStart}. ` +
    'Miêu tả ngoại hình, cách người khác xưng hô, quan hệ và những gì nhân vật "đã từng trải" phải phù hợp lứa tuổi này.'
  );
}

/**
 * For the game-opening prompt: pins the story's starting point on the
 * character's own timeline (matters for historical / canon figures).
 */
export function ageOpeningLine(startingAge: unknown): string {
  const start = parseStartingAge(startingAge);
  if (start === null) return '';
  return (
    `Độ tuổi bắt đầu của nhân vật chính: ${start} tuổi. Câu chuyện mở đầu tại đúng mốc thời gian mà nhân vật ở tuổi này ` +
    '(với nhân vật lịch sử/nguyên tác: bối cảnh, thân phận, các nhân vật xung quanh và sự kiện đã xảy ra phải đúng với thời điểm đó; ' +
    'những gì xảy ra sau tuổi này chưa tồn tại).'
  );
}
