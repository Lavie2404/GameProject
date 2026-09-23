/**
 * Character starting age + timeline rule (requested 2026-09-23).
 * Time model: App.tsx clock {year, month, day, hour}, origin year 0 / month 1 /
 * day 1, 360-day year.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGE_TIMELINE_RULE,
  CHARACTER_AGE_MISSION,
  DAYS_PER_YEAR,
  MAX_STARTING_AGE,
  ageContextLine,
  ageNarrationLine,
  ageOpeningLine,
  currentAge,
  elapsedDays,
  parseStartingAge,
} from '../../../src-web/systems/character/characterAge';

describe('parseStartingAge', () => {
  it('test_character_age_parses_integers_and_numeric_strings', () => {
    expect(parseStartingAge(18)).toBe(18);
    expect(parseStartingAge('20')).toBe(20);
    expect(parseStartingAge(' 33 ')).toBe(33);
    expect(parseStartingAge(21.9)).toBe(21);
  });

  it('test_character_age_rejects_blank_nonnumeric_and_out_of_range', () => {
    expect(parseStartingAge('')).toBeNull();
    expect(parseStartingAge(null)).toBeNull();
    expect(parseStartingAge(undefined)).toBeNull();
    expect(parseStartingAge('mười tám')).toBeNull();
    expect(parseStartingAge(0)).toBeNull();
    expect(parseStartingAge(-5)).toBeNull();
    expect(parseStartingAge(MAX_STARTING_AGE + 1)).toBeNull();
    expect(parseStartingAge(MAX_STARTING_AGE)).toBe(MAX_STARTING_AGE);
  });
});

describe('game clock arithmetic', () => {
  it('test_character_age_origin_is_day_zero', () => {
    expect(elapsedDays({ year: 0, month: 1, day: 1 })).toBe(0);
    expect(elapsedDays(undefined)).toBe(0);
    expect(elapsedDays({})).toBe(0);
  });

  it('test_character_age_uses_360_day_year', () => {
    expect(DAYS_PER_YEAR).toBe(360);
    expect(elapsedDays({ year: 1, month: 1, day: 1 })).toBe(360);
    expect(elapsedDays({ year: 0, month: 12, day: 30 })).toBe(359);
    expect(elapsedDays({ year: 2, month: 3, day: 15 })).toBe(2 * 360 + 60 + 14);
  });

  it('test_character_age_advances_only_on_whole_years', () => {
    expect(currentAge(18, { year: 0, month: 1, day: 1 })).toBe(18);
    expect(currentAge(18, { year: 0, month: 12, day: 30 })).toBe(18);
    expect(currentAge(18, { year: 1, month: 1, day: 1 })).toBe(19);
    expect(currentAge('18', { year: 3, month: 6, day: 2 })).toBe(21);
    expect(currentAge('', { year: 3 })).toBeNull();
  });
});

describe('prompt text', () => {
  it('test_character_age_context_line_shows_age_or_placeholder', () => {
    expect(ageContextLine(20)).toBe('- Độ tuổi bắt đầu: "20 tuổi"');
    expect(ageContextLine('')).toBe('- Độ tuổi bắt đầu: "[Chưa có]"');
  });

  it('test_character_age_rule_states_arithmetic_canon_timeline_and_example', () => {
    expect(AGE_TIMELINE_RULE).toContain('không được vượt quá số tuổi');
    expect(AGE_TIMELINE_RULE).toContain('TRƯỚC hoặc TẠI độ tuổi đó');
    expect(AGE_TIMELINE_RULE).toContain('Triệu Vân');
    expect(AGE_TIMELINE_RULE).toContain('chưa gặp Lưu Bị');
    expect(AGE_TIMELINE_RULE).toContain('[Chưa có]');
    expect(CHARACTER_AGE_MISSION).toContain('số nguyên dương');
  });

  it('test_character_age_narration_line_is_empty_without_age_and_tracks_time', () => {
    expect(ageNarrationLine('', { year: 5 })).toBe('');
    expect(ageNarrationLine(18, { year: 0, month: 1, day: 1 })).toContain('18 tuổi.');
    expect(ageNarrationLine(18, { year: 0, month: 1, day: 1 })).not.toContain('bắt đầu hành trình');
    const later = ageNarrationLine(18, { year: 2, month: 1, day: 1 });
    expect(later).toContain('20 tuổi');
    expect(later).toContain('bắt đầu hành trình ở 18 tuổi');
  });

  it('test_character_age_opening_line_pins_the_timeline', () => {
    expect(ageOpeningLine('')).toBe('');
    const line = ageOpeningLine(20);
    expect(line).toContain('20 tuổi');
    expect(line).toContain('mở đầu tại đúng mốc thời gian');
    expect(line).toContain('chưa tồn tại');
  });
});

describe('App.tsx wiring', () => {
  const APP_SRC = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');

  it('test_character_age_setting_has_default_input_and_suggest_button', () => {
    expect(APP_SRC).toContain("characterAge: ''");
    expect(APP_SRC).toContain('name="characterAge"');
    expect(APP_SRC).toContain('fieldName="characterAge"');
  });

  it('test_character_age_rule_reaches_all_three_setup_prompts_and_the_game_start', () => {
    for (const handler of [
      'const handleGenerateImpromptuCharacter = async',
      'const handleGenerateSingleField = async',
      'const handleFillAllMissingFields = async',
    ]) {
      const start = APP_SRC.indexOf(handler);
      expect(start, handler).toBeGreaterThan(-1);
      expect(APP_SRC.slice(start, start + 12000), handler).toContain('AGE_TIMELINE_RULE');
    }
    expect(APP_SRC).toContain('Age: parseStartingAge(finalSettings.characterAge)');
    expect((APP_SRC.match(/ageOpeningLine\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('test_character_age_reaches_both_per_turn_prompts', () => {
    expect((APP_SRC.match(/ageNarrationLine\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
