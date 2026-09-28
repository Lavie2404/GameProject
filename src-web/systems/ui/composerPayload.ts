/**
 * Core UI D.7 - `composer_payload_submit_allowed(payload, tm_state, screen)`
 * and speaker resolution for the structured action composer.
 *
 * Design docs: design/gdd/core-ui-screen-navigation.md, Core Rule #3c, D.7,
 * AC-71..AC-82. Extends D.1 (`writeActionAllowed.ts`) by AND - never
 * re-derives or modifies it.
 *
 * Pure module: no React, no I/O, no RNG.
 */

import { isWriteActionAllowed, type WriteActionContext } from './writeActionAllowed';
import { normalizeName } from '../persistence/slotRecord';
import { UI_KNOBS } from '../registry';

/** D.7 Speaker tagged union. */
export type ComposerSpeaker =
  | { kind: 'player' }
  | { kind: 'known_npc'; char_id: string; display_name: string }
  | { kind: 'new_npc'; proposed_name: string };

export interface NarrationSegment {
  type: 'narration';
  text: string;
}

export interface DialogueSegment {
  type: 'dialogue';
  text: string;
  speaker: ComposerSpeaker;
}

export type ComposerSegment = NarrationSegment | DialogueSegment;

/** One entry of the "known NPC" pool - see D.7's `known_npc_pool(slot)`. */
export interface KnownNpcEntry {
  char_id: string;
  display_name: string;
}

/**
 * D.7: `normalize(x) = casefold(trim(NFC(x)))`.
 *
 * Reuses `normalizeName` (NFC + trim), the same primitive
 * `persistence-save-system.md`'s O-ConfirmDelete "type the name back" flow
 * uses (`src-web/systems/persistence/slotRecord.ts`), per D.7's "tái dùng
 * chuẩn hóa đã khóa ở O-ConfirmDelete" - one normalization definition
 * instead of two independently-drifting ones. Only the casefold step is
 * added here, since O-ConfirmDelete does its own case-insensitive compare
 * inline rather than exposing a casefolded export.
 */
export function normalize(x: string): string {
  return normalizeName(x).toLocaleLowerCase();
}

/**
 * Trigram (character 3-gram) overlap coefficient (Szymkiewicz-Simpson), in
 * [0, 1]: `intersection / min(|A|, |B|)`. No external dependency -
 * `technical-preferences.md` Allowed Libraries has no fuzzy-match package,
 * so this is ~20 lines of plain, deterministic JS.
 *
 * Deliberately NOT the symmetric Dice coefficient (`2*intersection /
 * (|A|+|B|)`): the composer's real usage is a short, partially-typed query
 * ("lam") against a full display name ("Lam Thiên Hạo") - Dice punishes that
 * length mismatch so hard a 3-letter prefix barely clears ~0.4 against a
 * 13-character name, which would silently defeat AC-76 (two names sharing a
 * prefix must both surface as `ambiguous`, never resolve to zero candidates).
 * The overlap coefficient scores "query's trigrams are a subset of the
 * candidate's" as 1.0, which is the correct shape for prefix/typeahead
 * matching and keeps this on the SAME side of D.7's stated risk posture -
 * "khi nghi ngờ, hiện picker" - since it can only make the picker appear
 * MORE often relative to Dice, never silently auto-resolve more often (the
 * `>= 2 candidates -> ambiguous` branch runs before the `== 1 -> known_npc`
 * one either way).
 */
export function fuzzyScore(a: string, b: string): number {
  const trigramsOf = (s: string): Set<string> => {
    const padded = `  ${normalize(s)} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    return set;
  };
  const ta = trigramsOf(a);
  const tb = trigramsOf(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / Math.min(ta.size, tb.size);
}

export type SpeakerResolution =
  | ComposerSpeaker
  | { kind: 'ambiguous'; candidates: KnownNpcEntry[] };

/**
 * D.7 `resolve_speaker(raw_input, slot)`. Runs the moment the player leaves
 * the NPC search box / picks a suggestion - NOT deferred to submit time.
 * `ambiguous` is a transient UI signal and must NEVER be written directly
 * into `segment.speaker`.
 */
export function resolveSpeaker(rawInput: string, knownNpcPool: KnownNpcEntry[]): SpeakerResolution {
  const exact = knownNpcPool.filter((e) => normalize(e.display_name) === normalize(rawInput));
  if (exact.length === 1) {
    return { kind: 'known_npc', char_id: exact[0].char_id, display_name: exact[0].display_name };
  }

  const fuzzy = knownNpcPool.filter(
    (e) => fuzzyScore(e.display_name, rawInput) >= UI_KNOBS.npc_fuzzy_match_threshold,
  );
  // Project owner correction (2026-09-02): fuzzy match is a SEARCH AID, never
  // a forced rename. A single close-but-not-exact candidate used to
  // auto-resolve straight to `known_npc`, silently overwriting what the
  // player typed - e.g. typing "Bạch Hổ Binh A" (a deliberately distinct,
  // numbered mob instance) got auto-corrected to the existing "Bạch Hổ binh"
  // NPC, because their names overlap almost entirely as trigrams. Any
  // non-exact fuzzy match (1 candidate or more) now surfaces as `ambiguous`
  // instead - the player sees it as a clickable suggestion (existing
  // suggestion-list UI) but must actively pick it or "Dùng tên mới" to keep
  // their own text; only a truly EXACT match (handled above) still
  // auto-resolves, since re-typing an existing name verbatim is unambiguous.
  if (fuzzy.length >= 1) return { kind: 'ambiguous', candidates: fuzzy };

  return { kind: 'new_npc', proposed_name: rawInput.trim() };
}

export function speakerValid(speaker: ComposerSpeaker | null | undefined): boolean {
  if (!speaker) return false;
  if (speaker.kind === 'player') return true;
  if (speaker.kind === 'known_npc') return !!speaker.char_id;
  if (speaker.kind === 'new_npc') return speaker.proposed_name.trim() !== '';
  return false;
}

/** D.7 `composer_segment_valid(segment)`. */
export function composerSegmentValid(segment: ComposerSegment): boolean {
  if (segment.text.trim() === '') return false;
  if (segment.type === 'narration') return true;
  return speakerValid(segment.speaker);
}

/**
 * D.7 `composer_payload_submit_allowed(payload, tm_state, screen)`: AND of
 * D.1's existing `submit_action` gate (imported, never re-derived) plus the
 * two composer-only conditions (non-empty, every segment valid).
 */
export function composerPayloadSubmitAllowed(
  segments: ComposerSegment[],
  ctx: WriteActionContext,
): boolean {
  return (
    isWriteActionAllowed('submit_action', ctx) &&
    segments.length >= 1 &&
    segments.every(composerSegmentValid)
  );
}

/** AC-81: changing a draft's type keeps the text, resets speaker to player. */
export function resetSpeakerOnTypeChange<
  T extends { type: 'narration' | 'dialogue'; speaker: ComposerSpeaker },
>(draft: T, newType: 'narration' | 'dialogue'): T {
  return { ...draft, type: newType, speaker: { kind: 'player' } };
}

function speakerLabel(speaker: ComposerSpeaker, playerName: string): string {
  if (speaker.kind === 'player') return playerName;
  if (speaker.kind === 'known_npc') return speaker.display_name;
  return speaker.proposed_name;
}

/**
 * Serializes the committed payload into the single string that continues to
 * flow through `processPlayerAction`'s unchanged `actionText: string`
 * contract (both the API 1 "Hành Động Của Nhân Vật Chính" context block AND,
 * via `callGeminiAPI`'s `userActionForHistory` param, the API 2 narration
 * prompt's `sanitizedUserActionForNarrative` - see App.tsx `contextBlock` /
 * `narrativePrompt`).
 *
 * Special-cased for the single-narration-segment case (AC-72) to stay
 * byte-for-byte what the old freeform box sent - no numbered wrapper for the
 * common case. Multi-segment / dialogue-bearing payloads get a numbered,
 * labeled list so the "2.12" narration-contract rule (App.tsx) has
 * unambiguous segment boundaries to reference, and so the player's dialogue
 * segments never visually collide with the `<dialogue>` tags the AI itself
 * must emit in its OWN response text.
 *
 * Only dialogue segments are quoted. Narration used to be quoted too, which
 * made it read like a spoken line: report 2026-09-28 (turn 15), the model
 * copied a "Tường thuật" segment verbatim into `<dialogue speaker="Ngươi">`.
 * The player already picks the segment type with a separate button, so the
 * serialized form must not leave that open to interpretation.
 */
export function serializeComposerPayload(segments: ComposerSegment[], playerName: string): string {
  if (segments.length === 1 && segments[0].type === 'narration') {
    return segments[0].text.trim();
  }
  return segments
    .map((seg, i) => {
      if (seg.type === 'narration') return `[Đoạn ${i + 1} - ${NARRATION_LABEL}]: ${seg.text.trim()}`;
      return `[Đoạn ${i + 1} - Lời ${speakerLabel(seg.speaker, playerName)}]: "${seg.text.trim()}"`;
    })
    .join('\n');
}

const NARRATION_LABEL = 'Tường thuật';
const SEGMENT_HEADER_RE = /^\[Đoạn (\d+) - ([^\]\n]+)\]: /gm;

/** One segment read back from `serializeComposerPayload` output. */
export interface SerializedComposerSegment {
  type: 'narration' | 'dialogue';
  /** Speaker display name for dialogue; empty for narration. */
  speaker: string;
  text: string;
}

/**
 * Inverse of `serializeComposerPayload` for the numbered multi-segment form.
 * Returns [] for anything else (single narration segment, a picked choice,
 * freeform text), since those carry no segment boundaries to read back.
 * Accepts the old quoted-narration form too, so saved history still parses.
 */
export function parseSerializedComposerPayload(actionText: string): SerializedComposerSegment[] {
  if (!actionText) return [];
  const headers = [...actionText.matchAll(SEGMENT_HEADER_RE)];
  return headers.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index ?? actionText.length : actionText.length;
    let text = actionText.slice(start, end).trim();
    if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim();
    const label = m[2].trim();
    if (label === NARRATION_LABEL) return { type: 'narration', speaker: '', text };
    return { type: 'dialogue', speaker: label.replace(/^Lời\s+/, ''), text };
  });
}
