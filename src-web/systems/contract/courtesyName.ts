/**
 * Courtesy names ("tự" / tên chữ) belong in dialogue only.
 *
 * The narration prompt has carried an absolute rule since 2026-09-10 (commit
 * 013c814): the narrator always uses the main name; a courtesy name may only
 * appear inside <dialogue>…</dialogue>. The model still writes things like
 *   Đó chính là "Mãnh Hổ Giang Đông" *Tôn Kiên* (tự Văn Đài)!
 * in plain narration (reported again 2026-09-11). A prompt instruction is a
 * request; this module is the enforcement: the story text is scrubbed before
 * it is parsed into segments, so the defect never reaches the story log, the
 * save file, or the next prompt's history.
 *
 * Two tiers, applied ONLY to text outside <dialogue> tags:
 *
 *   1. Generic (no roster needed) — the annotation forms the model actually
 *      produces, which are unambiguous on their own:
 *        "Tôn Kiên (tự Văn Đài)"      -> "Tôn Kiên"
 *        "Tôn Kiên, tự Văn Đài, …"    -> "Tôn Kiên, …"
 *        "Tôn Kiên tự là Văn Đài"     -> "Tôn Kiên"
 *      The appositive form requires a capitalised name right before "tự" so
 *      the everyday word "tự" (tự nhiên, tự mình, để tự Diệp Thần quyết định)
 *      is never touched.
 *
 *   2. Roster — when the character list is known, a courtesy name used on its
 *      own ("*Văn Đài* cười lớn", "Tôn Văn Đài") is replaced by the main name,
 *      because the narrator must say "Tôn Kiên". Skipped for single-syllable
 *      courtesy names and for names contained in the main name (e.g. Name
 *      "Thái Diễm", CourtesyName "Diễm"), where a blind replacement would
 *      mangle ordinary text.
 */

export interface CharacterNameLike {
  Name?: string;
  CourtesyName?: string;
}

export interface CourtesyScrubResult {
  text: string;
  /** Human-readable list of what was removed or replaced, for a console warning. */
  changes: string[];
}

/** A capitalised word: Vietnamese letters are precomposed, \p{M} covers the rest. */
const CAP = '\\p{Lu}[\\p{Ll}\\p{M}]*';
/** A personal name as the narrator writes it: 1-4 capitalised words. */
const NAME = `${CAP}(?:\\s+${CAP}){0,3}`;
/** A courtesy name is 1-2 syllables. */
const COURTESY = `${CAP}(?:\\s+${CAP})?`;
/** "tự" or "tự là", optionally star-wrapped by the lore markup. */
const TU = '\\*?tự(?:\\s+là)?\\s+\\*?';

/** "(tự X)", "（tự X）", "[tự X]" — always an annotation, always removable. */
const PAREN_GENERIC = new RegExp(`\\s*[\\(（\\[]\\s*${TU}${COURTESY}\\*?\\s*[\\)）\\]]`, 'gu');
/** "Tên tự X" / "Tên, tự X" — keep the name, drop the appositive. */
const APPOSITIVE_GENERIC = new RegExp(`(${NAME}\\*?)\\s*,?\\s+${TU}${COURTESY}\\*?`, 'gu');

const DIALOGUE_RE = /<dialogue\b[^>]*>[\s\S]*?<\/dialogue>/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripGeneric(text: string, changes: string[]): string {
  let out = text.replace(PAREN_GENERIC, (m) => {
    changes.push(`xoá "${m.trim()}"`);
    return '';
  });
  out = out.replace(APPOSITIVE_GENERIC, (m, keep: string) => {
    changes.push(`xoá "${m.slice(keep.length).trim()}" sau "${keep}"`);
    return keep;
  });
  return out;
}

interface RosterEntry {
  name: string;
  courtesy: string;
  surname: string | null;
  annotation: RegExp;
  standalone: RegExp | null;
}

function buildRoster(characters: readonly CharacterNameLike[] | undefined): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const c of characters || []) {
    const name = String(c?.Name || '').trim();
    const courtesy = String(c?.CourtesyName || '').trim();
    if (!name || !courtesy || name === courtesy) continue;
    const nameWords = name.split(/\s+/);
    const courtesyWords = courtesy.split(/\s+/);
    const esc = escapeRe(courtesy);
    // Annotation forms with THIS courtesy name need no preceding-name guard.
    const annotation = new RegExp(
      `\\s*[\\(（\\[]\\s*${TU}${esc}\\*?\\s*[\\)）\\]]|\\s*,?\\s+${TU}${esc}\\*?`,
      'gu',
    );
    const containedInName = new RegExp(`(?<![\\p{L}\\p{M}])${esc}(?![\\p{L}\\p{M}])`, 'u').test(name);
    const surname = nameWords.length >= 2 ? nameWords[0] : null;
    const standalone =
      courtesyWords.length >= 2 && !containedInName
        ? new RegExp(
            `(?<![\\p{L}\\p{M}])(?:${surname ? escapeRe(surname) + '\\s+' : ''})?${esc}(?![\\p{L}\\p{M}])`,
            'gu',
          )
        : null;
    out.push({ name, courtesy, surname, annotation, standalone });
  }
  return out;
}

function applyRoster(text: string, roster: readonly RosterEntry[], changes: string[]): string {
  let out = text;
  for (const r of roster) {
    out = out.replace(r.annotation, (m) => {
      changes.push(`xoá "${m.trim()}" (tự của ${r.name})`);
      return '';
    });
    if (r.standalone) {
      out = out.replace(r.standalone, (m) => {
        changes.push(`"${m}" -> "${r.name}"`);
        return r.name;
      });
    }
  }
  return out;
}

/**
 * Scrub courtesy-name usage from every part of `text` that is NOT inside a
 * <dialogue> tag. Dialogue is returned byte-for-byte.
 */
export function scrubCourtesyNamesOutsideDialogue(
  text: string,
  characters?: readonly CharacterNameLike[],
): CourtesyScrubResult {
  if (typeof text !== 'string' || text.length === 0) return { text: text ?? '', changes: [] };
  const roster = buildRoster(characters);
  const changes: string[] = [];
  const scrubPart = (part: string): string => {
    if (!part) return part;
    let out = stripGeneric(part, changes);
    if (roster.length) out = applyRoster(out, roster, changes);
    return out;
  };

  let result = '';
  let last = 0;
  DIALOGUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIALOGUE_RE.exec(text)) !== null) {
    result += scrubPart(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  result += scrubPart(text.slice(last));
  return { text: result, changes };
}

/** Convenience for callers that only want the cleaned text. */
export function scrubCourtesyNames(text: string, characters?: readonly CharacterNameLike[]): string {
  return scrubCourtesyNamesOutsideDialogue(text, characters).text;
}
