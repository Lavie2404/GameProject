/**
 * Composer segment guard - keeps the player's "Tường thuật" segments out of
 * `<dialogue>` tags in the API 2 narration.
 *
 * Design docs: design/gdd/core-ui-screen-navigation.md D.7 (the structured
 * composer); App.tsx narrative rule 2.12 (the prompt side).
 *
 * WHY THIS EXISTS
 * The composer has separate "+ Tường thuật" / "+ Đối thoại" buttons, so the
 * type of every segment is data the player already chose, not something the
 * model should infer. Report 2026-09-28 (turn 15): the model copied a
 * narration segment verbatim into `<dialogue speaker="Ngươi">`, and the UI drew
 * it as a speech bubble. Per the Pillar-1 decision (fix the output, do not
 * pile on prompt directives), this module unwraps any `<dialogue>` whose
 * content is a near-copy of a narration segment, before the text is parsed
 * into story segments.
 *
 * WHAT IT NEVER DOES
 * - It never touches a dialogue line that does not match a narration segment,
 *   so a line the player quoted INSIDE a narration segment ("Ngươi quát: lùi
 *   lại!") still renders as speech: a short quote scores low against the
 *   longer segment it came from.
 * - It does nothing for payloads without numbered segments (a picked choice,
 *   a single narration segment, freeform text).
 *
 * Pure module: no React, no I/O, no RNG, no Date.
 */

import { parseSerializedComposerPayload } from '../ui/composerPayload';
import { DIALOGUE_TAG_RE, lineSimilarity, tokenize } from './narrationLint';

export interface ComposerSegmentGuardKnobs {
  /** Token-bigram Jaccard at or above this = the dialogue is a copied narration segment (0..1]. */
  NARRATION_UNWRAP_SIMILARITY: number;
  /** Dialogue lines shorter than this many tokens are never unwrapped. */
  NARRATION_UNWRAP_MIN_TOKENS: number;
}

export const DEFAULT_COMPOSER_SEGMENT_GUARD_KNOBS: ComposerSegmentGuardKnobs = {
  NARRATION_UNWRAP_SIMILARITY: 0.6,
  NARRATION_UNWRAP_MIN_TOKENS: 4,
};

export class ComposerSegmentGuardConfigError extends Error {}

export function composerSegmentGuardKnobsFromGameConfig(
  gc: Record<string, unknown> | null | undefined,
): ComposerSegmentGuardKnobs {
  const raw = (gc && typeof gc.composerSegmentGuard === 'object' && gc.composerSegmentGuard
    ? gc.composerSegmentGuard
    : {}) as Partial<ComposerSegmentGuardKnobs>;
  const knobs = { ...DEFAULT_COMPOSER_SEGMENT_GUARD_KNOBS, ...raw };
  const sim = knobs.NARRATION_UNWRAP_SIMILARITY;
  if (typeof sim !== 'number' || !(sim > 0 && sim <= 1)) {
    throw new ComposerSegmentGuardConfigError(`NARRATION_UNWRAP_SIMILARITY must be in (0, 1], got ${sim}`);
  }
  const minTokens = knobs.NARRATION_UNWRAP_MIN_TOKENS;
  if (!Number.isInteger(minTokens) || minTokens < 1) {
    throw new ComposerSegmentGuardConfigError(`NARRATION_UNWRAP_MIN_TOKENS must be an integer >= 1, got ${minTokens}`);
  }
  return knobs;
}

export interface UnwrappedDialogue {
  speaker: string;
  /** 1-based segment number in the player's payload. */
  segment: number;
  similarity: number;
}

export interface NarrationUnwrapResult {
  text: string;
  unwrapped: UnwrappedDialogue[];
}

/**
 * Replaces `<dialogue speaker="X">content</dialogue>` with plain `content`
 * wherever `content` is a near-copy of one of the player's narration segments
 * in `actionText` (the `serializeComposerPayload` string of this turn).
 */
export function unwrapNarrationSegmentDialogue(
  storyText: string,
  actionText: string,
  knobs: ComposerSegmentGuardKnobs = DEFAULT_COMPOSER_SEGMENT_GUARD_KNOBS,
): NarrationUnwrapResult {
  const narrationSegments = parseSerializedComposerPayload(actionText)
    .map((seg, i) => ({ ...seg, number: i + 1 }))
    .filter((seg) => seg.type === 'narration' && seg.text);
  if (!storyText || narrationSegments.length === 0) return { text: storyText, unwrapped: [] };

  const unwrapped: UnwrappedDialogue[] = [];
  const text = storyText.replace(new RegExp(DIALOGUE_TAG_RE.source, 'g'), (whole, speaker: string, content: string) => {
    if (tokenize(content).length < knobs.NARRATION_UNWRAP_MIN_TOKENS) return whole;
    let best = { similarity: 0, number: 0 };
    for (const seg of narrationSegments) {
      const similarity = lineSimilarity(content, seg.text);
      if (similarity > best.similarity) best = { similarity, number: seg.number };
    }
    if (best.similarity < knobs.NARRATION_UNWRAP_SIMILARITY) return whole;
    unwrapped.push({ speaker: speaker.trim(), segment: best.number, similarity: best.similarity });
    return content.trim();
  });
  return { text, unwrapped };
}
