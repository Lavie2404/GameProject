/**
 * Contract Enforcement — courtesy names ("tự") are dialogue-only.
 * Reported 2026-09-11: narration read `Đó chính là "Mãnh Hổ Giang Đông"
 * *Tôn Kiên* (tự Văn Đài)!` despite the absolute prompt rule from 013c814.
 */

import { describe, expect, it } from 'vitest';
import {
  courtesyNamePromptTag,
  replaceFormerCourtesyNames,
  scrubCourtesyNames,
  scrubCourtesyNamesOutsideDialogue,
  withCourtesyNameChange,
} from '../../../src-web/systems/contract/courtesyName';

// Reported 2026-09-23: Chân Cơ's Tự was changed "Văn Cơ" -> "Văn Chiêu" on the
// card, but the narration kept using "Văn Cơ" (it lives in the history).
describe('former courtesy names', () => {
  const chanCo = { Name: 'Chân Cơ', CourtesyName: 'Văn Chiêu', formerCourtesyNames: ['Văn Cơ'] };

  it('test_former_courtesy_name_is_replaced_in_prose_and_dialogue', () => {
    const text = '*Chân Văn Cơ* khẽ cười. <dialogue speaker="Diệp Thần">Văn Cơ, nàng nghĩ sao?</dialogue>';
    const out = replaceFormerCourtesyNames(text, [chanCo]);
    expect(out.text).toBe('*Chân Văn Chiêu* khẽ cười. <dialogue speaker="Diệp Thần">Văn Chiêu, nàng nghĩ sao?</dialogue>');
    expect(out.changes).toHaveLength(2);
  });

  it('test_former_courtesy_name_replacement_respects_word_boundaries_and_other_characters', () => {
    const roster = [chanCo, { Name: 'Thái Diễm', CourtesyName: 'Văn Cơ' }];
    // "Văn Cơ" is another character's current Tự -> never touched.
    expect(replaceFormerCourtesyNames('Văn Cơ gảy đàn.', roster).text).toBe('Văn Cơ gảy đàn.');
    // Single-syllable formers are skipped.
    const single = { Name: 'Chân Cơ', CourtesyName: 'Văn Chiêu', formerCourtesyNames: ['Cơ'] };
    expect(replaceFormerCourtesyNames('Chân Cơ bước tới.', [single]).text).toBe('Chân Cơ bước tới.');
    expect(replaceFormerCourtesyNames('', [chanCo]).text).toBe('');
  });

  it('test_courtesy_name_change_bookkeeping_remembers_and_dedupes', () => {
    const a = withCourtesyNameChange({ Name: 'Chân Cơ', CourtesyName: 'Văn Cơ' }, 'Văn Chiêu');
    expect(a).toEqual({ Name: 'Chân Cơ', CourtesyName: 'Văn Chiêu', formerCourtesyNames: ['Văn Cơ'] });
    const b = withCourtesyNameChange(a, 'Văn Cơ'); // back to the old one
    expect(b.CourtesyName).toBe('Văn Cơ');
    expect(b.formerCourtesyNames).toEqual(['Văn Chiêu']);
    const c = withCourtesyNameChange(b, '');
    expect(c.CourtesyName).toBeUndefined();
    expect(c.formerCourtesyNames).toEqual(['Văn Chiêu', 'Văn Cơ']);
  });

  it('test_courtesy_name_prompt_tag_names_abandoned_names', () => {
    expect(courtesyNamePromptTag(chanCo)).toBe(' (Tự: Văn Chiêu; tự cũ "Văn Cơ" ĐÃ BỎ, không dùng)');
    expect(courtesyNamePromptTag({ Name: 'Quan Vũ', CourtesyName: 'Vân Trường' })).toBe(' (Tự: Vân Trường)');
    expect(courtesyNamePromptTag({ Name: 'X' })).toBe('');
  });
});

const ROSTER = [
  { Name: 'Tôn Kiên', CourtesyName: 'Văn Đài' },
  { Name: 'Quan Vũ', CourtesyName: 'Vân Trường' },
  { Name: 'Thái Diễm', CourtesyName: 'Diễm' }, // courtesy contained in the name
  { Name: 'Diệp Thần' }, // no courtesy name at all
];

describe('courtesy name scrub - generic tier (no roster)', () => {
  it('test_reported_case_parenthesised_annotation_is_removed', () => {
    const input = 'Đó chính là "Mãnh Hổ Giang Đông" *Tôn Kiên* (tự Văn Đài)!';
    expect(scrubCourtesyNames(input)).toBe('Đó chính là "Mãnh Hổ Giang Đông" *Tôn Kiên*!');
  });

  it('test_appositive_with_comma_keeps_the_name_and_the_sentence', () => {
    const input = 'Tường thành Ngô Quận do *Tôn Kiên*, tự Văn Đài, trấn giữ.';
    expect(scrubCourtesyNames(input)).toBe('Tường thành Ngô Quận do *Tôn Kiên*, trấn giữ.');
  });

  it('test_appositive_without_comma_and_with_la_is_removed', () => {
    expect(scrubCourtesyNames('Đại danh sĩ Thái Ung tự là Bá Giai khoác trường bào.')).toBe(
      'Đại danh sĩ Thái Ung khoác trường bào.',
    );
  });

  it('test_several_annotations_in_one_sentence_are_all_removed', () => {
    const input =
      'Sáu vị nương tử gồm *Hạ Hầu Khinh Y* (tự Uyển Nhu), *Điêu Thuyền* (tự Tú Nhi), *Triệu Vũ* (tự Vũ Nhi).';
    expect(scrubCourtesyNames(input)).toBe(
      'Sáu vị nương tử gồm *Hạ Hầu Khinh Y*, *Điêu Thuyền*, *Triệu Vũ*.',
    );
  });

  it('test_everyday_word_tu_is_never_touched', () => {
    const inputs = [
      'Hắn tự nhiên cười lớn, tự tin bước tới.',
      'Nàng để tự Diệp Thần quyết định mọi chuyện.',
      'Cánh cửa tự động mở ra.',
      'Từ cổ chí kim, tự cường là gốc.',
    ];
    for (const s of inputs) expect(scrubCourtesyNames(s)).toBe(s);
  });

  it('test_dialogue_introduction_and_direct_address_are_returned_untouched', () => {
    const input =
      'Tôn Kiên (tự Văn Đài) chắp tay: <dialogue speaker="Tôn Kiên">Tại hạ Tôn Kiên, tự Văn Đài. Văn Đài xin bái kiến!</dialogue> Hắn cười.';
    const out = scrubCourtesyNamesOutsideDialogue(input, ROSTER);
    expect(out.text).toBe(
      'Tôn Kiên chắp tay: <dialogue speaker="Tôn Kiên">Tại hạ Tôn Kiên, tự Văn Đài. Văn Đài xin bái kiến!</dialogue> Hắn cười.',
    );
  });

  it('test_reported_case_bracketed_gloss_inside_dialogue_is_removed', () => {
    // Player rule 2026-09-11: in speech a courtesy name introduces or addresses,
    // it never glosses a third party in brackets.
    const input =
      '<dialogue speaker="Bàng Thống">Đúng vậy. Lữ Bố (tự Phụng Tiên) tuy dũng mãnh kiệt xuất, tay sử dụng Phương Thiên Họa Kích, cưỡi Xích Thố xông pha vạn quân.</dialogue>';
    const out = scrubCourtesyNamesOutsideDialogue(input, ROSTER);
    expect(out.text).toBe(
      '<dialogue speaker="Bàng Thống">Đúng vậy. Lữ Bố tuy dũng mãnh kiệt xuất, tay sử dụng Phương Thiên Họa Kích, cưỡi Xích Thố xông pha vạn quân.</dialogue>',
    );
    expect(out.changes).toEqual(['xoá "(tự Phụng Tiên)" trong lời thoại']);
  });

  it('test_dialogue_keeps_courtesy_address_and_ho_plus_tu_forms', () => {
    // Direct address by courtesy name (superior -> subordinate, family) is speech, not a gloss.
    const input =
      '<dialogue speaker="Tào Tháo">Khởi Minh, ngươi cùng Phụng Hiếu và Nguyên Trực đi trước.</dialogue><dialogue speaker="Điêu Thuyền">Khởi Minh ca, thiếp đợi chàng.</dialogue>';
    expect(scrubCourtesyNames(input, ROSTER)).toBe(input);
  });

  it('test_empty_and_non_string_input_do_not_crash', () => {
    expect(scrubCourtesyNames('')).toBe('');
    expect(scrubCourtesyNamesOutsideDialogue(undefined as unknown as string).changes).toEqual([]);
  });
});

describe('courtesy name scrub - roster tier', () => {
  it('test_standalone_courtesy_name_becomes_the_main_name', () => {
    expect(scrubCourtesyNames('*Vân Trường* vuốt râu, ánh mắt trầm ngâm.', ROSTER)).toBe(
      '*Quan Vũ* vuốt râu, ánh mắt trầm ngâm.',
    );
  });

  it('test_surname_plus_courtesy_collapses_to_the_main_name', () => {
    // "Họ + Tự" (Tôn Văn Đài) must not become "Tôn Tôn Kiên".
    expect(scrubCourtesyNames('Tôn Văn Đài phất tay ra hiệu.', ROSTER)).toBe('Tôn Kiên phất tay ra hiệu.');
  });

  it('test_courtesy_contained_in_the_main_name_is_left_alone', () => {
    // Replacing "Diễm" blindly would turn "Thái Diễm" into "Thái Thái Diễm".
    const s = 'Thái Diễm khẽ cúi đầu.';
    expect(scrubCourtesyNames(s, ROSTER)).toBe(s);
  });

  it('test_known_annotation_is_removed_even_without_a_preceding_capitalised_name', () => {
    expect(scrubCourtesyNames('vị tướng quân này, tự Văn Đài, đích thân ra đón.', ROSTER)).toBe(
      'vị tướng quân này, đích thân ra đón.',
    );
  });

  it('test_courtesy_name_glued_to_other_letters_is_not_replaced', () => {
    // Word boundaries: only a whole-word occurrence is the courtesy name.
    const s = 'Vân Trườngg và xVân Trường không phải tên ai.';
    expect(scrubCourtesyNames(s, ROSTER)).toBe(s);
  });

  it('test_changes_are_reported_for_logging', () => {
    const out = scrubCourtesyNamesOutsideDialogue('*Tôn Kiên* (tự Văn Đài) gọi *Vân Trường*.', ROSTER);
    expect(out.text).toBe('*Tôn Kiên* gọi *Quan Vũ*.');
    expect(out.changes.length).toBe(2);
  });
});
