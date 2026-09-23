/**
 * Narration lint - the post-hoc MEASURE for Pillar 1 ("The Gioi Khach Quan")
 * and for NPC line repetition.
 *
 * Design docs: design/gdd/game-concept.md "Pillar 1" (lines 243-255) and the
 * Anti-Pillars (326-332); src-web/systems/contract/narrationDirectives.ts
 * (the prompt-side rules this module checks the OUTPUT against);
 * tests/golden/narration/README.md (the golden scenario playbook).
 *
 * WHY THIS EXISTS
 * The Pillar-1 prompt directives are advice, not a constraint (game-concept.md
 * 318-324 says so in as many words). Nothing in the app read the narration
 * back to see whether the advice was followed. This module is that reader.
 * It is deliberately shallow: phrase lists + a token-bigram similarity, all of
 * it configurable from gameConfig.js `narrationLint`, so a designer can tune
 * it without touching code (coding-standards.md "data-driven").
 *
 * WHAT IT NEVER DOES
 * - It never edits the narration, never blocks a turn, never talks to the AI.
 *   It compares and reports. Whoever calls it decides what to do (today: log +
 *   golden capture; later steps may re-request the turn).
 * - It never reads numbers out of the narration (that is leakDetector.ts's
 *   job and its R3 whitelist).
 *
 * Pure module: no React, no I/O, no RNG, no Date.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogueLine {
  speaker: string;
  content: string;
}

export interface LintNpc {
  name: string;
  level: number;
  /** -100..100, gdd-03 scale. Missing data reads as 0 (stranger). */
  affinity: number;
  isCompanion?: boolean;
}

export interface LintContext {
  player: { name: string; level: number };
  /** NPCs that can plausibly speak this turn (present + companions). */
  npcs: LintNpc[];
  /** Dialogue lines from earlier turns, oldest first. */
  recentLines: DialogueLine[];
}

export interface NarrationLintKnobs {
  /** Narrator-voice superiority claims. Matched OUTSIDE <dialogue> only. */
  OBJECTIVE_PRAISE_PHRASES: readonly string[];
  /** Generic, unearned praise. Matched INSIDE NPC <dialogue> only. */
  GENERIC_PRAISE_PHRASES: readonly string[];
  /** NPC at least this many levels above the player is "be tren" for tone. */
  SUPERIOR_NPC_LEVEL_GAP: number;
  /** Token-bigram Jaccard at or above this counts as a repeated line (0..1]. */
  REPEAT_SIMILARITY_THRESHOLD: number;
  /** How many of a speaker's most recent lines a new line is compared against. */
  REPEAT_WINDOW_PER_SPEAKER: number;
  /** Lines shorter than this many tokens are never "repeats" ("Um.", "Di thoi."). */
  REPEAT_MIN_TOKENS: number;
}

export type LintViolationKind =
  | 'objective_praise'
  | 'ungrounded_praise'
  | 'superior_overpraise'
  | 'repeated_line';

export interface LintViolation {
  kind: LintViolationKind;
  /** Speaker for dialogue findings; `undefined` for narrator-voice findings. */
  speaker?: string;
  /** The offending text (a dialogue line, or a narration window around the hit). */
  excerpt: string;
  /** The phrase that matched, or the earlier line this one repeats. */
  matched: string;
  /** Only for `repeated_line`. */
  similarity?: number;
}

export interface NarrationLintReport {
  violations: LintViolation[];
  counts: Record<LintViolationKind, number>;
  dialogue_count: number;
  narration_chars: number;
}

// ---------------------------------------------------------------------------
// Defaults (registry-style; gameConfig.js `narrationLint` overrides them)
// ---------------------------------------------------------------------------

/**
 * Seeded from the banned examples already written into the Pillar-1 prompt
 * directives, so prompt and lint disagree about nothing.
 */
export const DEFAULT_NARRATION_LINT_KNOBS: NarrationLintKnobs = {
  OBJECTIVE_PRAISE_PHRASES: [
    'thiên phú nghìn năm có một',
    'thiên phú vô song',
    'kẻ mạnh nhất nơi này',
    'ai cũng phải thừa nhận',
    'khiến cả đám cao thủ chấn động',
    'khí thế kinh người',
    'trong mắt hiện lên vẻ tán thưởng',
    'quyết định sẽ dõi theo',
    'kỳ tài trăm năm',
    'vạn năm có một',
    'nghìn năm có một',
    'trăm năm hiếm có',
    'không ai sánh bằng',
    'tuyệt thế kỳ tài',
  ],
  GENERIC_PRAISE_PHRASES: [
    'thiên tài',
    'vô song',
    'phi phàm',
    'kỳ tài',
    'tuyệt thế',
    'vạn năm có một',
    'nghìn năm có một',
    'trăm năm hiếm có',
    'tương lai vô hạn',
    'tiền đồ vô lượng',
    'đỉnh thiên hạ',
    'không ai sánh bằng',
    'thiên tư hơn người',
  ],
  SUPERIOR_NPC_LEVEL_GAP: 10,
  REPEAT_SIMILARITY_THRESHOLD: 0.6,
  REPEAT_WINDOW_PER_SPEAKER: 6,
  REPEAT_MIN_TOKENS: 4,
};

export class NarrationLintConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrationLintConfigError';
  }
}

/** Fail-loud at load, same policy as the EXP / affinity knob blocks. */
export function assertNarrationLintKnobs(knobs: Partial<NarrationLintKnobs>): NarrationLintKnobs {
  const k = { ...DEFAULT_NARRATION_LINT_KNOBS, ...stripUndefined(knobs) };
  for (const listName of ['OBJECTIVE_PRAISE_PHRASES', 'GENERIC_PRAISE_PHRASES'] as const) {
    const list = k[listName];
    if (!Array.isArray(list) || list.length === 0) {
      throw new NarrationLintConfigError(`narrationLint.${listName} must be a non-empty array`);
    }
    for (const p of list) {
      if (typeof p !== 'string' || !p.trim()) {
        throw new NarrationLintConfigError(`narrationLint.${listName} contains an empty phrase`);
      }
    }
  }
  if (!(k.REPEAT_SIMILARITY_THRESHOLD > 0 && k.REPEAT_SIMILARITY_THRESHOLD <= 1)) {
    throw new NarrationLintConfigError(
      `narrationLint.REPEAT_SIMILARITY_THRESHOLD must be within (0, 1], got ${k.REPEAT_SIMILARITY_THRESHOLD}`,
    );
  }
  for (const name of ['SUPERIOR_NPC_LEVEL_GAP', 'REPEAT_WINDOW_PER_SPEAKER', 'REPEAT_MIN_TOKENS'] as const) {
    if (!(Number.isInteger(k[name]) && k[name] >= 1)) {
      throw new NarrationLintConfigError(`narrationLint.${name} must be an integer >= 1, got ${k[name]}`);
    }
  }
  return k;
}

/** `GAME_CONFIG.narrationLint` -> knobs, defaults filled in, then validated. */
export function narrationLintKnobsFromGameConfig(gc: Record<string, unknown> | null | undefined): NarrationLintKnobs {
  const raw = gc && typeof gc.narrationLint === 'object' && gc.narrationLint
    ? (gc.narrationLint as Partial<NarrationLintKnobs>)
    : {};
  return assertNarrationLintKnobs(raw);
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Text primitives
// ---------------------------------------------------------------------------

/** Same tag shape App.tsx `parseStoryWithDialogue` uses; kept identical on purpose. */
export const DIALOGUE_TAG_RE = /<dialogue speaker="([^"]+)">([\s\S]*?)<\/dialogue>/g;

export interface SplitNarration {
  /** Everything outside <dialogue> tags, joined with newlines. */
  narration: string;
  dialogues: DialogueLine[];
}

export function splitNarration(text: string): SplitNarration {
  if (!text) return { narration: '', dialogues: [] };
  const dialogues: DialogueLine[] = [];
  const narrationParts: string[] = [];
  let last = 0;
  const re = new RegExp(DIALOGUE_TAG_RE.source, 'g');
  let m: RegExpExecArray | null;
  const pushPart = (s: string) => {
    const t = s.trim();
    if (t) narrationParts.push(t);
  };
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushPart(text.slice(last, m.index));
    dialogues.push({ speaker: m[1].trim(), content: m[2].trim() });
    last = re.lastIndex;
  }
  if (last < text.length) pushPart(text.slice(last));
  return { narration: narrationParts.join('\n'), dialogues };
}

/** Lower-case NFC, markdown stars and punctuation removed, whitespace collapsed. */
export function normalizeForMatch(s: string): string {
  return (s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\*/g, ' ')
    .replace(/[.,!?;:"'“”‘’()\[\]{}…\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalizeForMatch(s);
  return n ? n.split(' ') : [];
}

function bigrams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  if (tokens.length === 1) out.add(tokens[0]);
  for (let i = 0; i + 1 < tokens.length; i++) out.add(tokens[i] + ' ' + tokens[i + 1]);
  return out;
}

/** Jaccard over token bigrams. 1 = identical wording, 0 = nothing shared. */
export function lineSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const A = bigrams(ta);
  const B = bigrams(tb);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** A short window of the original text around a normalized-phrase hit. */
function excerptAround(text: string, phrase: string, radius = 60): string {
  const idx = normalizeForMatch(text).indexOf(normalizeForMatch(phrase));
  if (idx < 0) return text.slice(0, radius * 2);
  // Normalization changes offsets; fall back to a proportional window.
  const ratio = idx / Math.max(1, normalizeForMatch(text).length);
  const approx = Math.floor(ratio * text.length);
  const start = Math.max(0, approx - radius);
  return text.slice(start, Math.min(text.length, approx + phrase.length + radius)).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** Narrator asserts the protagonist's superiority as fact (Pillar 1, AFFECTION_NOT_APPRAISAL). */
export function findObjectivePraise(narration: string, knobs: NarrationLintKnobs): LintViolation[] {
  const out: LintViolation[] = [];
  const norm = normalizeForMatch(narration);
  if (!norm) return out;
  for (const phrase of knobs.OBJECTIVE_PRAISE_PHRASES) {
    if (norm.includes(normalizeForMatch(phrase))) {
      out.push({ kind: 'objective_praise', excerpt: excerptAround(narration, phrase), matched: phrase });
    }
  }
  return out;
}

function isPlayerSpeaker(speaker: string, player: { name: string }): boolean {
  const s = normalizeForMatch(speaker);
  return s === 'ngươi' || s === 'nguoi' || (player.name && s === normalizeForMatch(player.name));
}

function npcByName(ctx: LintContext, speaker: string): LintNpc | undefined {
  const s = normalizeForMatch(speaker);
  return ctx.npcs.find((n) => normalizeForMatch(n.name) === s);
}

/**
 * Generic praise in an NPC's mouth (Pillar 1, GROUNDED_PRAISE). When the
 * speaker is a much stronger NPC the finding is the graver
 * `superior_overpraise`: a Cap-60 elder does not call a Cap-12 a genius.
 */
export function findUngroundedPraise(
  dialogues: DialogueLine[],
  ctx: LintContext,
  knobs: NarrationLintKnobs,
): LintViolation[] {
  const out: LintViolation[] = [];
  for (const line of dialogues) {
    if (isPlayerSpeaker(line.speaker, ctx.player)) continue;
    const norm = normalizeForMatch(line.content);
    if (!norm) continue;
    const npc = npcByName(ctx, line.speaker);
    const superior = !!npc && npc.level - ctx.player.level >= knobs.SUPERIOR_NPC_LEVEL_GAP;
    for (const phrase of knobs.GENERIC_PRAISE_PHRASES) {
      if (norm.includes(normalizeForMatch(phrase))) {
        out.push({
          kind: superior ? 'superior_overpraise' : 'ungrounded_praise',
          speaker: line.speaker,
          excerpt: line.content,
          matched: phrase,
        });
      }
    }
  }
  return out;
}

/**
 * An NPC line that re-uses the wording of one of its own recent lines - from
 * earlier turns (`ctx.recentLines`) or earlier in the same response.
 */
export function findRepeatedLines(
  dialogues: DialogueLine[],
  ctx: LintContext,
  knobs: NarrationLintKnobs,
): LintViolation[] {
  const out: LintViolation[] = [];
  const seen: DialogueLine[] = [...ctx.recentLines];
  for (const line of dialogues) {
    const speakerKey = normalizeForMatch(line.speaker);
    const isPlayer = isPlayerSpeaker(line.speaker, ctx.player);
    const tokens = tokenize(line.content);
    if (!isPlayer && tokens.length >= knobs.REPEAT_MIN_TOKENS) {
      const own = seen.filter((s) => normalizeForMatch(s.speaker) === speakerKey);
      const window = own.slice(-knobs.REPEAT_WINDOW_PER_SPEAKER);
      let best: { sim: number; against: DialogueLine } | null = null;
      for (const prev of window) {
        if (tokenize(prev.content).length < knobs.REPEAT_MIN_TOKENS) continue;
        const sim = lineSimilarity(line.content, prev.content);
        if (!best || sim > best.sim) best = { sim, against: prev };
      }
      if (best && best.sim >= knobs.REPEAT_SIMILARITY_THRESHOLD) {
        out.push({
          kind: 'repeated_line',
          speaker: line.speaker,
          excerpt: line.content,
          matched: best.against.content,
          similarity: Math.round(best.sim * 100) / 100,
        });
      }
    }
    seen.push(line);
  }
  return out;
}

const EMPTY_COUNTS: Record<LintViolationKind, number> = {
  objective_praise: 0,
  ungrounded_praise: 0,
  superior_overpraise: 0,
  repeated_line: 0,
};

/** The whole thing. `text` is the RAW API-2 response (tags still in). */
export function lintNarration(
  text: string,
  ctx: LintContext,
  knobs: NarrationLintKnobs = DEFAULT_NARRATION_LINT_KNOBS,
): NarrationLintReport {
  const { narration, dialogues } = splitNarration(text);
  const violations = [
    ...findObjectivePraise(narration, knobs),
    ...findUngroundedPraise(dialogues, ctx, knobs),
    ...findRepeatedLines(dialogues, ctx, knobs),
  ];
  const counts = { ...EMPTY_COUNTS };
  for (const v of violations) counts[v.kind]++;
  return { violations, counts, dialogue_count: dialogues.length, narration_chars: narration.length };
}

// ---------------------------------------------------------------------------
// Context builders (thin, so App.tsx passes raw state and nothing else)
// ---------------------------------------------------------------------------

/** Minimal shape of an App `storyHistory` item this module reads. */
export interface HistoryItemLike {
  type?: string;
  transient?: boolean;
  content?: unknown;
}

/**
 * Dialogue lines from `storyHistory` (`type: 'story'`, segmented content),
 * oldest first, capped to the last `maxPerSpeaker` per speaker. Transient and
 * non-story items are skipped. Player lines are kept: a repeated PLAYER line is
 * not a violation, but the window is cheap and keeps the builder simple.
 */
export function recentDialogueLinesFromHistory(
  history: readonly HistoryItemLike[] | null | undefined,
  maxPerSpeaker: number,
): DialogueLine[] {
  const perSpeaker = new Map<string, DialogueLine[]>();
  const ordered: DialogueLine[] = [];
  for (const h of history || []) {
    if (!h || h.transient || h.type !== 'story' || !Array.isArray(h.content)) continue;
    for (const seg of h.content as Array<{ type?: string; speaker?: string; content?: string }>) {
      if (!seg || seg.type !== 'dialogue' || !seg.speaker || !seg.content) continue;
      const line = { speaker: String(seg.speaker), content: String(seg.content) };
      const key = normalizeForMatch(line.speaker);
      const bucket = perSpeaker.get(key) || [];
      bucket.push(line);
      perSpeaker.set(key, bucket);
      ordered.push(line);
    }
  }
  const keep = new Set<DialogueLine>();
  for (const bucket of perSpeaker.values()) for (const l of bucket.slice(-maxPerSpeaker)) keep.add(l);
  return ordered.filter((l) => keep.has(l));
}

/** Minimal shape of an App `knowledge.characters[]` entry this module reads. */
export interface CharacterLike {
  Name?: string;
  level?: number;
  affinity?: number;
  isPlayer?: boolean;
  isCompanion?: boolean;
  isPermanentlyDead?: boolean;
  current_location_id?: string | null;
}

/**
 * Same "who is present" filter App.tsx uses for `npcsString`, plus living
 * companions (they speak too). The player is the `isPlayer` entry.
 */
export function narrationLintContextFromKnowledge(
  characters: readonly CharacterLike[] | null | undefined,
  history: readonly HistoryItemLike[] | null | undefined,
  knobs: NarrationLintKnobs = DEFAULT_NARRATION_LINT_KNOBS,
): LintContext {
  const chars = characters || [];
  const player = chars.find((c) => c && c.isPlayer) || {};
  const playerLoc = player.current_location_id;
  const npcs: LintNpc[] = [];
  for (const c of chars) {
    if (!c || c.isPlayer || c.isPermanentlyDead || !c.Name) continue;
    const present = c.isCompanion || !c.current_location_id || c.current_location_id === playerLoc;
    if (!present) continue;
    npcs.push({
      name: c.Name,
      level: Number.isFinite(c.level) ? (c.level as number) : 0,
      affinity: Number.isFinite(c.affinity) ? (c.affinity as number) : 0,
      isCompanion: !!c.isCompanion,
    });
  }
  return {
    player: { name: player.Name || 'Ngươi', level: Number.isFinite(player.level) ? (player.level as number) : 0 },
    npcs,
    recentLines: recentDialogueLinesFromHistory(history, knobs.REPEAT_WINDOW_PER_SPEAKER),
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<LintViolationKind, string> = {
  objective_praise: 'Người kể tự khẳng định vượt trội',
  ungrounded_praise: 'NPC khen chung chung, không căn cứ',
  superior_overpraise: 'NPC bề trên khen quá tầm',
  repeated_line: 'NPC lặp lại câu đã nói',
};

/** One line per finding; Vietnamese because it surfaces in the dev console. */
export function formatLintReportForConsole(report: NarrationLintReport): string {
  if (!report.violations.length) return 'Sạch (0 vi phạm).';
  return report.violations
    .map((v) => {
      const who = v.speaker ? `[${v.speaker}] ` : '';
      const sim = v.similarity !== undefined ? ` (giống ${Math.round(v.similarity * 100)}%)` : '';
      return `${KIND_LABEL[v.kind]}${sim}: ${who}"${v.excerpt}" ~ "${v.matched}"`;
    })
    .join('\n');
}
