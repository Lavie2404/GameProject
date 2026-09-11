/**
 * Contract Enforcement — courtesy names ("tự") are dialogue-only.
 * Reported 2026-09-11: narration read `Đó chính là "Mãnh Hổ Giang Đông"
 * *Tôn Kiên* (tự Văn Đài)!` despite the absolute prompt rule from 013c814.
 */

import { describe, expect, it } from 'vitest';
import {
  scrubCourtesyNames,
  scrubCourtesyNamesOutsideDialogue,
} from '../../../src-web/systems/contract/courtesyName';

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

  it('test_dialogue_is_returned_untouched', () => {
    const input =
      'Tôn Kiên (tự Văn Đài) chắp tay: <dialogue speaker="Tôn Kiên">Tại hạ Tôn Kiên, tự Văn Đài. Văn Đài xin bái kiến!</dialogue> Hắn cười.';
    const out = scrubCourtesyNamesOutsideDialogue(input, ROSTER);
    expect(out.text).toBe(
      'Tôn Kiên chắp tay: <dialogue speaker="Tôn Kiên">Tại hạ Tôn Kiên, tự Văn Đài. Văn Đài xin bái kiến!</dialogue> Hắn cười.',
    );
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
