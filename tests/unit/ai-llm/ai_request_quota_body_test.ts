/**
 * AI/LLM layer - reading Google's 429 body (2026-09-11).
 *
 * Player report: "vừa hết đếm ngược tôi thử lại thì lại báo hết quota". The
 * countdown was a flat 60s knob because a browser cannot read the
 * `retry-after` header of a Gemini response; Google's real "retry in Ns" and
 * the bucket that tripped (per minute vs per day) live in the body.
 */

import { describe, expect, it } from 'vitest';
import {
  estimateTokensFromChars,
  parseQuotaErrorBody,
  promptTokensInWindow,
  requestAi,
  usageOf,
} from '../../../src-web/systems/ai/requestAi';
import { AI_KNOBS } from '../../../src-web/systems/registry';
import { lockedFixture, makeHarness, okBody } from './fixtures';
import type { FetchInit } from '../../../src-web/systems/ai/requestAi';

const LADDER = { model_ladder: ['A', 'B', 'C'] };
const narration = { call_type: 'narration_call' as const, payload: { locked_result: lockedFixture() } };
const MAIN = 'key-main';
const SPARE_1 = 'key-spare-1';
const POOL = { apiMode: 'default' as const, defaultKey: MAIN, fallbackKeys: [SPARE_1] };
const keyOf = (init: FetchInit): string => init.headers['x-goog-api-key'];

/** Verbatim shape of a free-tier per-minute token 429 (from the player's screenshot). */
const TPM_BODY = {
  error: {
    code: 429,
    message:
      'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 250000, model: gemini-3.6-flash\nPlease retry in 26.379005419s.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count',
            quotaId: 'GenerateContentInputTokensPerModelPerMinute-FreeTier',
            quotaDimensions: { model: 'gemini-3.6-flash', location: 'global' },
            quotaValue: '250000',
          },
        ],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '26.379005419s' },
    ],
  },
};

const RPD_BODY = {
  error: {
    code: 429,
    message:
      'You exceeded your current quota.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-pro\nPlease retry in 41s.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
            quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
            quotaDimensions: { model: 'gemini-3.6-pro' },
            quotaValue: '20',
          },
        ],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '41s' },
    ],
  },
};

describe('parseQuotaErrorBody', () => {
  it('test_parse_reads_retry_delay_metric_limit_model_and_minute_scope_from_details', () => {
    const info = parseQuotaErrorBody(JSON.stringify(TPM_BODY));
    expect(info).toEqual({
      retryAfterSec: 26.379005419,
      scope: 'minute',
      metric: 'generate_content_free_tier_input_token_count',
      limit: 250000,
      model: 'gemini-3.6-flash',
    });
  });

  it('test_parse_recognises_a_per_day_bucket_from_the_quota_id', () => {
    const info = parseQuotaErrorBody(RPD_BODY);
    expect(info.scope).toBe('day');
    expect(info.retryAfterSec).toBe(41);
    expect(info.limit).toBe(20);
  });

  it('test_parse_falls_back_to_the_message_text_when_details_are_missing', () => {
    // What `readErrorBody`'s JSON seam hands over in the browser: the message only.
    const info = parseQuotaErrorBody(TPM_BODY.error.message);
    expect(info.retryAfterSec).toBeCloseTo(26.379, 3);
    expect(info.metric).toBe('generate_content_free_tier_input_token_count');
    expect(info.limit).toBe(250000);
    expect(info.model).toBe('gemini-3.6-flash');
    // A token bucket only exists per minute on the free tier.
    expect(info.scope).toBe('minute');
  });

  it('test_parse_of_a_bare_message_without_quota_id_cannot_tell_minute_from_day', () => {
    const info = parseQuotaErrorBody('Quota exceeded for metric: generate_content_free_tier_requests, limit: 20. Please retry in 5s.');
    expect(info.scope).toBe('unknown');
    expect(info.retryAfterSec).toBe(5);
  });

  it('test_parse_tolerates_garbage_input', () => {
    expect(parseQuotaErrorBody(undefined)).toEqual({ scope: 'unknown' });
    expect(parseQuotaErrorBody('')).toEqual({ scope: 'unknown' });
    expect(parseQuotaErrorBody('Resource has been exhausted (e.g. check quota).')).toEqual({ scope: 'unknown' });
    expect(parseQuotaErrorBody(42)).toEqual({ scope: 'unknown' });
  });
});

describe('requestAi - token telemetry from usageMetadata', () => {
  const withUsage = (text: string, prompt: number) => ({
    ...(okBody(text) as Record<string, unknown>),
    usageMetadata: { promptTokenCount: prompt, candidatesTokenCount: 900, totalTokenCount: prompt + 900 },
  });

  it('test_200_with_usage_metadata_is_logged_per_key_and_exposed_on_the_result', async () => {
    const h = makeHarness([{ status: 200, body: withUsage('ok', 187000) }], LADDER, { credentials: POOL });
    const nowSec = h.clock.now() / 1000;

    const r = await requestAi(narration, h.deps);

    expect(r).toMatchObject({ ok: true, usage: { prompt_tokens: 187000, output_tokens: 900, total_tokens: 187900 } });
    expect(h.deps.session.usage_log).toEqual([{ at_sec: nowSec, key: MAIN, model: 'A', prompt_tokens: 187000 }]);
    expect(promptTokensInWindow(h.deps.session, MAIN, nowSec)).toBe(187000);
    expect(promptTokensInWindow(h.deps.session, SPARE_1, nowSec)).toBe(0);
    // Outside the trailing minute the entry no longer counts.
    expect(promptTokensInWindow(h.deps.session, MAIN, nowSec + 61)).toBe(0);
  });

  it('test_two_calls_inside_a_minute_add_up_which_is_how_a_turn_overflows_the_bucket', async () => {
    const h = makeHarness([{ status: 200, body: withUsage('ok', 150000) }], LADDER, { credentials: POOL });
    await requestAi(narration, h.deps);
    h.clock.advance(20_000);
    await requestAi(narration, h.deps);
    expect(promptTokensInWindow(h.deps.session, MAIN, h.clock.now() / 1000)).toBe(300000);
  });

  it('test_last_request_chars_is_recorded_even_when_the_attempt_is_rejected', async () => {
    const h = makeHarness([{ status: 429, errorBody: JSON.stringify(TPM_BODY) }], LADDER, { credentials: POOL });
    await requestAi(narration, h.deps);
    const sent = h.calls[0].init.body.length;
    expect(h.deps.session.last_request_chars).toBe(sent);
    expect(sent).toBeGreaterThan(0);
  });

  it('test_200_without_usage_metadata_adds_nothing', async () => {
    const h = makeHarness([{ status: 200, body: okBody('ok') }], LADDER, { credentials: POOL });
    const r = await requestAi(narration, h.deps);
    expect((r as { usage?: unknown }).usage).toBeUndefined();
    expect(h.deps.session.usage_log).toEqual([]);
  });

  it('test_usageOf_and_estimateTokensFromChars_tolerate_missing_data', () => {
    expect(usageOf(null)).toBeNull();
    expect(usageOf({ usageMetadata: {} })).toBeNull();
    expect(usageOf({ usageMetadata: { promptTokenCount: 12 } })).toEqual({ prompt_tokens: 12, output_tokens: null, total_tokens: null });
    expect(estimateTokensFromChars(null)).toBeNull();
    expect(estimateTokensFromChars(300)).toBe(100);
  });
});

describe('requestAi - a 429 body drives the key breaker and the result', () => {
  it('test_429_without_header_uses_googles_retry_delay_from_the_body_not_the_knob', async () => {
    const h = makeHarness(
      (_url, init) =>
        keyOf(init) === MAIN
          ? { status: 429, errorBody: JSON.stringify(TPM_BODY) }
          : { status: 200, body: okBody('ok') },
      LADDER,
      { credentials: POOL },
    );
    const nowSec = h.clock.now() / 1000;

    await requestAi(narration, h.deps);

    expect(h.deps.session.key_cooldown_until[MAIN]).toBeCloseTo(nowSec + 26.379005419, 6);
    expect(h.deps.session.key_cooldown_until[MAIN]).not.toBe(nowSec + AI_KNOBS.key_quota_cooldown_seconds);
    expect(h.deps.session.key_quota_scope[MAIN]).toBe('minute');
  });

  it('test_429_body_read_through_the_json_seam_still_yields_the_retry_delay', async () => {
    // App.tsx's fetch adapter exposes json() but not text(): the message alone
    // must be enough for the delay (the header is unreadable in a browser).
    const h = makeHarness(
      (_url, init) => (keyOf(init) === MAIN ? { status: 429, body: TPM_BODY } : { status: 200, body: okBody('ok') }),
      LADDER,
      { credentials: POOL },
    );
    const nowSec = h.clock.now() / 1000;

    await requestAi(narration, h.deps);

    expect(h.deps.session.key_cooldown_until[MAIN]).toBeCloseTo(nowSec + 26.379005419, 6);
    expect(h.deps.session.key_quota_scope[MAIN]).toBe('minute');
  });

  it('test_header_retry_after_still_wins_over_the_body_when_present', async () => {
    const h = makeHarness(
      (_url, init) =>
        keyOf(init) === MAIN
          ? { status: 429, errorBody: JSON.stringify(TPM_BODY), headers: { 'retry-after': '17' } }
          : { status: 200, body: okBody('ok') },
      LADDER,
      { credentials: POOL },
    );
    const nowSec = h.clock.now() / 1000;
    await requestAi(narration, h.deps);
    expect(h.deps.session.key_cooldown_until[MAIN]).toBe(nowSec + 17);
  });

  it('test_pool_exhaustion_carries_the_last_bodys_quota_info_on_the_result', async () => {
    const h = makeHarness(
      (_url, init) =>
        keyOf(init) === MAIN
          ? { status: 429, errorBody: JSON.stringify(TPM_BODY) }
          : { status: 429, errorBody: JSON.stringify(RPD_BODY) },
      LADDER,
      { credentials: POOL },
    );

    const r = await requestAi(narration, h.deps);

    expect(r).toMatchObject({ ok: false, label: 'quota_429', retry_after: 41 });
    expect((r as { quota?: { scope: string } }).quota?.scope).toBe('day');
    expect(h.deps.session.key_quota_scope).toEqual({ [MAIN]: 'minute', [SPARE_1]: 'day' });
  });

  it('test_a_429_body_without_any_retry_hint_still_falls_back_to_the_knob', async () => {
    const h = makeHarness(
      (_url, init) =>
        keyOf(init) === MAIN
          ? { status: 429, errorBody: JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }) }
          : { status: 200, body: okBody('ok') },
      LADDER,
      { credentials: POOL },
    );
    const nowSec = h.clock.now() / 1000;
    await requestAi(narration, h.deps);
    expect(h.deps.session.key_cooldown_until[MAIN]).toBe(nowSec + AI_KNOBS.key_quota_cooldown_seconds);
    expect(h.deps.session.key_quota_scope[MAIN]).toBe('unknown');
  });
});
