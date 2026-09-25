/**
 * Narration guard - prevent block + cure instruction + decision rule.
 * Design doc: design/gdd/game-concept.md "Pillar 1"; pattern mirrors the
 * Quốc ngữ guard in App.tsx `fetchWithRetries`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NARRATION_GUARD_KNOBS,
  NarrationGuardConfigError,
  PILLAR1_REMINDER_HEADER,
  RECENT_DIALOGUE_BLOCK_HEADER,
  assertNarrationGuardKnobs,
  buildPillar1Reminder,
  buildRecentDialogueBlock,
  correctionInstructionFor,
  decideBetween,
  narrationGuardKnobsFromGameConfig,
  triggeringViolations,
} from '../../../src-web/systems/contract/narrationGuard';
import {
  DEFAULT_NARRATION_LINT_KNOBS,
  lintNarration,
  type LintContext,
} from '../../../src-web/systems/contract/narrationLint';
import { GAME_CONFIG } from '../../../gameConfig.js';

const KNOBS = DEFAULT_NARRATION_GUARD_KNOBS;
const dlg = (speaker: string, content: string) => `<dialogue speaker="${speaker}">${content}</dialogue>`;

function ctx(overrides: Partial<LintContext> = {}): LintContext {
  return {
    player: { name: 'Diệp Thần', level: 12 },
    npcs: [{ name: 'Tiểu Vân', level: 11, affinity: 90 }],
    recentLines: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Prevent block
// ---------------------------------------------------------------------------

describe('recent dialogue block', () => {
  it('test_narration_guard_block_is_empty_when_no_npc_has_spoken', () => {
    expect(buildRecentDialogueBlock([], 'Diệp Thần', KNOBS)).toBe('');
    expect(buildRecentDialogueBlock([{ speaker: 'Ngươi', content: 'Chào.' }], 'Diệp Thần', KNOBS)).toBe('');
    expect(buildRecentDialogueBlock([{ speaker: 'Diệp Thần', content: 'Chào.' }], 'Diệp Thần', KNOBS)).toBe('');
  });

  it('test_narration_guard_block_lists_npc_lines_grouped_by_speaker', () => {
    const block = buildRecentDialogueBlock(
      [
        { speaker: 'Tiểu Vân', content: 'Chàng đi cẩn thận.' },
        { speaker: 'Ngươi', content: 'Ta đi đây.' },
        { speaker: 'Trưởng lão', content: 'Về luyện thêm ba tháng.' },
        { speaker: 'Tiểu Vân', content: 'Ta đợi chàng về.' },
      ],
      'Diệp Thần',
      KNOBS,
    );
    expect(block.startsWith(RECENT_DIALOGUE_BLOCK_HEADER)).toBe(true);
    expect(block).toContain('- Tiểu Vân: "Chàng đi cẩn thận." | "Ta đợi chàng về."');
    expect(block).toContain('- Trưởng lão: "Về luyện thêm ba tháng."');
    expect(block).not.toContain('Ta đi đây');
  });

  it('test_narration_guard_block_keeps_only_newest_lines_per_speaker', () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({ speaker: 'Tiểu Vân', content: `Câu số ${i}.` }));
    const block = buildRecentDialogueBlock(lines, 'Diệp Thần', { ...KNOBS, RECENT_LINES_PROMPT_PER_SPEAKER: 3 });
    expect(block).toContain('"Câu số 7." | "Câu số 8." | "Câu số 9."');
    expect(block).not.toContain('Câu số 6.');
  });

  it('test_narration_guard_block_respects_char_cap_dropping_oldest_first', () => {
    const long = 'x'.repeat(300);
    const lines = [
      { speaker: 'A', content: `ALPHA ${long}` },
      { speaker: 'A', content: `BETA ${long}` },
      { speaker: 'B', content: `GAMMA ${long}` },
    ];
    // A cap just under the full block forces exactly one drop: A's oldest line.
    const full = buildRecentDialogueBlock(lines, 'P', { ...KNOBS, RECENT_LINES_PROMPT_MAX_CHARS: 100000 });
    const cap = full.length - 50;
    const block = buildRecentDialogueBlock(lines, 'P', { ...KNOBS, RECENT_LINES_PROMPT_MAX_CHARS: cap });
    expect(block.length).toBeLessThanOrEqual(cap);
    expect(block).toContain('BETA ');
    expect(block).toContain('GAMMA ');
    expect(block).not.toContain('ALPHA ');
  });

  it('test_narration_guard_block_collapses_whitespace_inside_lines', () => {
    const block = buildRecentDialogueBlock([{ speaker: 'A', content: 'xin   chào\n  bạn' }], 'P', KNOBS);
    expect(block).toContain('"xin chào bạn"');
  });
});

// ---------------------------------------------------------------------------
// Pillar 1 end-of-prompt reminder
// ---------------------------------------------------------------------------

describe('pillar 1 reminder', () => {
  it('test_narration_guard_reminder_has_three_rules_and_the_lint_phrase_list', () => {
    const text = buildPillar1Reminder(DEFAULT_NARRATION_LINT_KNOBS);
    expect(text.startsWith(PILLAR1_REMINDER_HEADER)).toBe(true);
    expect(text).toContain('1. Người kể KHÔNG khẳng định');
    expect(text).toContain('2. NPC khen phải chỉ vào MỘT việc cụ thể');
    expect(text).toContain('3. NPC quyết định theo lợi ích');
    expect(text).toContain(`từ ${DEFAULT_NARRATION_LINT_KNOBS.SUPERIOR_NPC_LEVEL_GAP} cấp trở lên`);
    for (const p of DEFAULT_NARRATION_LINT_KNOBS.GENERIC_PRAISE_PHRASES.slice(0, 8)) expect(text).toContain(`"${p}"`);
  });

  it('test_narration_guard_reminder_caps_the_phrase_list', () => {
    const text = buildPillar1Reminder(DEFAULT_NARRATION_LINT_KNOBS, 2);
    expect(text).toContain(`"${DEFAULT_NARRATION_LINT_KNOBS.GENERIC_PRAISE_PHRASES[0]}"`);
    expect(text).toContain(`"${DEFAULT_NARRATION_LINT_KNOBS.GENERIC_PRAISE_PHRASES[1]}"`);
    expect(text).not.toContain(`"${DEFAULT_NARRATION_LINT_KNOBS.GENERIC_PRAISE_PHRASES[2]}"`);
  });

  it('test_narration_guard_reminder_is_clean_under_its_own_lint', () => {
    // The reminder quotes banned phrases; it must never be linted as narration
    // (it lives in the prompt, not the response) - but sanity-check that the
    // sentences themselves carry no objective-praise phrase.
    const text = buildPillar1Reminder(DEFAULT_NARRATION_LINT_KNOBS, 1);
    const report = lintNarration(text.replace(/"[^"]+"/g, ''), ctx());
    expect(report.counts.objective_praise).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cure instruction + decision
// ---------------------------------------------------------------------------

describe('cure', () => {
  const recent = [{ speaker: 'Tiểu Vân', content: 'Chàng đi cẩn thận, ta ở đây đợi chàng về.' }];

  it('test_narration_guard_triggering_violations_follow_the_kinds_knob', () => {
    const text = dlg('Tiểu Vân', 'Chàng đi cẩn thận, ta ở đây đợi chàng về.') + dlg('Tiểu Vân', 'Chàng là thiên tài.');
    const report = lintNarration(text, ctx({ recentLines: recent }));
    expect(report.counts.repeated_line).toBe(1);
    expect(report.counts.ungrounded_praise).toBe(1);
    expect(triggeringViolations(report, KNOBS).map((v) => v.kind)).toEqual(['repeated_line']);
    expect(
      triggeringViolations(report, { ...KNOBS, GUARD_RETRY_KINDS: ['repeated_line', 'ungrounded_praise'] }),
    ).toHaveLength(2);
  });

  it('test_narration_guard_correction_names_the_repeated_line_and_its_source', () => {
    const text = dlg('Tiểu Vân', 'Chàng đi cẩn thận, ta ở đây đợi chàng về.');
    const report = lintNarration(text, ctx({ recentLines: recent }));
    const instruction = correctionInstructionFor(triggeringViolations(report, KNOBS));
    expect(instruction).toContain('SỬA LẠI (LẦN 2)');
    expect(instruction).toContain('Tiểu Vân đã nói trước đó: "Chàng đi cẩn thận, ta ở đây đợi chàng về."');
    expect(instruction).toContain('lượt này lại viết: "Chàng đi cẩn thận, ta ở đây đợi chàng về."');
    expect(instruction).toContain('Viết lại TOÀN BỘ phản hồi');
  });

  it('test_narration_guard_correction_handles_praise_kinds_for_step_2', () => {
    const text = 'Một luồng khí thế kinh người bùng lên quanh ngươi. ' + dlg('Tiểu Vân', 'Chàng là thiên tài.');
    const report = lintNarration(text, ctx());
    const instruction = correctionInstructionFor(report.violations);
    expect(instruction).toContain('người kể tự khẳng định');
    expect(instruction).toContain('NPC khen chung chung');
    expect(instruction).toContain('Người kể viết:');
    expect(instruction).toContain('Tiểu Vân viết: "Chàng là thiên tài."');
  });

  it('test_narration_guard_correction_names_the_convert_calque_and_the_vietnamese_fix', () => {
    // Arrange: the 2026-09-25 report line, with the guard configured to cure it.
    const text = dlg('Ngươi', 'Ninh An muội nhi, ta thấy đầu óc hơi chếnh choáng rồi.');
    const report = lintNarration(text, ctx());
    const knobs = { ...KNOBS, GUARD_RETRY_KINDS: ['convert_register'] as const };
    // Act
    const triggering = triggeringViolations(report, knobs);
    const instruction = correctionInstructionFor(triggering);
    // Assert
    expect(triggering.map((v) => v.kind)).toEqual(['convert_register']);
    expect(instruction).toContain('hậu tố "nhi"');
    expect(instruction).toContain('Ngươi viết: "Ninh An muội nhi, ta thấy đầu óc hơi chếnh choáng rồi." (cụm vi phạm: "muội nhi")');
    expect(instruction).toContain('"Tên + muội"');
  });

  it('test_narration_guard_correction_is_empty_without_violations', () => {
    expect(correctionInstructionFor([])).toBe('');
  });

  it('test_narration_guard_decision_prefers_fewer_triggering_violations_tie_to_second', () => {
    const bad = lintNarration(dlg('Tiểu Vân', 'Chàng đi cẩn thận, ta ở đây đợi chàng về.'), ctx({ recentLines: recent }));
    const good = lintNarration(dlg('Tiểu Vân', 'Vết máu trên vai chàng kìa, ngồi xuống để ta xem.'), ctx({ recentLines: recent }));
    expect(decideBetween(bad, good, KNOBS)).toEqual({ keep: 'second', first_triggering: 1, second_triggering: 0 });
    expect(decideBetween(good, bad, KNOBS)).toEqual({ keep: 'first', first_triggering: 0, second_triggering: 1 });
    expect(decideBetween(bad, bad, KNOBS).keep).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// Knobs
// ---------------------------------------------------------------------------

describe('knobs', () => {
  it('test_narration_guard_game_config_block_loads', () => {
    const k = narrationGuardKnobsFromGameConfig(GAME_CONFIG as Record<string, unknown>);
    expect(k.GUARD_RETRY_KINDS).toContain('repeated_line');
    expect(k.GUARD_RETRY_MAX).toBe((GAME_CONFIG as Record<string, any>).narrationLint.GUARD_RETRY_MAX);
  });

  it('test_narration_guard_missing_block_falls_back_to_defaults', () => {
    expect(narrationGuardKnobsFromGameConfig({})).toEqual(DEFAULT_NARRATION_GUARD_KNOBS);
  });

  it('test_narration_guard_bad_knobs_fail_loud', () => {
    expect(() => assertNarrationGuardKnobs({ GUARD_RETRY_MAX: 3 })).toThrow(NarrationGuardConfigError);
    expect(() => assertNarrationGuardKnobs({ GUARD_RETRY_MAX: -1 })).toThrow(NarrationGuardConfigError);
    expect(() => assertNarrationGuardKnobs({ GUARD_RETRY_KINDS: ['nope' as never] })).toThrow(NarrationGuardConfigError);
    expect(() => assertNarrationGuardKnobs({ RECENT_LINES_PROMPT_MAX_CHARS: 10 })).toThrow(NarrationGuardConfigError);
    expect(assertNarrationGuardKnobs({ GUARD_RETRY_MAX: 0 }).GUARD_RETRY_MAX).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// App.tsx wiring (source scan, same technique as pillar1_directives_test.ts)
// ---------------------------------------------------------------------------

describe('App.tsx wiring', () => {
  const APP_SRC = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');

  it('test_narration_guard_prevent_block_sits_between_history_and_output_request', () => {
    const start = APP_SRC.indexOf('const narrativePrompt = `');
    expect(start).toBeGreaterThan(-1);
    const tpl = APP_SRC.slice(start, APP_SRC.indexOf('const narrativePayload', start));
    const hist = tpl.indexOf('${historyBlock}');
    const block = tpl.indexOf('${recentDialogueBlock}');
    const reminder = tpl.indexOf('${pillar1Reminder}');
    const out = tpl.indexOf('YÊU CẦU ĐẦU RA (NGHIÊM NGẶT)');
    expect(hist).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(hist);
    expect(reminder).toBeGreaterThan(block);
    expect(out).toBeGreaterThan(reminder);
  });

  it('test_narration_guard_cure_covers_praise_kinds_in_game_config', () => {
    const kinds = (GAME_CONFIG as Record<string, any>).narrationLint.GUARD_RETRY_KINDS as string[];
    for (const k of ['repeated_line', 'ungrounded_praise', 'superior_overpraise', 'objective_praise', 'missing_thuc', 'convert_register']) {
      expect(kinds).toContain(k);
    }
  });

  it('test_narration_guard_cure_runs_after_the_first_api2_call', () => {
    const call = APP_SRC.indexOf('fetchWithRetries(apiUrl, narrativePayload');
    const cure = APP_SRC.indexOf('correctionInstructionFor(', call);
    const decide = APP_SRC.indexOf('decideBetween(', call);
    expect(call).toBeGreaterThan(-1);
    expect(cure).toBeGreaterThan(call);
    expect(decide).toBeGreaterThan(cure);
  });
});
