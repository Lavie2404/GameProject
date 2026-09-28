/**
 * Composer segment guard - a "Tường thuật" segment the model wrapped in
 * <dialogue> is unwrapped back to narration.
 * Source: src-web/systems/contract/composerSegmentGuard.ts; report 2026-09-28.
 */

import { describe, expect, it } from 'vitest';
import {
  ComposerSegmentGuardConfigError,
  DEFAULT_COMPOSER_SEGMENT_GUARD_KNOBS,
  composerSegmentGuardKnobsFromGameConfig,
  unwrapNarrationSegmentDialogue,
} from '../../../src-web/systems/contract/composerSegmentGuard';
import { serializeComposerPayload, type ComposerSegment } from '../../../src-web/systems/ui/composerPayload';
import { GAME_CONFIG } from '../../../gameConfig.js';

const dlg = (speaker: string, content: string) => `<dialogue speaker="${speaker}">${content}</dialogue>`;

// Turn 15 of the 2026-09-28 report, trimmed.
const NARRATION =
  'Tử bài phải là những người có nhan sắc sánh ngang Điêu Thuyền. Ngươi lên danh sách Tử bài bao gồm: ' +
  'Triệu Vũ - em gái Triệu Vân, Hạ Hầu Khinh Y - con gái thái thú Chân Định Hạ Hầu Kiệt.';
const PLAYER_LINE = 'Lý Tiệm, đây là danh sách ứng cử viên Tử bài. Ngươi cho người âm thầm tiếp xúc và đưa họ về đây.';
const TURN_15: ComposerSegment[] = [
  { type: 'narration', text: NARRATION },
  { type: 'dialogue', text: PLAYER_LINE, speaker: { kind: 'player' } },
];
const ACTION = serializeComposerPayload(TURN_15, 'Diệp Thần');

describe('unwrapNarrationSegmentDialogue', () => {
  it('test_composer_guard_narration_copied_into_player_dialogue_is_unwrapped', () => {
    const story = `Diệp Thần cầm bút lông. ${dlg('Ngươi', NARRATION)} Lý Tiệm cúi đầu. ${dlg('Ngươi', PLAYER_LINE)}`;
    const out = unwrapNarrationSegmentDialogue(story, ACTION);
    expect(out.text).toBe(`Diệp Thần cầm bút lông. ${NARRATION} Lý Tiệm cúi đầu. ${dlg('Ngươi', PLAYER_LINE)}`);
    expect(out.unwrapped).toHaveLength(1);
    expect(out.unwrapped[0]).toMatchObject({ speaker: 'Ngươi', segment: 1 });
  });

  it('test_composer_guard_lightly_edited_copy_is_still_unwrapped', () => {
    const edited = NARRATION.replace('Ngươi lên danh sách', 'Ngươi viết danh sách');
    const out = unwrapNarrationSegmentDialogue(dlg('Diệp Thần', edited), ACTION);
    expect(out.text).toBe(edited);
  });

  it('test_composer_guard_quote_inside_narration_segment_stays_dialogue', () => {
    const action = serializeComposerPayload(
      [
        { type: 'narration', text: 'Ngươi đập bàn đứng dậy, quát lớn rằng tất cả lùi lại cho ta, rồi rút kiếm ra khỏi vỏ.' },
        { type: 'dialogue', text: 'Ai dám bước lên?', speaker: { kind: 'player' } },
      ],
      'Ngươi',
    );
    const story = `Ngươi đập bàn. ${dlg('Ngươi', 'Tất cả lùi lại cho ta!')}`;
    expect(unwrapNarrationSegmentDialogue(story, action)).toEqual({ text: story, unwrapped: [] });
  });

  it('test_composer_guard_short_dialogue_is_never_unwrapped', () => {
    const action = serializeComposerPayload(
      [
        { type: 'narration', text: 'Đi thôi.' },
        { type: 'dialogue', text: 'Ừ.', speaker: { kind: 'player' } },
      ],
      'Ngươi',
    );
    const story = dlg('Ngươi', 'Đi thôi.');
    expect(unwrapNarrationSegmentDialogue(story, action).text).toBe(story);
  });

  it('test_composer_guard_payload_without_segments_changes_nothing', () => {
    const story = dlg('Ngươi', NARRATION);
    expect(unwrapNarrationSegmentDialogue(story, NARRATION)).toEqual({ text: story, unwrapped: [] });
  });
});

describe('composerSegmentGuardKnobsFromGameConfig', () => {
  it('test_composer_guard_knobs_read_from_game_config', () => {
    expect(composerSegmentGuardKnobsFromGameConfig(GAME_CONFIG as never)).toEqual(DEFAULT_COMPOSER_SEGMENT_GUARD_KNOBS);
  });

  it('test_composer_guard_knobs_out_of_range_throw', () => {
    expect(() =>
      composerSegmentGuardKnobsFromGameConfig({ composerSegmentGuard: { NARRATION_UNWRAP_SIMILARITY: 0 } }),
    ).toThrow(ComposerSegmentGuardConfigError);
    expect(() =>
      composerSegmentGuardKnobsFromGameConfig({ composerSegmentGuard: { NARRATION_UNWRAP_MIN_TOKENS: 0.5 } }),
    ).toThrow(ComposerSegmentGuardConfigError);
  });
});
