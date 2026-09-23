/**
 * NPC tone hint - per-NPC praise/affection guidance derived from affinity band
 * and level gap. Design doc: design/gdd/game-concept.md "Pillar 1";
 * gdd-03 1.3 / AC-37b (band name in the prompt, never the raw number).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { npcToneHint, powerGapTiers } from '../../../src-web/systems/contract/npcToneHint';
import { DEFAULT_NARRATION_LINT_KNOBS } from '../../../src-web/systems/contract/narrationLint';

const KNOBS = DEFAULT_NARRATION_LINT_KNOBS; // SUPERIOR_NPC_LEVEL_GAP = 10

describe('powerGapTiers', () => {
  it('test_npc_tone_hint_tiers_are_whole_signed_and_null_when_unknown', () => {
    expect(powerGapTiers(60, 12, 10)).toBe(4);
    expect(powerGapTiers(21, 12, 10)).toBe(0);
    expect(powerGapTiers(22, 12, 10)).toBe(1);
    expect(powerGapTiers(1, 15, 10)).toBe(-1);
    expect(powerGapTiers(11, 12, 10)).toBe(0);
    expect(powerGapTiers(undefined, 12, 10)).toBeNull();
    expect(powerGapTiers(12, 0, 10)).toBeNull();
    expect(powerGapTiers('40', '12', 10)).toBe(2);
  });
});

describe('npcToneHint', () => {
  it('test_npc_tone_hint_superior_npc_gets_reserved_elder_tone', () => {
    const hint = npcToneHint({ level: 60, affinity: 45 }, 12, KNOBS);
    expect(hint).toContain('Thân thiết');
    expect(hint).toContain('cao hơn 4 cảnh giới');
    expect(hint).toContain('bề trên');
    expect(hint).toContain('không đánh giá sai thực lực');
  });

  it('test_npc_tone_hint_weaker_npc_may_admire_but_only_concretely', () => {
    const hint = npcToneHint({ level: 1, affinity: 0 }, 15, KNOBS);
    expect(hint).toContain('Trung lập');
    expect(hint).toContain('thấp hơn 1 cảnh giới');
    expect(hint).toContain('ngưỡng mộ');
    expect(hint).toContain('việc cụ thể');
  });

  it('test_npc_tone_hint_peer_npc_praises_as_an_equal_with_grounds', () => {
    const hint = npcToneHint({ level: 11, affinity: 90 }, 12, KNOBS);
    expect(hint).toContain('Tri kỷ');
    expect(hint).toContain('ngang tầm');
    expect(hint).toContain('yêu không có nghĩa là mù');
  });

  it('test_npc_tone_hint_hostile_npc_never_praises_or_submits', () => {
    expect(npcToneHint({ level: 12, affinity: -50 }, 12, KNOBS)).toContain('Thù địch · ');
    expect(npcToneHint({ level: 12, affinity: -50 }, 12, KNOBS)).toContain('không bỗng nhiên khiếp sợ');
    expect(npcToneHint({ level: 12, affinity: -90 }, 12, KNOBS)).toContain('Thù địch sâu sắc');
  });

  it('test_npc_tone_hint_never_leaks_the_affinity_integer', () => {
    for (const a of [73, -37, 100, 12]) {
      const hint = npcToneHint({ level: 12, affinity: a }, 12, KNOBS);
      expect(hint).not.toContain(String(a));
    }
  });

  it('test_npc_tone_hint_missing_data_degrades_to_neutral_unknown', () => {
    const hint = npcToneHint({}, undefined, KNOBS);
    expect(hint).toContain('Trung lập');
    expect(hint).toContain('chưa rõ thực lực');
    expect(npcToneHint(null, 12, KNOBS)).toContain('chưa rõ thực lực');
  });

  it('test_npc_tone_hint_is_a_single_bracketed_suffix', () => {
    const hint = npcToneHint({ level: 12, affinity: 20 }, 12, KNOBS);
    expect(hint.startsWith(' [Giọng với nhân vật chính: ')).toBe(true);
    expect(hint.endsWith(']')).toBe(true);
    expect(hint).not.toContain('\n');
  });
});

describe('App.tsx wiring', () => {
  const APP_SRC = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');

  it('test_npc_tone_hint_is_appended_to_api2_npc_and_companion_lists', () => {
    const start = APP_SRC.indexOf('const allCompanionsString = knowledgeToUse.characters');
    const end = APP_SRC.indexOf('const narrativePrompt = `', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const window = APP_SRC.slice(start, end);
    expect((window.match(/npcToneHint\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
