/**
 * Contract Enforcement — rule 1.5, second half: Vietnamese WITH diacritics.
 * Reported case 2026-09-23: "Thân phận / Vai trò" came back as
 * "Mat su an danh tu Thuong Son, che giau than phan that de am tham tim kiem minh chu pho ta."
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeDiacriticsViolations,
  diacriticsCorrectionInstruction,
  findMissingDiacritics,
  hasMissingDiacritics,
  scanFieldsForMissingDiacritics,
} from '../../../src-web/systems/contract/missingDiacritics';
import { QUOC_NGU_ONLY_JSON_FIELDS } from '../../../src-web/systems/contract/languagePurity';
import {
  CHARACTER_ROLE_MISSION,
  KNOWN_FIGURE_ROLE_RULE,
  promptHasKnownFigureRule,
} from '../../../src-web/systems/contract/knownFigureRole';

const REPORTED =
  'Mat su an danh tu Thuong Son, che giau than phan that de am tham tim kiem minh chu pho ta.';

describe('missing diacritics detection', () => {
  it('test_reported_unaccented_role_is_flagged', () => {
    const run = findMissingDiacritics(REPORTED);
    expect(run).not.toBeNull();
    expect(run!.markers).toBeGreaterThanOrEqual(2);
    expect(hasMissingDiacritics(REPORTED)).toBe(true);
  });

  it('test_accented_vietnamese_is_clean', () => {
    expect(hasMissingDiacritics('Mật sứ ẩn danh từ Thường Sơn, che giấu thân phận thật.')).toBe(false);
    expect(hasMissingDiacritics('Tướng lĩnh Thục Hán, tự Tử Long, người Thường Sơn, Chân Định')).toBe(false);
  });

  it('test_one_vietnamese_letter_is_enough_to_pass', () => {
    // A single missing tone mark is a typo, not "written without diacritics".
    expect(hasMissingDiacritics('Mat sứ an danh tu Thuong Son che giau than phan')).toBe(false);
  });

  it('test_short_values_and_foreign_names_are_not_flagged', () => {
    expect(hasMissingDiacritics('John Smith')).toBe(false);
    expect(hasMissingDiacritics('Neo Tokyo')).toBe(false);
    expect(hasMissingDiacritics('Tu Long')).toBe(false);
    expect(hasMissingDiacritics('')).toBe(false);
    expect(hasMissingDiacritics(undefined)).toBe(false);
    expect(hasMissingDiacritics(42)).toBe(false);
  });

  it('test_english_sentence_without_vietnamese_markers_is_not_flagged', () => {
    expect(hasMissingDiacritics('The quick brown fox jumps over the lazy dog near the river bank')).toBe(false);
  });

  it('test_fields_walk_reports_dotted_paths_and_nested_arrays', () => {
    const data = {
      name: 'Triệu Vân',
      role: REPORTED,
      initialTraits: [{ name: 'Thương pháp', description: 'Mot mon thuong phap gia truyen cua nguoi Thuong Son.' }],
    };
    const out = scanFieldsForMissingDiacritics(data);
    expect(out.map((v) => v.field)).toEqual(['role', 'initialTraits[0].description']);
  });

  it('test_correction_instruction_names_field_and_quotes_text', () => {
    const text = diacriticsCorrectionInstruction(scanFieldsForMissingDiacritics({ role: REPORTED }));
    expect(text).toContain('KHÔNG DẤU');
    expect(text).toContain('Trường "role"');
    expect(text).toContain('Mat su an danh');
    expect(text).toContain('CÓ ĐẦY ĐỦ DẤU');
    expect(diacriticsCorrectionInstruction([])).toBe('');
    expect(describeDiacriticsViolations(scanFieldsForMissingDiacritics({ role: REPORTED }))).toContain('role:');
  });

  it('test_quoc_ngu_rule_now_states_diacritics_are_mandatory', () => {
    expect(QUOC_NGU_ONLY_JSON_FIELDS).toContain('ĐẦY ĐỦ DẤU');
    expect(QUOC_NGU_ONLY_JSON_FIELDS).toContain('Mat su an danh tu Thuong Son');
  });
});

describe('known figure role rule', () => {
  it('test_rule_forbids_inventing_an_identity_for_a_known_figure', () => {
    expect(KNOWN_FIGURE_ROLE_RULE).toContain('KHÔNG bịa thân phận mới');
    expect(KNOWN_FIGURE_ROLE_RULE).toContain('Triệu Vân');
    expect(KNOWN_FIGURE_ROLE_RULE).toContain('Tướng lĩnh Thục Hán');
    expect(CHARACTER_ROLE_MISSION).toContain('QUY TẮC NHÂN VẬT CÓ SẴN');
    expect(promptHasKnownFigureRule(KNOWN_FIGURE_ROLE_RULE)).toBe(true);
    expect(promptHasKnownFigureRule('nothing')).toBe(false);
  });

  it('test_app_wires_the_rule_into_all_three_character_prompts', () => {
    const src = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');
    const impromptu = src.indexOf('const handleGenerateImpromptuCharacter = async');
    const single = src.indexOf('const handleGenerateSingleField = async');
    const fillAll = src.indexOf('const handleFillAllMissingFields = async');
    expect(impromptu).toBeGreaterThan(-1);
    expect(single).toBeGreaterThan(-1);
    expect(fillAll).toBeGreaterThan(-1);
    // Each handler's body (up to the next 'const handle' or 3000 chars) references the rule.
    for (const start of [impromptu, single, fillAll]) {
      const body = src.slice(start, start + 12000);
      expect(body).toContain('KNOWN_FIGURE_ROLE_RULE');
    }
    expect(src).toContain('CHARACTER_ROLE_MISSION');
  });

  it('test_app_fetch_wrapper_cures_missing_diacritics', () => {
    const src = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');
    // The scan helpers are defined right above the wrapper; the wrapper calls them.
    const helpers = src.indexOf('const scanResponseForLanguageDefects');
    const wrapper = src.indexOf('const fetchWithRetries = async', helpers);
    expect(helpers).toBeGreaterThan(-1);
    expect(wrapper).toBeGreaterThan(helpers);
    const body = src.slice(helpers, wrapper + 3000);
    expect(body).toContain('scanFieldsForMissingDiacritics');
    expect(body).toContain('diacriticsCorrectionInstruction');
    expect(body).toContain('scanResponseForLanguageDefects(second)');
  });
});
