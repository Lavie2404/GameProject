/**
 * Narration guard - the "prevent + cure" layer for the API-2 narration call,
 * built on narrationLint.ts.
 *
 * Design docs: design/gdd/game-concept.md "Pillar 1" (243-255) and the
 * Anti-Pillars; game-concept.md 318-324 ("prompt là gợi ý, không phải ràng
 * buộc"); tests/golden/narration/README.md.
 *
 * PATTERN (same as the Quốc ngữ guard in App.tsx `fetchWithRetries`)
 *   1. PREVENT: hand the model a short, data-driven block right before its
 *      output instructions - the exact NPC lines it must not repeat.
 *   2. CURE: lint the response; when a triggering violation is present, call
 *      ONCE more with an instruction that names the offending lines, then keep
 *      whichever of the two responses has fewer triggering violations
 *      (tie -> the corrected one). Never block the turn, never edit the text.
 *
 * DEVIATION, documented: gdd-01 C.4 F2 treats API-2 as "the only critical-path
 * AI call of the turn". The cure call is a second API-2 request in the same
 * turn. `calls_per_turn` is a set of booleans (turnManager.ts F2), so the
 * count does not change, but the turn can take up to one extra call budget.
 * `GUARD_RETRY_MAX: 0` in gameConfig.js turns the cure off; the prevent block
 * stays.
 *
 * Pure module: no React, no I/O, no RNG.
 */

import type {
  DialogueLine,
  LintViolation,
  LintViolationKind,
  NarrationLintKnobs,
  NarrationLintReport,
} from './narrationLint';
import { normalizeForMatch } from './narrationLint';

// ---------------------------------------------------------------------------
// Knobs (gameConfig.js block 22, part B)
// ---------------------------------------------------------------------------

export interface NarrationGuardKnobs {
  /** Violation kinds that justify the cure call. */
  GUARD_RETRY_KINDS: readonly LintViolationKind[];
  /** 0 = prevent only, never re-request. 1 = one cure call (the design). */
  GUARD_RETRY_MAX: number;
  /** Lines per NPC listed in the prevent block. */
  RECENT_LINES_PROMPT_PER_SPEAKER: number;
  /** Hard cap on the prevent block's size; oldest lines are dropped first. */
  RECENT_LINES_PROMPT_MAX_CHARS: number;
}

export const DEFAULT_NARRATION_GUARD_KNOBS: NarrationGuardKnobs = {
  GUARD_RETRY_KINDS: ['repeated_line'],
  GUARD_RETRY_MAX: 1,
  RECENT_LINES_PROMPT_PER_SPEAKER: 4,
  RECENT_LINES_PROMPT_MAX_CHARS: 1500,
};

const KNOWN_KINDS: readonly LintViolationKind[] = [
  'objective_praise',
  'ungrounded_praise',
  'superior_overpraise',
  'repeated_line',
  'missing_thuc',
];

export class NarrationGuardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrationGuardConfigError';
  }
}

export function assertNarrationGuardKnobs(knobs: Partial<NarrationGuardKnobs>): NarrationGuardKnobs {
  const k: NarrationGuardKnobs = { ...DEFAULT_NARRATION_GUARD_KNOBS };
  for (const [key, v] of Object.entries(knobs || {})) if (v !== undefined) (k as Record<string, unknown>)[key] = v;
  if (!Array.isArray(k.GUARD_RETRY_KINDS)) {
    throw new NarrationGuardConfigError('narrationLint.GUARD_RETRY_KINDS must be an array');
  }
  for (const kind of k.GUARD_RETRY_KINDS) {
    if (!KNOWN_KINDS.includes(kind)) {
      throw new NarrationGuardConfigError(`narrationLint.GUARD_RETRY_KINDS has unknown kind "${String(kind)}"`);
    }
  }
  if (!(Number.isInteger(k.GUARD_RETRY_MAX) && k.GUARD_RETRY_MAX >= 0 && k.GUARD_RETRY_MAX <= 2)) {
    throw new NarrationGuardConfigError(`narrationLint.GUARD_RETRY_MAX must be 0, 1 or 2, got ${k.GUARD_RETRY_MAX}`);
  }
  if (!(Number.isInteger(k.RECENT_LINES_PROMPT_PER_SPEAKER) && k.RECENT_LINES_PROMPT_PER_SPEAKER >= 1)) {
    throw new NarrationGuardConfigError('narrationLint.RECENT_LINES_PROMPT_PER_SPEAKER must be an integer >= 1');
  }
  if (!(Number.isInteger(k.RECENT_LINES_PROMPT_MAX_CHARS) && k.RECENT_LINES_PROMPT_MAX_CHARS >= 200)) {
    throw new NarrationGuardConfigError('narrationLint.RECENT_LINES_PROMPT_MAX_CHARS must be an integer >= 200');
  }
  return k;
}

/** Reads the guard keys out of the shared `narrationLint` block. */
export function narrationGuardKnobsFromGameConfig(gc: Record<string, unknown> | null | undefined): NarrationGuardKnobs {
  const raw = gc && typeof gc.narrationLint === 'object' && gc.narrationLint
    ? (gc.narrationLint as Record<string, unknown>)
    : {};
  const picked: Partial<NarrationGuardKnobs> = {};
  for (const key of Object.keys(DEFAULT_NARRATION_GUARD_KNOBS) as (keyof NarrationGuardKnobs)[]) {
    if (raw[key] !== undefined) (picked as Record<string, unknown>)[key] = raw[key];
  }
  return assertNarrationGuardKnobs(picked);
}

// ---------------------------------------------------------------------------
// 1. PREVENT - the recent-lines block
// ---------------------------------------------------------------------------

export const RECENT_DIALOGUE_BLOCK_HEADER =
  '--- LỜI THOẠI NPC ĐÃ NÓI GẦN ĐÂY (CHỐNG LẶP — ĐỌC TRƯỚC KHI VIẾT BẤT KỲ THẺ <dialogue> NÀO) ---';

export const RECENT_DIALOGUE_BLOCK_RULE =
  'Các câu dưới đây là lời NPC ĐÃ NÓI ở những lượt trước. Lượt này mỗi NPC phải nói điều MỚI: ' +
  'không dùng lại nguyên văn, không diễn đạt lại cùng một ý bằng câu gần giống, không lặp câu cửa miệng. ' +
  'Nếu NPC không có gì mới để nói, để họ im lặng hoặc hành động thay vì nói.';

function isPlayerName(speaker: string, playerName: string): boolean {
  const s = normalizeForMatch(speaker);
  return s === 'ngươi' || s === 'nguoi' || (!!playerName && s === normalizeForMatch(playerName));
}

/**
 * The prevent block, or '' when no NPC has said anything yet (so a fresh game
 * pays nothing). Newest lines win under the char cap. Player lines are
 * excluded: the player may repeat themselves, the NPC may not.
 */
export function buildRecentDialogueBlock(
  recentLines: readonly DialogueLine[],
  playerName: string,
  knobs: NarrationGuardKnobs = DEFAULT_NARRATION_GUARD_KNOBS,
): string {
  const perSpeaker = new Map<string, { speaker: string; lines: string[] }>();
  const order: string[] = [];
  for (const line of recentLines) {
    if (!line || !line.speaker || !line.content) continue;
    if (isPlayerName(line.speaker, playerName)) continue;
    const key = normalizeForMatch(line.speaker);
    if (!perSpeaker.has(key)) {
      perSpeaker.set(key, { speaker: line.speaker, lines: [] });
      order.push(key);
    }
    perSpeaker.get(key)!.lines.push(line.content.replace(/\s+/g, ' ').trim());
  }
  if (order.length === 0) return '';

  // Newest `perSpeaker` lines per NPC, then trim oldest-first until under the cap.
  const entries = order.map((k) => {
    const e = perSpeaker.get(k)!;
    return { speaker: e.speaker, lines: e.lines.slice(-knobs.RECENT_LINES_PROMPT_PER_SPEAKER) };
  });
  const render = () =>
    [RECENT_DIALOGUE_BLOCK_HEADER, RECENT_DIALOGUE_BLOCK_RULE, ...entries
      .filter((e) => e.lines.length)
      .map((e) => `- ${e.speaker}: ${e.lines.map((l) => `"${l}"`).join(' | ')}`)].join('\n');

  let text = render();
  while (text.length > knobs.RECENT_LINES_PROMPT_MAX_CHARS) {
    // Drop the oldest line of the speaker who currently has the most lines.
    const victim = entries.reduce((a, b) => (b.lines.length > a.lines.length ? b : a));
    if (victim.lines.length === 0) break;
    victim.lines.shift();
    if (entries.every((e) => e.lines.length === 0)) return '';
    text = render();
  }
  return text;
}

// ---------------------------------------------------------------------------
// 1b. PREVENT (Pillar 1) - the compressed end-of-prompt reminder
// ---------------------------------------------------------------------------

export const PILLAR1_REMINDER_HEADER =
  '--- NHẮC LẠI CUỐI CÙNG: THẾ GIỚI KHÁCH QUAN (PILLAR 1 — ĐỌC NGAY TRƯỚC KHI VIẾT) ---';

/**
 * Three lines, placed right before the output instructions, where the long
 * Pillar-1 block at the top of the prompt is furthest away. The banned-phrase
 * list is the SAME list the lint checks (gameConfig.js block 22), so prompt
 * and measure cannot drift apart. `maxPhrases` keeps the line readable.
 */
export function buildPillar1Reminder(
  lintKnobs: Pick<NarrationLintKnobs, 'GENERIC_PRAISE_PHRASES' | 'SUPERIOR_NPC_LEVEL_GAP'>,
  maxPhrases = 8,
): string {
  const phrases = lintKnobs.GENERIC_PRAISE_PHRASES.slice(0, Math.max(1, maxPhrases))
    .map((p) => `"${p}"`)
    .join(', ');
  return [
    PILLAR1_REMINDER_HEADER,
    '1. Người kể KHÔNG khẳng định nhân vật chính vượt trội như một sự thật của thế giới; ' +
      'muốn khen thì để một nhân vật nói trong thẻ <dialogue>, kèm thiên kiến riêng của họ.',
    `2. NPC khen phải chỉ vào MỘT việc cụ thể vừa xảy ra và đúng tầm: NPC cao hơn nhân vật chính từ ` +
      `${lintKnobs.SUPERIOR_NPC_LEVEL_GAP} cấp trở lên chỉ khen dè dặt kiểu bề trên. ` +
      `Không dùng các cụm: ${phrases}.`,
    '3. NPC quyết định theo lợi ích, tính cách và thực lực của chính họ; kết quả đã định là giới hạn duy nhất, ' +
      'ngoài giới hạn đó họ giữ nguyên lập trường.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 2. CURE - correction instruction + decision
// ---------------------------------------------------------------------------

export function triggeringViolations(
  report: NarrationLintReport,
  knobs: NarrationGuardKnobs = DEFAULT_NARRATION_GUARD_KNOBS,
): LintViolation[] {
  return report.violations.filter((v) => knobs.GUARD_RETRY_KINDS.includes(v.kind));
}

const KIND_INTRO: Record<LintViolationKind, string> = {
  repeated_line: 'NPC lặp lại câu đã nói ở lượt trước',
  ungrounded_praise: 'NPC khen chung chung, không chỉ vào việc cụ thể nhân vật chính vừa làm',
  superior_overpraise: 'NPC bề trên (cao hơn nhiều cảnh giới) khen như với đối thủ ngang tầm',
  objective_praise: 'người kể tự khẳng định nhân vật chính vượt trội như sự thật khách quan',
  missing_thuc: 'văn kể bỏ sót một thức mà kết quả đã khóa nói là đã được dùng (Tường Thuật Sống Động)',
};

const KIND_FIX: Record<LintViolationKind, string> = {
  repeated_line: 'thay MỌI câu bị lặp bằng lời thoại mới có nội dung khác, hoặc thay bằng hành động/cử chỉ không lời',
  ungrounded_praise: 'sửa lời khen để chỉ vào ĐÚNG MỘT việc cụ thể vừa xảy ra, hoặc bỏ lời khen',
  superior_overpraise: 'hạ giọng khen xuống mức bề trên dè dặt ("có chút tư chất", "không tệ") hoặc bỏ lời khen',
  objective_praise: 'xóa lời khẳng định đó khỏi văn kể; muốn khen thì để một nhân vật nói bằng thẻ <dialogue> kèm thiên kiến riêng',
  missing_thuc: 'kể lại đòn đó và gọi ĐÚNG TÊN thức như trong kết quả đã khóa, đúng thứ tự và đúng trúng/hụt',
};

/**
 * The cure instruction, appended to the SAME prompt (so the model keeps every
 * other constraint). Names each offending line: a generic "đừng lặp" reminder
 * gets the same text back (the Quốc ngữ guard learned this the hard way).
 */
export function correctionInstructionFor(violations: readonly LintViolation[]): string {
  if (!violations.length) return '';
  const byKind = new Map<LintViolationKind, LintViolation[]>();
  for (const v of violations) byKind.set(v.kind, [...(byKind.get(v.kind) || []), v]);

  const lines: string[] = ['--- SỬA LẠI (LẦN 2) — BẢN VỪA VIẾT VI PHẠM QUY TẮC LỜI KỂ ---'];
  for (const [kind, list] of byKind) {
    lines.push(`* ${KIND_INTRO[kind]}:`);
    for (const v of list) {
      const who = v.speaker ? `${v.speaker} ` : 'Người kể ';
      if (kind === 'repeated_line') {
        lines.push(`  - ${who}đã nói trước đó: "${v.matched}" → lượt này lại viết: "${v.excerpt}"`);
      } else if (kind === 'missing_thuc') {
        lines.push(`  - Thức "${v.matched}" đã được dùng theo kết quả đã khóa nhưng không xuất hiện trong văn kể`);
      } else {
        lines.push(`  - ${who}viết: "${v.excerpt}" (cụm vi phạm: "${v.matched}")`);
      }
    }
    lines.push(`  Cách sửa: ${KIND_FIX[kind]}.`);
  }
  lines.push(
    'Viết lại TOÀN BỘ phản hồi với cùng diễn biến, cùng kết quả đã định và cùng 4 lựa chọn cuối, ' +
      'chỉ thay các chỗ nêu trên. Giữ nguyên mọi quy tắc khác.',
  );
  return lines.join('\n');
}

export interface GuardDecision {
  /** Which response to keep. */
  keep: 'first' | 'second';
  first_triggering: number;
  second_triggering: number;
}

/**
 * Fewer triggering violations wins; a tie keeps the corrected response (it was
 * written with the offending lines in view). Same rule as the Quốc ngữ guard.
 */
export function decideBetween(
  first: NarrationLintReport,
  second: NarrationLintReport,
  knobs: NarrationGuardKnobs = DEFAULT_NARRATION_GUARD_KNOBS,
): GuardDecision {
  const a = triggeringViolations(first, knobs).length;
  const b = triggeringViolations(second, knobs).length;
  return { keep: b <= a ? 'second' : 'first', first_triggering: a, second_triggering: b };
}

/** What the golden capture records about the cure step. */
export interface GuardTrace {
  retried: boolean;
  kept: 'first' | 'second';
  first_triggering: number;
  second_triggering: number | null;
}
