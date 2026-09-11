/**
 * View-model of the live-countdown quota modal.
 * The modal recomputes this every second, so these cases are what the player
 * watches change while they wait.
 */

import { describe, expect, it } from 'vitest';
import { quotaModalView } from '../../../src-web/systems/ui/quotaModalView';

const POOL = ['KEY_MAIN', 'KEY_SPARE_1', 'KEY_SPARE_2'];
const NOW = 1000;

describe('quotaModalView', () => {
  it('test_rows_are_in_slot_order_with_display_text', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW + 42 }, NOW);
    expect(v.rows.map((r) => r.label)).toEqual(['Key chính', 'Key dự phòng 1', 'Key dự phòng 2']);
    expect(v.rows[0]).toMatchObject({ text: 'hồi sau 42 giây', tone: 'wait' });
    expect(v.rows[1]).toMatchObject({ text: 'còn dùng được', tone: 'ok' });
  });

  it('test_rejected_key_gets_the_bad_tone', () => {
    const v = quotaModalView(POOL, { KEY_SPARE_2: Infinity }, NOW);
    expect(v.rows[2]).toMatchObject({ text: 'bị từ chối', tone: 'bad' });
  });

  it('test_button_invites_a_retry_only_when_a_key_is_free', () => {
    expect(quotaModalView(POOL, { KEY_MAIN: NOW + 5 }, NOW)).toMatchObject({
      buttonLabel: 'Thử Lại',
      anyReady: true,
    });
    expect(
      quotaModalView(POOL, { KEY_MAIN: NOW + 5, KEY_SPARE_1: NOW + 5, KEY_SPARE_2: NOW + 5 }, NOW),
    ).toMatchObject({ buttonLabel: 'Tuân Mệnh', anyReady: false });
  });

  it('test_advice_names_the_free_keys', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW + 5 }, NOW);
    expect(v.advice).toContain('"Key dự phòng 1" hoặc "Key dự phòng 2" đã sẵn sàng');
  });

  it('test_advice_names_the_soonest_key_when_none_are_free', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW + 95, KEY_SPARE_1: NOW + 12, KEY_SPARE_2: NOW + 5 }, NOW);
    expect(v.advice).toContain('Key hồi sớm nhất là "Key dự phòng 2"');
    expect(v.anyReady).toBe(false);
  });

  it('test_a_rejected_key_is_never_the_soonest', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW + 30, KEY_SPARE_1: Infinity, KEY_SPARE_2: NOW + 90 }, NOW);
    expect(v.advice).toContain('"Key chính"');
    expect(v.advice).not.toContain('"Key dự phòng 1"');
  });

  it('test_all_rejected_tells_the_player_to_bring_their_own_key', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: Infinity, KEY_SPARE_1: Infinity, KEY_SPARE_2: Infinity }, NOW);
    expect(v.advice).toContain('API Key Gemini của riêng ngươi');
    expect(v.advice).not.toContain('hồi sớm nhất');
  });

  it('test_the_countdown_ticks_down_between_renders', () => {
    // What the player actually sees: the same key, one second later.
    const cooldowns = { KEY_MAIN: NOW + 3, KEY_SPARE_1: NOW + 3, KEY_SPARE_2: NOW + 3 };
    expect(quotaModalView(POOL, cooldowns, NOW).rows[0].text).toBe('hồi sau 3 giây');
    expect(quotaModalView(POOL, cooldowns, NOW + 1).rows[0].text).toBe('hồi sau 2 giây');
    expect(quotaModalView(POOL, cooldowns, NOW + 2).rows[0].text).toBe('hồi sau 1 giây');
    // ...and the moment it expires the whole modal flips to the retry state.
    const after = quotaModalView(POOL, cooldowns, NOW + 3);
    expect(after.rows[0].text).toBe('còn dùng được');
    expect(after.anyReady).toBe(true);
    expect(after.buttonLabel).toBe('Thử Lại');
  });

  it('test_empty_pool_does_not_crash', () => {
    const v = quotaModalView([], {}, NOW);
    expect(v.rows).toEqual([]);
    expect(v.anyReady).toBe(false);
  });

  it('test_platform_source_is_the_default_headline', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW + 5 }, NOW);
    expect(v.headline).toBe('Nguồn AI mặc định vừa báo hết quota (Lỗi 429).');
  });
});

// 2026-09-11: the personal-key path now feeds the same modal. The pool it
// reports on is the one requestAi actually walked: [own key, ...platform keys].
describe('quotaModalView - userKey source', () => {
  const USER_POOL = ['KEY_OWN', 'KEY_MAIN', 'KEY_SPARE_1'];

  it('test_userkey_source_labels_row_zero_as_the_players_key', () => {
    const v = quotaModalView(USER_POOL, { KEY_OWN: NOW + 26 }, NOW, 'userKey');
    expect(v.headline).toBe('API Key Gemini của riêng ngươi vừa báo hết quota (Lỗi 429).');
    expect(v.rows.map((r) => r.label)).toEqual([
      'Key riêng của ngươi',
      'Key nền tảng (key chính)',
      'Key nền tảng (key dự phòng 1)',
    ]);
    expect(v.rows[0]).toMatchObject({ text: 'hồi sau 26 giây', tone: 'wait' });
  });

  it('test_userkey_source_advice_never_points_at_the_disabled_dropdown', () => {
    const ready = quotaModalView(USER_POOL, { KEY_OWN: NOW + 26 }, NOW, 'userKey');
    expect(ready.anyReady).toBe(true);
    expect(ready.buttonLabel).toBe('Thử Lại');
    expect(ready.advice).toContain('"Key nền tảng (key chính)"');
    expect(ready.advice).not.toContain('Key AI Ưu Tiên');

    const allOut = quotaModalView(
      USER_POOL,
      { KEY_OWN: Infinity, KEY_MAIN: Infinity, KEY_SPARE_1: Infinity },
      NOW,
      'userKey',
    );
    expect(allOut.anyReady).toBe(false);
    expect(allOut.advice).toContain('kiểm tra lại API Key riêng');
    expect(allOut.advice).not.toContain('Key AI Ưu Tiên');
  });

  it('test_day_scoped_key_is_never_ready_and_the_hint_explains_the_reset', () => {
    // Breaker expired (ready) but the DAY bucket is gone: the row must not
    // invite a retry, and the hint must answer "đếm ngược sai à?".
    const v = quotaModalView(
      POOL,
      { KEY_MAIN: NOW - 1, KEY_SPARE_1: NOW + 8, KEY_SPARE_2: Infinity },
      NOW,
      'platform',
      {
        scopeByKey: { KEY_MAIN: 'day', KEY_SPARE_1: 'minute' },
        quotaInfo: { scope: 'day', metric: 'generate_content_free_tier_requests', limit: 20, model: 'gemini-3.6-pro', retryAfterSec: 41 },
      },
    );
    expect(v.rows[0]).toMatchObject({ text: 'hết hạn mức ngày', tone: 'bad' });
    expect(v.rows[1]).toMatchObject({ text: 'hồi sau 8 giây', tone: 'wait' });
    expect(v.anyReady).toBe(false);
    expect(v.advice).toContain('"Key dự phòng 1"');
    expect(v.hint).toContain('hạn mức theo NGÀY');
    expect(v.hint).toContain('20 lượt gọi/ngày cho model gemini-3.6-pro');
    expect(v.hint).toContain('00:00 giờ Thái Bình Dương');
  });

  it('test_all_keys_day_exhausted_says_waiting_does_not_help', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW - 1, KEY_SPARE_1: NOW - 1, KEY_SPARE_2: NOW + 3 }, NOW, 'platform', {
      scopeByKey: { KEY_MAIN: 'day', KEY_SPARE_1: 'day', KEY_SPARE_2: 'day' },
    });
    expect(v.anyReady).toBe(false);
    expect(v.buttonLabel).toBe('Tuân Mệnh');
    expect(v.advice).toContain('đợi không giúp');
  });

  it('test_minute_scope_hint_says_the_turn_itself_may_exceed_the_bucket', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW + 26 }, NOW, 'platform', {
      scopeByKey: { KEY_MAIN: 'minute' },
      quotaInfo: { scope: 'minute', metric: 'generate_content_free_tier_input_token_count', limit: 250000, model: 'gemini-3.6-flash', retryAfterSec: 26.4 },
    });
    expect(v.hint).toContain('hạn mức theo PHÚT');
    expect(v.hint).toContain('250.000 token/phút cho model gemini-3.6-flash');
    expect(v.hint).toContain('không phải đồng hồ sai');
    // Minute-scoped keys still count down and still become ready.
    expect(v.rows[0]).toMatchObject({ text: 'hồi sau 26 giây', tone: 'wait' });
    expect(v.anyReady).toBe(true);
  });

  it('test_no_quota_info_gives_no_hint_and_keeps_the_old_behaviour', () => {
    const v = quotaModalView(POOL, { KEY_MAIN: NOW + 5 }, NOW);
    expect(v.hint).toBe('');
    expect(v.anyReady).toBe(true);
  });

  it('test_userkey_source_with_only_the_own_key_still_counts_down', () => {
    const v = quotaModalView(['KEY_OWN'], { KEY_OWN: NOW + 3 }, NOW, 'userKey');
    expect(v.rows).toHaveLength(1);
    expect(v.advice).toContain('Key hồi sớm nhất là "Key riêng của ngươi"');
    expect(quotaModalView(['KEY_OWN'], { KEY_OWN: NOW + 3 }, NOW + 3, 'userKey').anyReady).toBe(true);
  });
});
