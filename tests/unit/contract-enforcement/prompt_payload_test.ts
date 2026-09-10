/**
 * Contract Enforcement — payload plumbing for the rule-1.5 guard.
 * Every outgoing Gemini call passes through appendToPromptText, so these are
 * the cases that would otherwise break all AI calls at once.
 */

import { describe, expect, it } from 'vitest';
import { appendToPromptText, promptTextOf } from '../../../src-web/systems/contract/promptPayload';

const payload = (...texts: string[]) => ({
  contents: [{ role: 'user', parts: texts.map((text) => ({ text })) }],
  generationConfig: { response_mime_type: 'application/json' },
});

describe('promptTextOf', () => {
  it('test_joins_every_part', () => {
    expect(promptTextOf(payload('một', 'hai'))).toBe('một\nhai');
  });

  it('test_missing_shapes_yield_empty_string', () => {
    expect(promptTextOf(null)).toBe('');
    expect(promptTextOf(undefined)).toBe('');
    expect(promptTextOf({})).toBe('');
    expect(promptTextOf({ contents: [] })).toBe('');
    expect(promptTextOf({ contents: [{}] })).toBe('');
  });

  it('test_non_string_parts_do_not_throw', () => {
    expect(promptTextOf({ contents: [{ parts: [{ inlineData: {} }, { text: 'ổn' }] }] })).toBe('\nổn');
  });
});

describe('appendToPromptText', () => {
  it('test_appends_to_the_last_part_on_its_own_line', () => {
    const out = appendToPromptText(payload('A', 'B'), 'LUẬT');
    expect(out!.contents![0].parts!.map((p) => p.text)).toEqual(['A', 'B\nLUẬT']);
  });

  it('test_does_not_mutate_the_callers_payload', () => {
    const original = payload('A', 'B');
    const snapshot = JSON.stringify(original);
    appendToPromptText(original, 'LUẬT');
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('test_preserves_role_and_other_payload_keys', () => {
    const out = appendToPromptText(payload('A'), 'LUẬT');
    expect(out!.contents![0].role).toBe('user');
    expect((out as any).generationConfig.response_mime_type).toBe('application/json');
  });

  it('test_keeps_later_content_blocks', () => {
    const multi = {
      contents: [
        { role: 'user', parts: [{ text: 'A' }] },
        { role: 'model', parts: [{ text: 'B' }] },
      ],
    };
    const out = appendToPromptText(multi, 'LUẬT');
    expect(out!.contents).toHaveLength(2);
    expect(out!.contents![1].parts![0].text).toBe('B');
  });

  it('test_keeps_non_text_parts_intact', () => {
    const withImage = { contents: [{ parts: [{ inlineData: { data: 'x' } }, { text: 'A' }] }] };
    const out = appendToPromptText(withImage, 'LUẬT');
    expect(out!.contents![0].parts![0]).toEqual({ inlineData: { data: 'x' } });
    expect(out!.contents![0].parts![1].text).toBe('A\nLUẬT');
  });

  it('test_unexpected_shapes_pass_through_untouched', () => {
    // Degrading to "no rule added" beats throwing in the middle of a request.
    expect(appendToPromptText(null, 'L')).toBeNull();
    expect(appendToPromptText({}, 'L')).toEqual({});
    expect(appendToPromptText({ contents: [{ parts: [] }] }, 'L')).toEqual({ contents: [{ parts: [] }] });
    const lastNotText = { contents: [{ parts: [{ text: 'A' }, { inlineData: {} }] }] };
    expect(appendToPromptText(lastNotText, 'L')).toEqual(lastNotText);
  });

  it('test_appending_twice_adds_two_lines', () => {
    const once = appendToPromptText(payload('A'), 'L1');
    const twice = appendToPromptText(once, 'L2');
    expect(twice!.contents![0].parts![0].text).toBe('A\nL1\nL2');
  });
});
