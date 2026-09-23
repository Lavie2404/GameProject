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
  /**
   * Courtesy names this character USED to have (player renamed them, or an
   * AI-suggested one was replaced). The story history still carries them, so
   * the model keeps copying them; `replaceFormerCourtesyNames` fixes the text.
   */
  formerCourtesyNames?: readonly string[];
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
 * <dialogue> tag. Inside dialogue only the bracketed gloss "(tự X)" is
 * removed; introductions and direct address are left exactly as spoken.
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

  // Inside dialogue (2026-09-11, player rule): a courtesy name may be used to
  // INTRODUCE ("Tôn Kiên, tự Văn Đài") or to ADDRESS someone directly — never
  // as a bracketed gloss on a third party ("Lữ Bố (tự Phụng Tiên) tuy dũng
  // mãnh..."). Only the bracketed form is removed here; the appositive
  // introduction is legitimate speech and stays.
  const scrubDialogue = (block: string): string =>
    block.replace(PAREN_GENERIC, (mm) => {
      changes.push(`xoá "${mm.trim()}" trong lời thoại`);
      return '';
    });

  let result = '';
  let last = 0;
  DIALOGUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIALOGUE_RE.exec(text)) !== null) {
    result += scrubPart(text.slice(last, m.index)) + scrubDialogue(m[0]);
    last = m.index + m[0].length;
  }
  result += scrubPart(text.slice(last));
  return { text: result, changes };
}

/** Convenience for callers that only want the cleaned text. */
export function scrubCourtesyNames(text: string, characters?: readonly CharacterNameLike[]): string {
  return scrubCourtesyNamesOutsideDialogue(text, characters).text;
}

/**
 * Replace a character's FORMER courtesy names with the current one, in prose
 * and in dialogue alike (reported 2026-09-23: Chân Cơ was renamed from "Văn
 * Cơ" to "Văn Chiêu" on the card, the narration kept saying "Văn Cơ" because
 * the history did). Deterministic text fix, applied before the story is
 * parsed so the old name never re-enters the history.
 *
 * Skipped for safety when the former name is a single syllable, is contained
 * in any character's main name, or is another character's current name or
 * courtesy name - a blind replacement there would mangle ordinary text.
 */
export function replaceFormerCourtesyNames(
  text: string,
  characters?: readonly CharacterNameLike[],
): CourtesyScrubResult {
  if (typeof text !== 'string' || text.length === 0 || !characters?.length) return { text: text ?? '', changes: [] };
  const allNames = new Set<string>();
  for (const c of characters) {
    for (const n of [c?.Name, c?.CourtesyName]) {
      const t = String(n || '').trim();
      if (t) allNames.add(t.toLowerCase());
    }
  }
  const changes: string[] = [];
  let out = text;
  for (const c of characters) {
    const current = String(c?.CourtesyName || '').trim();
    if (!current) continue;
    for (const formerRaw of c?.formerCourtesyNames || []) {
      const former = String(formerRaw || '').trim();
      if (!former || former === current) continue;
      if (former.split(/\s+/).length < 2) continue;
      if (allNames.has(former.toLowerCase())) continue;
      const containedInAName = characters.some((k) => {
        const n = String(k?.Name || '');
        return n && new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(former)}(?![\\p{L}\\p{M}])`, 'u').test(n);
      });
      if (containedInAName) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(former)}(?![\\p{L}\\p{M}])`, 'gu');
      out = out.replace(re, () => {
        changes.push(`"${former}" -> "${current}" (tự cũ của ${String(c?.Name || '')})`);
        return current;
      });
    }
  }
  return { text: out, changes };
}

/**
 * Bookkeeping for a courtesy-name change: returns the updated character with
 * the previous name remembered in `formerCourtesyNames` (deduplicated, and
 * the new name removed from it if it had been a former one).
 */
export function withCourtesyNameChange<T extends CharacterNameLike>(character: T, next: string | null | undefined): T {
  const current = String(character?.CourtesyName || '').trim();
  const target = String(next || '').trim();
  const formers = new Set((character?.formerCourtesyNames || []).map((s) => String(s || '').trim()).filter(Boolean));
  if (current && current !== target) formers.add(current);
  formers.delete(target);
  const updated: T = { ...character };
  if (target) (updated as CharacterNameLike).CourtesyName = target;
  else delete (updated as CharacterNameLike).CourtesyName;
  if (formers.size) (updated as CharacterNameLike).formerCourtesyNames = [...formers];
  else delete (updated as CharacterNameLike).formerCourtesyNames;
  return updated;
}

/**
 * The `(Tự: X)` tag for a prompt's character line, naming any abandoned
 * courtesy names so the model has a data reason not to reuse them.
 */
export function courtesyNamePromptTag(character: CharacterNameLike | null | undefined): string {
  const current = String(character?.CourtesyName || '').trim();
  const formers = (character?.formerCourtesyNames || []).map((s) => String(s || '').trim()).filter((s) => s && s !== current);
  if (!current && !formers.length) return '';
  const formerNote = formers.length ? `; tự cũ ${formers.map((f) => `"${f}"`).join(', ')} ĐÃ BỎ, không dùng` : '';
  return current ? ` (Tự: ${current}${formerNote})` : ` (không có Tự${formerNote})`;
}
