/**
 * Quota error should name WHICH key ran out and WHICH still works.
 * Reported 2026-09-11: player holds a primary key plus two spares and the 429
 * message told them nothing about either.
 */

import { describe, expect, it } from 'vitest';
import {
  describeKeyPool,
  formatKeyPoolStatus,
  formatSecondsLeft,
  keyPoolStatus,
  keySlotLabel,
} from '../../../src-web/systems/ai/keyPoolStatus';

const POOL = ['KEY_MAIN', 'KEY_SPARE_1', 'KEY_SPARE_2'];

describe('slot labels', () => {
  it('test_labels_match_the_settings_dropdown', () => {
    expect(keySlotLabel(0)).toBe('Key chính');
    expect(keySlotLabel(1)).toBe('Key dự phòng 1');
    expect(keySlotLabel(2)).toBe('Key dự phòng 2');
  });
});

describe('formatSecondsLeft', () => {
  it('test_rounds_up_so_the_number_is_never_optimistic', () => {
    expect(formatSecondsLeft(2.9118)).toBe('3 giây');
    expect(formatSecondsLeft(0.1)).toBe('1 giây');
  });

  it('test_minutes_and_seconds', () => {
    expect(formatSecondsLeft(60)).toBe('1 phút');
    expect(formatSecondsLeft(125)).toBe('2 phút 5 giây');
  });

  it('test_zero_and_negative_and_infinite', () => {
    expect(formatSecondsLeft(0)).toBe('0 giây');
    expect(formatSecondsLeft(-5)).toBe('0 giây');
    expect(formatSecondsLeft(Infinity)).toBe('không xác định');
  });
});

describe('keyPoolStatus', () => {
  it('test_all_ready_when_no_cooldowns', () => {
    const rows = keyPoolStatus(POOL, {}, 1000);
    expect(rows.map((r) => r.state)).toEqual(['ready', 'ready', 'ready']);
    expect(rows.map((r) => r.label)).toEqual(['Key chính', 'Key dự phòng 1', 'Key dự phòng 2']);
  });

  it('test_reports_which_key_is_out_of_quota_and_for_how_long', () => {
    const rows = keyPoolStatus(POOL, { KEY_MAIN: 1042, KEY_SPARE_1: 1003 }, 1000);
    expect(rows[0]).toMatchObject({ state: 'quota', secondsLeft: 42, label: 'Key chính' });
    expect(rows[1]).toMatchObject({ state: 'quota', secondsLeft: 3 });
    expect(rows[2].state).toBe('ready');
  });

  it('test_infinite_cooldown_reads_as_rejected_not_as_a_long_wait', () => {
    // requestAi parks a rejected key at +Infinity; calling that "thử lại sau
    // Infinity giây" would be nonsense.
    const rows = keyPoolStatus(POOL, { KEY_SPARE_2: Number.POSITIVE_INFINITY }, 1000);
    expect(rows[2].state).toBe('rejected');
  });

  it('test_expired_cooldown_is_ready_again', () => {
    expect(keyPoolStatus(POOL, { KEY_MAIN: 999 }, 1000)[0].state).toBe('ready');
    expect(keyPoolStatus(POOL, { KEY_MAIN: 1000 }, 1000)[0].state).toBe('ready');
  });

  it('test_slot_index_follows_the_canonical_pool_not_the_rotated_one', () => {
    // The pool handed to requestAi gets rotated by the preferred-slot picker,
    // so labels must come from the canonical order. Same keys, rotated array:
    // KEY_SPARE_1 must STILL be "Key dự phòng 1" here, not "Key chính".
    const rotated = ['KEY_SPARE_1', 'KEY_MAIN', 'KEY_SPARE_2'];
    const canonical = keyPoolStatus(POOL, { KEY_SPARE_1: 1030 }, 1000);
    expect(canonical.find((r) => r.state === 'quota')!.label).toBe('Key dự phòng 1');
    // and the caller must not pass the rotated array by mistake:
    expect(keyPoolStatus(rotated, { KEY_SPARE_1: 1030 }, 1000)[0].label).toBe('Key chính');
  });

  it('test_empty_pool', () => {
    expect(keyPoolStatus([], {}, 1000)).toEqual([]);
  });
});

describe('formatKeyPoolStatus', () => {
  it('test_names_every_slot_and_its_state', () => {
    const text = describeKeyPool(POOL, { KEY_MAIN: 1042, KEY_SPARE_1: 1003 }, 1000);
    expect(text).toContain('Key chính: đã hết quota, thử lại sau 42 giây');
    expect(text).toContain('Key dự phòng 1: đã hết quota, thử lại sau 3 giây');
    expect(text).toContain('Key dự phòng 2: còn dùng được');
  });

  it('test_points_at_the_spare_that_still_works', () => {
    const text = describeKeyPool(POOL, { KEY_MAIN: 1042, KEY_SPARE_1: 1003 }, 1000);
    expect(text).toContain('"Key dự phòng 2" vẫn dùng được');
    expect(text).toContain('Key AI Ưu Tiên');
  });

  it('test_lists_several_usable_spares', () => {
    const text = describeKeyPool(POOL, { KEY_MAIN: 1042 }, 1000);
    expect(text).toContain('"Key dự phòng 1" hoặc "Key dự phòng 2" vẫn dùng được');
    expect(text).toContain('một trong số đó');
  });

  it('test_when_everything_is_exhausted_it_names_the_key_that_returns_first', () => {
    // The common case: a pool only reports 429 after every key refused, so this
    // is the message the player actually sees most of the time. It has to name
    // which key comes back and when, not just say "wait".
    const text = describeKeyPool(POOL, { KEY_MAIN: 1042, KEY_SPARE_1: 1010, KEY_SPARE_2: 1005 }, 1000);
    expect(text).toContain('Không còn key nền tảng nào rảnh');
    expect(text).toContain('Key hồi sớm nhất là "Key dự phòng 2" (sau 5 giây)');
    expect(text).toContain('API Key Gemini của riêng ngươi');
    expect(text).not.toContain('vẫn dùng được');
  });

  it('test_a_rejected_key_is_never_the_one_to_wait_for', () => {
    // Infinity would otherwise win no comparison but must not be offered as
    // "coming back soonest" — a rejected key never comes back at all.
    const text = describeKeyPool(POOL, { KEY_MAIN: 1030, KEY_SPARE_1: Infinity, KEY_SPARE_2: 1090 }, 1000);
    expect(text).toContain('Key hồi sớm nhất là "Key chính" (sau 30 giây)');
    expect(text).not.toContain('"Key dự phòng 1" (sau');
  });

  it('test_all_keys_rejected_leaves_no_one_to_wait_for', () => {
    const text = describeKeyPool(POOL, { KEY_MAIN: Infinity, KEY_SPARE_1: Infinity, KEY_SPARE_2: Infinity }, 1000);
    expect(text).toContain('Không key nào còn dùng được');
    expect(text).not.toContain('Key hồi sớm nhất');
    expect(text).toContain('API Key Gemini của riêng ngươi');
  });

  it('test_a_rejected_key_is_not_offered_as_a_way_out', () => {
    const text = describeKeyPool(POOL, { KEY_MAIN: 1042, KEY_SPARE_1: 1010, KEY_SPARE_2: Infinity }, 1000);
    expect(text).toContain('Key dự phòng 2: bị từ chối');
    expect(text).not.toContain('"Key dự phòng 2" vẫn dùng được');
  });

  it('test_empty_pool_adds_nothing_to_the_message', () => {
    expect(formatKeyPoolStatus([])).toBe('');
    expect(describeKeyPool([], {}, 1000)).toBe('');
  });
});
