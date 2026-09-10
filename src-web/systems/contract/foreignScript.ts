/**
 * Deterministic guard for rule 1.5 (see `languagePurity.ts`): find writing
 * systems that must never appear in AI-authored Vietnamese text.
 *
 * Why a code-level check and not just the prompt rule: the narration prompt
 * HAS carried rule 1.5 all along and still leaked — the git history is a
 * series of commits bolting fresh counter-examples onto it ("физи", "tâm念",
 * "supple"). A prompt instruction is a request; this is a measurement. It
 * cannot fix the text on its own, but it can tell the caller the model broke
 * the rule so the call can be retried instead of the defect being written
 * into the save file.
 *
 * Scope note: this detects SCRIPT, not language. Rule 1.5 also bans whole
 * English words, which are written in the same Latin script as Vietnamese and
 * therefore cannot be caught this way without a dictionary — English leakage
 * stays a prompt-only constraint. What is caught here is exactly the class of
 * defect that is unambiguous: a character from a different writing system.
 */

/** One contiguous run of same-script foreign characters. */
export interface ForeignRun {
  /** The offending substring, e.g. "貌". */
  text: string;
  /** Index of the run's first character within the scanned string. */
  index: number;
  /** Which writing system it belongs to. */
  script: ForeignScript;
}

export type ForeignScript = 'Hán' | 'Kana' | 'Hangul' | 'Kirin';

/**
 * Ranges are listed per script so a report can name the culprit ("chữ Hán"
 * reads far better in a Vietnamese warning than a code point).
 *
 * CJK Extension B and beyond live above U+FFFF, so the source must be scanned
 * by code point (for..of / \u{...} with the `u` flag), never by UTF-16 unit —
 * otherwise a surrogate pair reads as two unrelated characters.
 */
const SCRIPT_PATTERNS: ReadonlyArray<readonly [ForeignScript, RegExp]> = [
  // Han: CJK Unified Ideographs + Ext A + Compatibility + Ext B..F.
  ['Hán', /[㐀-䶿一-鿿豈-﫿]|[\u{20000}-\u{2FA1F}]/u],
  // Japanese kana (Hiragana + Katakana, incl. halfwidth).
  ['Kana', /[぀-ゟ゠-ヿｦ-ﾝ]/u],
  // Korean Hangul (syllables + jamo).
  ['Hangul', /[가-힯ᄀ-ᇿ㄰-㆏]/u],
  // Cyrillic ("Kirin" in the rule's wording).
  ['Kirin', /[Ѐ-ӿԀ-ԯ]/u],
];

/** Which foreign script a single code point belongs to, if any. */
export function scriptOf(char: string): ForeignScript | null {
  for (const [script, re] of SCRIPT_PATTERNS) {
    if (re.test(char)) return script;
  }
  return null;
}

/**
 * Every run of foreign-script characters in `text`, in order of appearance.
 * Adjacent characters of the same script are merged into one run so that a
 * four-character Han phrase is reported once, not four times.
 */
export function findForeignRuns(text: unknown): ForeignRun[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const runs: ForeignRun[] = [];
  let index = 0;
  for (const char of text) {          // iterates by code point, not UTF-16 unit
    const script = scriptOf(char);
    if (script) {
      const last = runs[runs.length - 1];
      if (last && last.script === script && last.index + last.text.length === index) {
        last.text += char;
      } else {
        runs.push({ text: char, index, script });
      }
    }
    index += char.length;             // advance by 2 across a surrogate pair
  }
  return runs;
}

/** Fast path for callers that only need a yes/no. */
export function hasForeignScript(text: unknown): boolean {
  return findForeignRuns(text).length > 0;
}

/** A rule-1.5 violation found in one named field of an AI response. */
export interface FieldViolation {
  field: string;
  runs: ForeignRun[];
}

/**
 * Scan the string-valued properties of a parsed AI response. Nested objects
 * and arrays are walked too, since some schemas nest prose (quest steps, item
 * effect lists), and the field path is reported dotted so the warning points
 * at the actual offender.
 */
export function scanFieldsForForeignScript(value: unknown, path = ''): FieldViolation[] {
  if (typeof value === 'string') {
    const runs = findForeignRuns(value);
    return runs.length ? [{ field: path || '(root)', runs }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => scanFieldsForForeignScript(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      scanFieldsForForeignScript(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

/**
 * A corrective instruction to append to the prompt on a retry, naming exactly
 * what came back wrong. Being specific matters: a generic "hãy viết tiếng
 * Việt" reliably produces the same output again.
 */
export function correctionInstruction(violations: readonly FieldViolation[]): string {
  const detail = violations
    .map((v) => `  - Trường "${v.field}": ${v.runs.map((r) => `"${r.text}" (${r.script})`).join(', ')}`)
    .join('\n');
  return [
    '',
    'LỖI Ở LẦN TRẢ VỀ TRƯỚC — BẮT BUỘC SỬA:',
    'Phản hồi trước của ngươi có lẫn ký tự KHÔNG PHẢI chữ Quốc ngữ:',
    detail,
    'Hãy viết lại TOÀN BỘ, thay mỗi ký tự đó bằng âm Hán Việt tương ứng viết bằng chữ Quốc ngữ',
    '(VD: 貌 → "mạo", nên "Dung貌" phải là "Dung mạo"; 念 → "niệm"). TUYỆT ĐỐI không giữ lại,',
    'và cũng KHÔNG được xoá trắng làm mất nghĩa câu.',
  ].join('\n');
}

/** One-line summary for a console warning. */
export function describeViolations(violations: readonly FieldViolation[]): string {
  return violations
    .map((v) => `${v.field}: ${v.runs.map((r) => `${r.text}[${r.script}]`).join(' ')}`)
    .join(' | ');
}
