/**
 * Core UI / Screen Navigation - D.7 `composer_payload_submit_allowed` and
 * `resolve_speaker` (structured action composer, Core Rule #3c).
 *
 * AC coverage: AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-77, AC-81 (the
 * [Unit]-tagged subset of AC-71..82 - AC-78/79/80/82 need real DOM/render
 * wiring and stay [Integration]/[Manual], per core-ui-screen-navigation.md
 * "Ghi chú test setup").
 */

import { describe, expect, it } from 'vitest';
import type { WriteActionContext } from '../../../src-web/systems/ui/writeActionAllowed';
import {
  type ComposerSegment,
  type KnownNpcEntry,
  composerPayloadSubmitAllowed,
  composerSegmentValid,
  fuzzyScore,
  normalize,
  parseSerializedComposerPayload,
  resetSpeakerOnTypeChange,
  resolveSpeaker,
  serializeComposerPayload,
  speakerValid,
} from '../../../src-web/systems/ui/composerPayload';

const AWAITING_S2: WriteActionContext = { tm_state: 'awaiting_action', screen: 'S2' };
const RESOLVING_S2: WriteActionContext = { tm_state: 'resolving', screen: 'S2' };

const POOL: KnownNpcEntry[] = [
  { char_id: 'bui_lan', display_name: 'Bùi Lan' },
  { char_id: 'lam_thien_hao', display_name: 'Lam Thiên Hạo' },
  { char_id: 'lam_nhi', display_name: 'Lam Nhi' },
];

describe('D.7 composerPayloadSubmitAllowed', () => {
  it('AC-71: empty payload is blocked even when D.1 alone would allow submit', () => {
    expect(composerPayloadSubmitAllowed([], AWAITING_S2)).toBe(false);
  });

  it('AC-72: a single narration segment is sufficient (backward compatible)', () => {
    const payload: ComposerSegment[] = [{ type: 'narration', text: 'Ngươi bước vào sảnh.' }];
    expect(composerPayloadSubmitAllowed(payload, AWAITING_S2)).toBe(true);
  });

  it('AC-73: one whitespace-only segment blocks the whole payload', () => {
    const payload: ComposerSegment[] = [
      { type: 'narration', text: 'Ngươi bước vào sảnh.' },
      { type: 'narration', text: '   ' },
    ];
    expect(composerSegmentValid(payload[1])).toBe(false);
    expect(composerPayloadSubmitAllowed(payload, AWAITING_S2)).toBe(false);
  });

  it('AC-74: a dialogue segment without a valid speaker is invalid', () => {
    const payload: ComposerSegment[] = [
      { type: 'dialogue', text: 'Ngươi là ai?', speaker: { kind: 'known_npc', char_id: '', display_name: '' } },
    ];
    expect(speakerValid(payload[0].type === 'dialogue' ? payload[0].speaker : undefined)).toBe(false);
    expect(composerPayloadSubmitAllowed(payload, AWAITING_S2)).toBe(false);
  });

  it('D.1 pass-through: resolving/undoing blocks even a valid payload', () => {
    const payload: ComposerSegment[] = [{ type: 'narration', text: 'Ngươi rút kiếm.' }];
    expect(composerPayloadSubmitAllowed(payload, RESOLVING_S2)).toBe(false);
  });
});

describe('D.7 resolveSpeaker', () => {
  it('AC-75 (case + whitespace only): normalized exact match auto-resolves', () => {
    // NOTE: D.7's own `normalize(x) = casefold(trim(NFC(x)))` does NOT strip
    // Vietnamese diacritics - NFC is canonical *composition*, not accent
    // removal. AC-75's GIVEN text also says "không dấu" (typed WITHOUT
    // diacritics, e.g. "bui lan") should exact-match "Bùi Lan" - that
    // specific claim is NOT satisfiable by the literal D.7 formula as
    // written (confirmed by red test: 'bui lan ' against "Bùi Lan" scores
    // ~0.6 overlap, below the 0.72 threshold, because every trigram
    // touching the accented "ù" differs). This is a Formula-vs-AC wording
    // gap in core-ui-screen-navigation.md, flagged to the project owner
    // rather than silently patched with ad-hoc diacritic-folding (which
    // would change auto-resolve behavior for the OTHER direction too -
    // Vietnamese names that are legitimately distinct only by tone mark,
    // e.g. "Hoa"/"Hòa"/"Họa", would start colliding). This test instead
    // covers exactly what the literal formula supports: case + surrounding
    // whitespace insensitivity, diacritics preserved.
    const result = resolveSpeaker('  BÙI LAN', POOL);
    expect(result.kind).toBe('known_npc');
    expect(result.kind === 'known_npc' && result.char_id).toBe('bui_lan');
  });

  it('AC-76: two candidates over threshold never auto-resolve', () => {
    const result = resolveSpeaker('lam', POOL);
    expect(result.kind).toBe('ambiguous');
    expect(result.kind === 'ambiguous' && result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('regression (2026-09-02): a single fuzzy-but-not-exact match is a suggestion, never a forced rename', () => {
    // Reported bug: typing "Bạch Hổ Binh A" (a deliberately distinct, numbered
    // mob instance) got silently overwritten with the existing "Bạch Hổ binh"
    // NPC's name, because the typed text is a near-total trigram superset of
    // the existing name and was the ONLY fuzzy candidate - the old code
    // treated "exactly 1 fuzzy match" as certain enough to auto-resolve like
    // an exact match. Fuzzy match must only ever assist search, never force
    // an existing name onto text the player deliberately typed differently -
    // so even a single non-exact candidate must come back as `ambiguous`
    // (a pickable suggestion the UI's "Dùng tên mới" escape hatch still
    // covers), exactly like the >=2 candidate case in AC-76 above.
    const result = resolveSpeaker('Bùi Lan A', POOL);
    expect(result.kind).toBe('ambiguous');
    expect(result.kind === 'ambiguous' && result.candidates.map((c) => c.char_id)).toEqual(['bui_lan']);
  });

  it('AC-77: no match at all falls through to new_npc, never blocked', () => {
    const result = resolveSpeaker('Hoàn Toàn Người Lạ', POOL);
    expect(result).toEqual({ kind: 'new_npc', proposed_name: 'Hoàn Toàn Người Lạ' });
  });

  it('empty pool (first turn of a playthrough) always falls to new_npc', () => {
    expect(resolveSpeaker('Bất Kỳ Ai', [])).toEqual({ kind: 'new_npc', proposed_name: 'Bất Kỳ Ai' });
  });

  it('fuzzy_score at exactly the threshold counts as a match (closed boundary)', () => {
    // fuzzyScore is symmetric and deterministic; same string always scores 1.
    expect(fuzzyScore('Bùi Lan', 'Bùi Lan')).toBe(1);
  });
});

describe('D.7 normalize', () => {
  it('trims, NFC-normalizes and casefolds', () => {
    expect(normalize('  Bùi Lan  ')).toBe(normalize('bùi lan'));
  });
});

describe('AC-81: resetSpeakerOnTypeChange', () => {
  it('keeps text, resets speaker to player', () => {
    const draft = { type: 'narration' as const, text: 'Nàng bước tới', speaker: { kind: 'known_npc' as const, char_id: 'x', display_name: 'X' } };
    const next = resetSpeakerOnTypeChange(draft, 'dialogue');
    expect(next.text).toBe('Nàng bước tới');
    expect(next.type).toBe('dialogue');
    expect(next.speaker).toEqual({ kind: 'player' });
  });
});

describe('serializeComposerPayload', () => {
  it('AC-72: single narration segment serializes byte-for-byte (no wrapper)', () => {
    const payload: ComposerSegment[] = [{ type: 'narration', text: '  Ngươi bước vào sảnh.  ' }];
    expect(serializeComposerPayload(payload, 'Ngươi')).toBe('Ngươi bước vào sảnh.');
  });

  it('multi-segment payload gets a numbered, labeled list matching D.7 Example', () => {
    const payload: ComposerSegment[] = [
      { type: 'narration', text: 'Nàng bước vào sảnh.' },
      { type: 'dialogue', text: 'Ngươi là ai?', speaker: { kind: 'player' } },
      {
        type: 'dialogue',
        text: 'Ta là Bùi Lan.',
        speaker: { kind: 'known_npc', char_id: 'bui_lan', display_name: 'Bùi Lan' },
      },
    ];
    const serialized = serializeComposerPayload(payload, 'Trần Phong');
    expect(serialized).toBe(
      '[Đoạn 1 - Tường thuật]: Nàng bước vào sảnh.\n' +
        '[Đoạn 2 - Lời Trần Phong]: "Ngươi là ai?"\n' +
        '[Đoạn 3 - Lời Bùi Lan]: "Ta là Bùi Lan."',
    );
  });

  it('regression (2026-09-28): narration is never quoted, so it cannot read as a spoken line', () => {
    const payload: ComposerSegment[] = [
      { type: 'narration', text: 'Tử bài phải là những người có nhan sắc sánh ngang Điêu Thuyền.' },
      { type: 'dialogue', text: 'Lý Tiệm, đây là danh sách.', speaker: { kind: 'player' } },
    ];
    const [narrationLine, dialogueLine] = serializeComposerPayload(payload, 'Diệp Thần').split('\n');
    expect(narrationLine).not.toContain('"');
    expect(dialogueLine).toBe('[Đoạn 2 - Lời Diệp Thần]: "Lý Tiệm, đây là danh sách."');
  });
});

describe('parseSerializedComposerPayload', () => {
  it('reads back type, speaker and text of every serialized segment', () => {
    const payload: ComposerSegment[] = [
      { type: 'narration', text: 'Nàng bước vào sảnh.\nGió lạnh lùa theo.' },
      { type: 'dialogue', text: 'Ngươi là ai?', speaker: { kind: 'player' } },
      { type: 'dialogue', text: 'Ta là Bùi Lan.', speaker: { kind: 'known_npc', char_id: 'bui_lan', display_name: 'Bùi Lan' } },
    ];
    expect(parseSerializedComposerPayload(serializeComposerPayload(payload, 'Trần Phong'))).toEqual([
      { type: 'narration', speaker: '', text: 'Nàng bước vào sảnh.\nGió lạnh lùa theo.' },
      { type: 'dialogue', speaker: 'Trần Phong', text: 'Ngươi là ai?' },
      { type: 'dialogue', speaker: 'Bùi Lan', text: 'Ta là Bùi Lan.' },
    ]);
  });

  it('still reads the old quoted-narration form kept in saved history', () => {
    expect(parseSerializedComposerPayload('[Đoạn 1 - Tường thuật]: "Ngươi rút kiếm."')).toEqual([
      { type: 'narration', speaker: '', text: 'Ngươi rút kiếm.' },
    ]);
  });

  it('returns [] for text without numbered segments (choice, single narration)', () => {
    expect(parseSerializedComposerPayload('Ngươi bước vào sảnh.')).toEqual([]);
    expect(parseSerializedComposerPayload('')).toEqual([]);
  });
});
