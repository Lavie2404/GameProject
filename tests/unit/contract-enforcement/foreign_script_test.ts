/**
 * Contract Enforcement — rule 1.5 ("CHỈ VIẾT BẰNG CHỮ QUỐC NGỮ").
 * Guards the deterministic half of the rule: no foreign writing system may
 * survive into a saved field. Reported case 2026-09-10: an appraised NPC's
 * Ngoại hình came back as "Dung貌 thanh tú tuyệt luân".
 */

import { describe, expect, it } from 'vitest';
import {
  correctionInstruction,
  describeViolations,
  findForeignRuns,
  hasForeignScript,
  scanFieldsForForeignScript,
  scriptOf,
} from '../../../src-web/systems/contract/foreignScript';
import {
  QUOC_NGU_ONLY_JSON_FIELDS,
  QUOC_NGU_ONLY_NARRATION,
  SCOPE_JSON_FIELDS,
  SCOPE_NARRATION,
  quocNguOnlyRule,
} from '../../../src-web/systems/contract/languagePurity';

describe('foreign script detection', () => {
  it('test_clean_vietnamese_text_is_not_flagged', () => {
    const clean =
      'Dung mạo thanh tú tuyệt luân, da trắng như tuyết, đôi mắt trong veo như làn nước mùa thu.';
    expect(hasForeignScript(clean)).toBe(false);
    expect(findForeignRuns(clean)).toEqual([]);
  });

  it('test_every_vietnamese_diacritic_stays_clean', () => {
    // The full set of Vietnamese letters must never register as foreign —
    // this is the false-positive guard that matters most.
    const alphabet =
      'aăâbcdđeêghiklmnoôơpqrstuưvxy áàảãạ ấầẩẫậ éèẻẽẹ ếềểễệ íìỉĩị óòỏõọ ốồổỗộ ớờởỡợ úùủũụ ứừửữự ýỳỷỹỵ ' +
      'AĂÂBCDĐEÊGHIKLMNOÔƠPQRSTUƯVXY ÁÀẢÃẠ ẤẦẨẪẬ ÉÈẺẼẸ ẾỀỂỄỆ ÍÌỈĨỊ ÓÒỎÕỌ ỐỒỔỖỘ ỚỜỞỠỢ ÚÙỦŨỤ ỨỪỬỮỰ ÝỲỶỸỴ';
    expect(findForeignRuns(alphabet)).toEqual([]);
  });

  it('test_punctuation_and_digits_stay_clean', () => {
    expect(hasForeignScript('Cấp 3 — "Kiếm Thánh" (HP: 120/200) … 50%!')).toBe(false);
  });

  it('test_reported_case_dung_mao_is_flagged', () => {
    const runs = findForeignRuns('Dung貌 thanh tú tuyệt luân');
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('貌');
    expect(runs[0].script).toBe('Hán');
    expect(runs[0].index).toBe(4);
  });

  it('test_rule_own_example_tam_niem_is_flagged', () => {
    // The example rule 1.5 itself cites, so the detector and the prompt rule
    // agree on what a violation is.
    const runs = findForeignRuns('Ngươi tâm念 vừa động');
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('念');
  });

  it('test_cyrillic_example_from_the_rule_is_flagged', () => {
    const runs = findForeignRuns('sức mạnh физи thể chất');
    expect(runs).toHaveLength(1);
    expect(runs[0].script).toBe('Kirin');
    expect(runs[0].text).toBe('физи');
  });

  it('test_kana_and_hangul_are_flagged', () => {
    expect(findForeignRuns('thanh kiếm かたな')[0].script).toBe('Kana');
    expect(findForeignRuns('lời chào 안녕')[0].script).toBe('Hangul');
  });

  it('test_adjacent_same_script_chars_merge_into_one_run', () => {
    const runs = findForeignRuns('công pháp 天地玄黃 huyền diệu');
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('天地玄黃');
  });

  it('test_separate_runs_stay_separate', () => {
    const runs = findForeignRuns('tâm念 và khí氣');
    expect(runs.map((r) => r.text)).toEqual(['念', '氣']);
  });

  it('test_supplementary_plane_han_is_flagged_as_one_character', () => {
    // CJK Extension B (U+20000+) is a surrogate pair in UTF-16: scanning by
    // code unit would report it as two unrelated characters, or miss it.
    const runs = findForeignRuns('chữ 𠀀 hiếm');
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('\u{20000}');
    expect([...runs[0].text]).toHaveLength(1);
  });

  it('test_script_of_single_char', () => {
    expect(scriptOf('貌')).toBe('Hán');
    expect(scriptOf('a')).toBeNull();
    expect(scriptOf('ệ')).toBeNull();
  });

  it('test_empty_and_non_string_inputs_are_safe', () => {
    expect(findForeignRuns('')).toEqual([]);
    expect(findForeignRuns(null)).toEqual([]);
    expect(findForeignRuns(undefined)).toEqual([]);
    expect(findForeignRuns(42)).toEqual([]);
  });
});

describe('scanning a parsed AI response', () => {
  it('test_reports_the_offending_field_by_name', () => {
    const npc = {
      Gender: 'Nữ',
      Appearance: 'Dung貌 thanh tú tuyệt luân',
      Backstory: 'Xuất thân từ thế gia vọng tộc Chân thị.',
      level: 12,
    };
    const found = scanFieldsForForeignScript(npc);
    expect(found).toHaveLength(1);
    expect(found[0].field).toBe('Appearance');
    expect(found[0].runs[0].text).toBe('貌');
  });

  it('test_clean_response_yields_nothing', () => {
    expect(scanFieldsForForeignScript({ a: 'sạch sẽ', b: ['ổn', 'tốt'], c: 7 })).toEqual([]);
  });

  it('test_walks_nested_objects_and_arrays_with_dotted_paths', () => {
    const quest = { title: 'Tầm long', steps: [{ text: 'đi về 東' }, { text: 'ổn' }] };
    const found = scanFieldsForForeignScript(quest);
    expect(found).toHaveLength(1);
    expect(found[0].field).toBe('steps[0].text');
  });
});

describe('retry instruction', () => {
  it('test_names_the_field_the_character_and_the_script', () => {
    const msg = correctionInstruction(scanFieldsForForeignScript({ Appearance: 'Dung貌 thanh tú' }));
    expect(msg).toContain('Appearance');
    expect(msg).toContain('貌');
    expect(msg).toContain('Hán');
  });

  it('test_forbids_both_keeping_and_blank_deleting', () => {
    const msg = correctionInstruction(scanFieldsForForeignScript({ x: '念' }));
    expect(msg).toContain('không giữ lại');
    expect(msg).toContain('KHÔNG được xoá trắng');
  });

  it('test_describe_is_a_single_line_summary', () => {
    const line = describeViolations(scanFieldsForForeignScript({ a: '貌', b: 'физи' }));
    expect(line).toBe('a: 貌[Hán] | b: физи[Kirin]');
  });
});

describe('shared rule text', () => {
  it('test_narration_variant_keeps_its_original_scope_wording', () => {
    expect(QUOC_NGU_ONLY_NARRATION).toContain(SCOPE_NARRATION);
    expect(QUOC_NGU_ONLY_NARRATION).toContain('văn tường thuật, hội thoại, và 4 gợi ý hành động');
  });

  it('test_json_variant_targets_response_fields_instead', () => {
    expect(QUOC_NGU_ONLY_JSON_FIELDS).toContain(SCOPE_JSON_FIELDS);
    expect(QUOC_NGU_ONLY_JSON_FIELDS).not.toContain('4 gợi ý hành động');
  });

  it('test_both_variants_share_the_substance_verbatim', () => {
    // Only the scope sentence may differ — that is the whole point of
    // extracting the rule, so it cannot drift between prompts again.
    const body = (rule: string) => rule.split('\n').slice(2).join('\n');
    expect(body(QUOC_NGU_ONLY_JSON_FIELDS)).toBe(body(QUOC_NGU_ONLY_NARRATION));
    expect(body(QUOC_NGU_ONLY_NARRATION)).toContain('tâm念');
    expect(body(QUOC_NGU_ONLY_NARRATION)).toContain('физи');
  });

  it('test_rule_still_bans_han_characters_explicitly', () => {
    expect(QUOC_NGU_ONLY_JSON_FIELDS).toContain('chữ Hán/Kana/Hangul/Kirin');
    expect(QUOC_NGU_ONLY_JSON_FIELDS).toContain('TUYỆT ĐỐI KHÔNG viết trực tiếp ký tự Hán gốc');
  });

  it('test_scope_is_injected_verbatim', () => {
    expect(quocNguOnlyRule('MỘT PHẠM VI THỬ')).toContain('MỘT PHẠM VI THỬ');
  });
});
