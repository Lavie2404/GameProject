/**
 * Narration lint - the post-hoc measure for Pillar 1 and NPC line repetition.
 * Design doc: design/gdd/game-concept.md "Pillar 1" (243-255);
 * prompt side: src-web/systems/contract/narrationDirectives.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NARRATION_LINT_KNOBS,
  NarrationLintConfigError,
  assertNarrationLintKnobs,
  findRepeatedLines,
  formatLintReportForConsole,
  lineSimilarity,
  lintNarration,
  narrationLintContextFromKnowledge,
  narrationLintKnobsFromGameConfig,
  recentDialogueLinesFromHistory,
  splitNarration,
  type LintContext,
} from '../../../src-web/systems/contract/narrationLint';
import {
  buildGoldenCapture,
  createGoldenCaptureStore,
  parseGoldenCaptureDocument,
  type StorageLike,
} from '../../../src-web/systems/contract/goldenCapture';
import { GAME_CONFIG } from '../../../gameConfig.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KNOBS = DEFAULT_NARRATION_LINT_KNOBS;

function ctx(overrides: Partial<LintContext> = {}): LintContext {
  return {
    player: { name: 'Diệp Thần', level: 12 },
    npcs: [
      { name: 'Tiểu Vân', level: 11, affinity: 90 },
      { name: 'Trưởng lão', level: 60, affinity: 45 },
    ],
    recentLines: [],
    ...overrides,
  };
}

const dlg = (speaker: string, content: string) => `<dialogue speaker="${speaker}">${content}</dialogue>`;

// ---------------------------------------------------------------------------
// splitNarration
// ---------------------------------------------------------------------------

describe('splitNarration', () => {
  it('test_narration_lint_split_separates_narrator_text_from_dialogue', () => {
    const text = 'Gió thổi qua. ' + dlg('Tiểu Vân', 'Chàng ổn chứ?') + ' Nàng nhìn hắn.';
    const out = splitNarration(text);
    expect(out.dialogues).toEqual([{ speaker: 'Tiểu Vân', content: 'Chàng ổn chứ?' }]);
    expect(out.narration).toBe('Gió thổi qua.\nNàng nhìn hắn.');
  });

  it('test_narration_lint_split_empty_input_yields_empty', () => {
    expect(splitNarration('')).toEqual({ narration: '', dialogues: [] });
  });
});

// ---------------------------------------------------------------------------
// Objective praise (narrator voice)
// ---------------------------------------------------------------------------

describe('objective praise', () => {
  it('test_narration_lint_narrator_superiority_claim_is_flagged', () => {
    const text = 'Một luồng khí thế kinh người bùng lên, thiên phú của ngươi quả thật vô song.';
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.counts.objective_praise).toBeGreaterThanOrEqual(1);
    expect(report.violations[0].kind).toBe('objective_praise');
    expect(report.violations[0].speaker).toBeUndefined();
  });

  it('test_narration_lint_same_phrase_inside_dialogue_is_not_objective_praise', () => {
    const text = dlg('Tiểu Vân', 'Khí thế kinh người thật đấy.');
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.counts.objective_praise).toBe(0);
  });

  it('test_narration_lint_markdown_stars_do_not_hide_a_phrase', () => {
    const text = 'Ai cũng phải *thừa nhận* *Diệp Thần* hơn người.';
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.counts.objective_praise).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ungrounded / superior praise (dialogue)
// ---------------------------------------------------------------------------

describe('ungrounded praise', () => {
  it('test_narration_lint_directive_wrong_example_is_flagged_as_ungrounded', () => {
    // The SAI example written into DIRECTIVE_P1_GROUNDED_PRAISE.
    const text = dlg('Tiểu Vân', 'Chàng quả là thiên tài vô song, ta tin chàng sẽ đứng trên đỉnh thiên hạ!');
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.counts.ungrounded_praise).toBeGreaterThanOrEqual(2);
    expect(report.violations.every((v) => v.speaker === 'Tiểu Vân')).toBe(true);
  });

  it('test_narration_lint_directive_right_example_is_clean', () => {
    const text =
      dlg('Tiểu Vân', 'Đòn vừa rồi nhanh hơn hôm qua rồi đó… nhưng chàng đừng liều thế nữa, ta sợ.') +
      dlg('Trưởng lão', 'Ừm. Bộ pháp có chút nền tảng. Về luyện thêm ba tháng rồi hãy nói chuyện.');
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.violations).toEqual([]);
  });

  it('test_narration_lint_superior_npc_generic_praise_is_superior_overpraise', () => {
    const text = dlg('Trưởng lão', 'Ngươi là kỳ tài trăm năm hiếm có.');
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.counts.superior_overpraise).toBeGreaterThanOrEqual(1);
    expect(report.counts.ungrounded_praise).toBe(0);
  });

  it('test_narration_lint_player_own_line_is_never_flagged', () => {
    const text = dlg('Ngươi', 'Ta chính là thiên tài vô song!') + dlg('Diệp Thần', 'Thiên tài là ta.');
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.violations).toEqual([]);
  });

  it('test_narration_lint_unknown_speaker_defaults_to_peer_tone', () => {
    const text = dlg('Lão ăn mày', 'Tiểu tử này thiên tài đấy.');
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.counts.ungrounded_praise).toBe(1);
    expect(report.counts.superior_overpraise).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Repeated lines
// ---------------------------------------------------------------------------

describe('repeated lines', () => {
  const recent = [
    { speaker: 'Tiểu Vân', content: 'Chàng đi cẩn thận, ta ở đây đợi chàng về.' },
    { speaker: 'Tiểu Vân', content: 'Hôm nay trời đẹp quá đi mất.' },
  ];

  it('test_narration_lint_identical_line_from_history_is_flagged', () => {
    const text = dlg('Tiểu Vân', 'Chàng đi cẩn thận, ta ở đây đợi chàng về.');
    const report = lintNarration(text, ctx({ recentLines: recent }), KNOBS);
    expect(report.counts.repeated_line).toBe(1);
    expect(report.violations[0].similarity).toBe(1);
  });

  it('test_narration_lint_light_paraphrase_is_flagged', () => {
    const text = dlg('Tiểu Vân', 'Chàng đi cẩn thận nhé, ta ở đây đợi chàng về.');
    const report = lintNarration(text, ctx({ recentLines: recent }), KNOBS);
    expect(report.counts.repeated_line).toBe(1);
  });

  it('test_narration_lint_different_line_is_clean', () => {
    const text = dlg('Tiểu Vân', 'Vết máu trên vai chàng kìa, ngồi xuống để ta xem.');
    const report = lintNarration(text, ctx({ recentLines: recent }), KNOBS);
    expect(report.counts.repeated_line).toBe(0);
  });

  it('test_narration_lint_same_words_from_other_speaker_is_clean', () => {
    const text = dlg('Trưởng lão', 'Chàng đi cẩn thận, ta ở đây đợi chàng về.');
    const report = lintNarration(text, ctx({ recentLines: recent }), KNOBS);
    expect(report.counts.repeated_line).toBe(0);
  });

  it('test_narration_lint_short_line_is_never_a_repeat', () => {
    const short = [{ speaker: 'Tiểu Vân', content: 'Ừm, được.' }];
    const text = dlg('Tiểu Vân', 'Ừm, được.');
    const report = lintNarration(text, ctx({ recentLines: short }), KNOBS);
    expect(report.counts.repeated_line).toBe(0);
  });

  it('test_narration_lint_repeat_within_same_response_is_flagged', () => {
    const text =
      dlg('Tiểu Vân', 'Chàng nhất định phải trở về bình an đấy nhé.') +
      ' Nàng quay đi rồi lại ngoảnh lại. ' +
      dlg('Tiểu Vân', 'Chàng nhất định phải trở về bình an đấy nhé.');
    const report = lintNarration(text, ctx(), KNOBS);
    expect(report.counts.repeated_line).toBe(1);
  });

  it('test_narration_lint_window_only_compares_against_last_n_lines', () => {
    const old = { speaker: 'Tiểu Vân', content: 'Câu này đã cũ lắm rồi, nói từ đầu game.' };
    const fillers = Array.from({ length: KNOBS.REPEAT_WINDOW_PER_SPEAKER }, (_, i) => ({
      speaker: 'Tiểu Vân',
      content: `Câu đệm số ${i} hoàn toàn khác biệt về nội dung.`,
    }));
    const dialogues = [{ speaker: 'Tiểu Vân', content: old.content }];
    const out = findRepeatedLines(dialogues, ctx({ recentLines: [old, ...fillers] }), KNOBS);
    expect(out).toEqual([]);
  });

  it('test_narration_lint_similarity_is_symmetric_and_bounded', () => {
    const a = 'Chàng đi cẩn thận nhé';
    const b = 'Chàng đi cẩn thận nhé, ta đợi';
    expect(lineSimilarity(a, b)).toBe(lineSimilarity(b, a));
    expect(lineSimilarity(a, a)).toBe(1);
    expect(lineSimilarity(a, 'hoàn toàn khác')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

describe('context builders', () => {
  it('test_narration_lint_history_lines_skip_transient_and_non_story_items', () => {
    const history = [
      { type: 'user_choice', content: 'Đi vào rừng' },
      { type: 'story', transient: true, content: [{ type: 'dialogue', speaker: 'A', content: 'tạm thời' }] },
      { type: 'story', content: [{ type: 'narrative', content: 'x' }, { type: 'dialogue', speaker: 'A', content: 'một' }] },
      { type: 'story', content: [{ type: 'dialogue', speaker: 'B', content: 'hai' }, { type: 'dialogue', speaker: 'A', content: 'ba' }] },
    ];
    expect(recentDialogueLinesFromHistory(history, 5)).toEqual([
      { speaker: 'A', content: 'một' },
      { speaker: 'B', content: 'hai' },
      { speaker: 'A', content: 'ba' },
    ]);
    expect(recentDialogueLinesFromHistory(history, 1)).toEqual([
      { speaker: 'B', content: 'hai' },
      { speaker: 'A', content: 'ba' },
    ]);
  });

  it('test_narration_lint_context_uses_same_presence_filter_as_npcs_string', () => {
    const characters = [
      { Name: 'Diệp Thần', isPlayer: true, level: 12, current_location_id: 'loc1' },
      { Name: 'Tiểu Vân', isCompanion: true, level: 11, affinity: 90, current_location_id: 'loc9' },
      { Name: 'Trưởng lão', level: 60, affinity: 45, current_location_id: 'loc1' },
      { Name: 'Người xa', level: 20, current_location_id: 'loc2' },
      { Name: 'Kẻ chết', level: 5, isPermanentlyDead: true, current_location_id: 'loc1' },
      { Name: 'Toàn cục', level: 3 },
    ];
    const out = narrationLintContextFromKnowledge(characters, [], KNOBS);
    expect(out.player).toEqual({ name: 'Diệp Thần', level: 12 });
    expect(out.npcs.map((n) => n.name)).toEqual(['Tiểu Vân', 'Trưởng lão', 'Toàn cục']);
    expect(out.npcs[2].affinity).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Knobs
// ---------------------------------------------------------------------------

describe('knobs', () => {
  it('test_narration_lint_game_config_block_loads_and_validates', () => {
    const knobs = narrationLintKnobsFromGameConfig(GAME_CONFIG as Record<string, unknown>);
    expect(knobs.OBJECTIVE_PRAISE_PHRASES.length).toBeGreaterThan(0);
    expect(knobs.REPEAT_SIMILARITY_THRESHOLD).toBe(
      (GAME_CONFIG as Record<string, any>).narrationLint.REPEAT_SIMILARITY_THRESHOLD,
    );
  });

  it('test_narration_lint_missing_block_falls_back_to_defaults', () => {
    expect(narrationLintKnobsFromGameConfig({})).toEqual(DEFAULT_NARRATION_LINT_KNOBS);
  });

  it('test_narration_lint_bad_threshold_fails_loud', () => {
    expect(() => assertNarrationLintKnobs({ REPEAT_SIMILARITY_THRESHOLD: 0 })).toThrow(NarrationLintConfigError);
    expect(() => assertNarrationLintKnobs({ REPEAT_SIMILARITY_THRESHOLD: 1.2 })).toThrow(NarrationLintConfigError);
    expect(() => assertNarrationLintKnobs({ REPEAT_MIN_TOKENS: 0 })).toThrow(NarrationLintConfigError);
    expect(() => assertNarrationLintKnobs({ GENERIC_PRAISE_PHRASES: [] })).toThrow(NarrationLintConfigError);
  });
});

// ---------------------------------------------------------------------------
// Report formatting + golden capture store
// ---------------------------------------------------------------------------

describe('reporting and capture', () => {
  it('test_narration_lint_console_format_lists_each_finding_in_vietnamese', () => {
    const report = lintNarration(dlg('Tiểu Vân', 'Chàng là thiên tài.'), ctx(), KNOBS);
    const text = formatLintReportForConsole(report);
    expect(text).toContain('NPC khen chung chung');
    expect(text).toContain('[Tiểu Vân]');
    expect(formatLintReportForConsole(lintNarration('Trời mưa.', ctx(), KNOBS))).toBe('Sạch (0 vi phạm).');
  });

  function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
    const data = { ...seed };
    return {
      data,
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = v;
      },
      removeItem: (k) => {
        delete data[k];
      },
    };
  }

  const sampleInput = () => ({
    turn: 7,
    context: { ...ctx(), action: 'Chào hỏi', locked_summary: 'NPC gật đầu.' },
    prompt: 'PROMPT',
    response: 'RESPONSE',
    lint: lintNarration('Trời mưa.', ctx(), KNOBS),
  });

  it('test_narration_lint_capture_store_is_off_unless_flag_is_set', () => {
    const storage = memoryStorage();
    const store = createGoldenCaptureStore({ storage, now: () => '2026-09-23T00:00:00Z' });
    expect(store.enabled()).toBe(false);
    expect(store.record(sampleInput())).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('test_narration_lint_capture_store_records_and_exports_when_enabled', () => {
    const storage = memoryStorage({ golden_capture: '1', golden_scenario_id: 'S03' });
    const store = createGoldenCaptureStore({ storage, now: () => '2026-09-23T00:00:00Z', maxCaptures: 2 });
    expect(store.record(sampleInput())).toBe(true);
    expect(store.record(sampleInput())).toBe(true);
    expect(store.record(sampleInput())).toBe(true);
    expect(store.list()).toHaveLength(2);
    const doc = parseGoldenCaptureDocument(store.exportJson());
    expect(doc.captures[0].scenario_id).toBe('S03');
    expect(doc.captures[0].turn).toBe(7);
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it('test_narration_lint_capture_survives_storage_quota_failure', () => {
    const storage = memoryStorage({ golden_capture: '1' });
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const store = createGoldenCaptureStore({ storage, now: () => 'now' });
    expect(store.record(sampleInput())).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it('test_narration_lint_build_capture_labels_unlabelled_scenarios', () => {
    const c = buildGoldenCapture({ ...sampleInput(), scenario_id: '  ', now: () => 'now' });
    expect(c.scenario_id).toBe('unlabelled');
    expect(c.schema).toBe(1);
  });

  it('test_narration_lint_parse_rejects_foreign_documents', () => {
    expect(() => parseGoldenCaptureDocument('{"schema":9,"captures":[]}')).toThrow();
    expect(() => parseGoldenCaptureDocument('[]')).toThrow();
  });
});
