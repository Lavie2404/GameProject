/**
 * Rule 1.5, second half: Vietnamese must be written WITH its diacritics.
 *
 * Reported 2026-09-23 (world-setup, "Thân phận / Vai trò" suggest button):
 *   "Mat su an danh tu Thuong Son, che giau than phan that de am tham tim
 *    kiem minh chu pho ta."
 * Every letter is Latin, so `foreignScript.ts` (which detects other writing
 * systems) saw nothing wrong. This module detects the complementary defect:
 * a stretch of text that reads as Vietnamese but carries no diacritic at all.
 *
 * HEURISTIC, on purpose
 * A run of >= MIN_WORDS words with (a) zero Vietnamese-specific letters and
 * (b) at least MIN_MARKERS words from a small list of high-frequency
 * Vietnamese function words as they look when stripped of diacritics
 * ("va", "cua", "mot", "khong", "nguoi"...). (b) is what keeps an English
 * name, a code, or a single foreign proper noun from being flagged: "John
 * Smith" has no markers; "than phan that de am tham tim kiem" has several.
 * Real Vietnamese prose trips (a) within a handful of words, so a false
 * positive needs long, marker-rich, diacritic-free text - which is exactly
 * the defect.
 *
 * Like foreignScript.ts this measures; it never edits the text.
 */

/** Any letter that only exists in Vietnamese orthography (incl. tone marks). */
const VIETNAMESE_LETTER_RE = /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ]/;

/**
 * High-frequency Vietnamese words as they appear once diacritics are dropped.
 * Kept short and unambiguous; "a", "o", "co" are deliberately absent because
 * they collide with English/other tokens too often.
 */
export const STRIPPED_VIETNAMESE_MARKERS: ReadonlySet<string> = new Set([
  'va', 'cua', 'la', 'mot', 'nguoi', 'khong', 'duoc', 'trong', 'nhung', 'cho', 'den',
  'voi', 'nay', 'da', 'se', 'dang', 'khi', 'thi', 'ma', 'nhu', 'cung', 'con', 'de', 've',
  'tren', 'ra', 'vao', 'chua', 'rat', 'nhieu', 'tung', 'bi', 'noi', 'lam', 'tim', 'than',
  'phan', 'minh', 'ta', 'nguoi', 'ke', 'toi', 'ban', 'chang', 'nang', 'ho', 'gia', 'that',
  'ly', 'thanh', 'trieu', 'tuong', 'quan', 'vuong', 'tien', 'phai', 'mon', 'cao', 'thu',
]);

export const MISSING_DIACRITICS_MIN_WORDS = 5;
export const MISSING_DIACRITICS_MIN_MARKERS = 2;

export interface MissingDiacriticsRun {
  /** The diacritic-free text that looks Vietnamese (trimmed). */
  text: string;
  /** How many marker words supported the verdict. */
  markers: number;
}

/**
 * Non-empty when `text` looks like Vietnamese typed without diacritics.
 * Whole-string verdict: mixed text with even one Vietnamese letter is
 * accepted (the model clearly CAN write diacritics; a lone missing tone mark
 * is a typo, not this defect).
 */
export function findMissingDiacritics(text: unknown): MissingDiacriticsRun | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || VIETNAMESE_LETTER_RE.test(trimmed)) return null;
  const words = trimmed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length < MISSING_DIACRITICS_MIN_WORDS) return null;
  let markers = 0;
  for (const w of words) if (STRIPPED_VIETNAMESE_MARKERS.has(w)) markers++;
  if (markers < MISSING_DIACRITICS_MIN_MARKERS) return null;
  return { text: trimmed, markers };
}

export function hasMissingDiacritics(text: unknown): boolean {
  return findMissingDiacritics(text) !== null;
}

/** A missing-diacritics finding in one named field of an AI response. */
export interface DiacriticsViolation {
  field: string;
  run: MissingDiacriticsRun;
}

/** Same walk as `scanFieldsForForeignScript`: strings, arrays, nested objects. */
export function scanFieldsForMissingDiacritics(value: unknown, path = ''): DiacriticsViolation[] {
  if (typeof value === 'string') {
    const run = findMissingDiacritics(value);
    return run ? [{ field: path || '(root)', run }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => scanFieldsForMissingDiacritics(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      scanFieldsForMissingDiacritics(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

function shorten(s: string, max = 160): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/**
 * Corrective instruction for the one retry, quoting the offending text.
 * Names the field and the exact sentence: a generic "hãy viết có dấu" gets
 * the same output back (same lesson as `foreignScript.correctionInstruction`).
 */
export function diacriticsCorrectionInstruction(violations: readonly DiacriticsViolation[]): string {
  if (!violations.length) return '';
  const detail = violations.map((v) => `  - Trường "${v.field}": "${shorten(v.run.text)}"`).join('\n');
  return [
    '',
    'LỖI Ở LẦN TRẢ VỀ TRƯỚC — BẮT BUỘC SỬA:',
    'Phản hồi trước của ngươi viết tiếng Việt KHÔNG DẤU (thiếu toàn bộ dấu thanh và dấu chữ):',
    detail,
    'Hãy viết lại TOÀN BỘ bằng chữ Quốc ngữ CÓ ĐẦY ĐỦ DẤU (ă â đ ê ô ơ ư; sắc, huyền, hỏi, ngã, nặng).',
    'VD: "Mat su an danh tu Thuong Son" → "Mật sứ ẩn danh từ Thường Sơn". Giữ nguyên nội dung, chỉ bổ sung dấu.',
  ].join('\n');
}

/** One-line summary for a console warning. */
export function describeDiacriticsViolations(violations: readonly DiacriticsViolation[]): string {
  return violations.map((v) => `${v.field}: "${shorten(v.run.text, 60)}"`).join(' | ');
}
