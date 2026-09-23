/**
 * STORY-mode combat turn bridge: API-1 classification -> resolver -> system
 * commands + locked-result lines + hand-off + state. Design doc:
 * design/gdd/combat-system.md Core Rules #1/#2/#8/#11; game-concept.md Khế Ước.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMBAT_INTENT_SCHEMA,
  IDLE_STORY_COMBAT_STATE,
  STORY_MODE_COMBAT_RULES,
  buildCombatIntentInstruction,
  buildStoryCombatPromptBlock,
  combatantFromCharacter,
  findOpponent,
  knownThucOf,
  matchThucByName,
  normalizeStoryCombatState,
  parseCombatIntent,
  runStoryCombatTurn,
  type AppCharacterLike,
  type CombatIntent,
} from '../../../src-web/systems/combat/storyCombatTurn';

function seq(...values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

const player: AppCharacterLike = {
  id: 'p1', Name: 'Diệp Thần', isPlayer: true, level: 12, hp: 200, maxhp: 200,
  atk: 50, def: 20, spd: 30, evasion: 5, cr: 10, cdmg: 150, current_location_id: 'loc1',
  equippedSkills: { slot1: { id: 'sk_hoa', Name: 'Hỏa Cầu Thuật', skillType: 'combat' }, slot2: { id: 'sk_adv', Name: 'Khinh Công', skillType: 'adventure' } },
  learnedSkills: [{ id: 'sk_kiem', Name: 'Lạc Anh Kiếm Pháp', skillType: 'combat' }],
};
const bandit: AppCharacterLike = {
  id: 'n1', Name: 'Sơn Tặc', level: 10, hp: 120, maxhp: 120, atk: 40, def: 10, spd: 25, evasion: 0, cr: 0, cdmg: 150,
  current_location_id: 'loc1', skills: [{ id: 'sk_dao', Name: 'Đao Pháp Sơn Lâm', skillType: 'combat' }],
};
const elder: AppCharacterLike = { id: 'n2', Name: 'Trưởng Lão', level: 60, hp: 900, maxhp: 900, atk: 200, def: 80, spd: 70, current_location_id: 'loc1' };
const companion: AppCharacterLike = { id: 'c1', Name: 'Tiểu Vân', isCompanion: true, level: 11, hp: 100, maxhp: 100, current_location_id: 'loc1' };
const characters = [player, bandit, elder, companion];

const attackIntent = (over: Partial<CombatIntent> = {}): CombatIntent => ({
  is_combat: true, action_type: 'skill', skill_name: 'Hỏa Cầu Thuật', target_name: 'Sơn Tặc', lethal: true, ends_combat: false, ...over,
});

describe('classification parsing', () => {
  it('test_story_combat_intent_parses_tolerantly', () => {
    expect(parseCombatIntent(null).is_combat).toBe(false);
    expect(parseCombatIntent({ is_combat: 'true', action_type: 'ATTACK', skill: 'X', target: 'Y', lethal: 'false' })).toEqual({
      is_combat: true, action_type: 'skill', skill_name: 'X', target_name: 'Y', lethal: false, ends_combat: false,
    });
    expect(parseCombatIntent({ action_type: 'weird' }).action_type).toBe('none');
    expect(COMBAT_INTENT_SCHEMA.required).toContain('is_combat');
  });

  it('test_story_combat_instruction_lists_exact_names_and_state', () => {
    const idle = buildCombatIntentInstruction(['Hỏa Cầu Thuật'], ['Sơn Tặc'], false, null);
    expect(idle).toContain('"Hỏa Cầu Thuật"');
    expect(idle).toContain('"Sơn Tặc"');
    expect(idle).toContain('CHƯA có trận nào');
    expect(idle).toContain('KHÔNG PHÁN KẾT QUẢ');
    const active = buildCombatIntentInstruction([], [], true, 'Sơn Tặc');
    expect(active).toContain('ĐANG TRONG TRẬN với "Sơn Tặc"');
    expect(active).toContain('Đánh thường');
  });
});

describe('character mapping', () => {
  it('test_story_combat_combatant_reads_app_fields_and_crippled_status', () => {
    const c = combatantFromCharacter({ ...player, longTermStatuses: [{ status_id: 'PHE_DAN_DIEN' }] });
    expect(c).toMatchObject({ id: 'p1', name: 'Diệp Thần', level: 12, hp: 200, atk: 50, evasion: 5, crippled: true });
    expect(combatantFromCharacter({ id: 'x' }).maxhp).toBe(1);
  });

  it('test_story_combat_known_thuc_keeps_combat_skills_only_and_dedupes', () => {
    const names = knownThucOf(player).map((t) => t.name);
    expect(names).toEqual(['Hỏa Cầu Thuật', 'Lạc Anh Kiếm Pháp']);
    expect(knownThucOf({ id: 'z', skills: [{ id: 'a', Name: 'A' }, { id: 'a', Name: 'A' }] })).toHaveLength(1);
  });

  it('test_story_combat_thuc_match_exact_then_fuzzy_then_null', () => {
    const known = knownThucOf(player);
    expect(matchThucByName('hỏa cầu thuật', known)?.thucId).toBe('sk_hoa');
    expect(matchThucByName('Hỏa Cầu', known)?.thucId).toBe('sk_hoa');
    expect(matchThucByName('Thiên Lôi Chưởng', known)).toBeNull();
    expect(matchThucByName('', known)).toBeNull();
  });

  it('test_story_combat_opponent_must_be_present_alive_and_not_a_companion', () => {
    expect(findOpponent('Sơn Tặc', characters, 'loc1')?.id).toBe('n1');
    expect(findOpponent('son tac', characters, 'loc1')?.id).toBeUndefined();
    expect(findOpponent('Sơn tặc', characters, 'loc1')?.id).toBe('n1');
    expect(findOpponent('Tiểu Vân', characters, 'loc1')).toBeNull();
    expect(findOpponent('Sơn Tặc', [{ ...bandit, current_location_id: 'far' }], 'loc1')).toBeNull();
    expect(findOpponent('Sơn Tặc', [{ ...bandit, isPermanentlyDead: true }], 'loc1')).toBeNull();
  });

  it('test_story_combat_state_normalizes_legacy_shape', () => {
    expect(normalizeStoryCombatState({ isActive: false, combatants: [] })).toEqual(IDLE_STORY_COMBAT_STATE);
    expect(normalizeStoryCombatState({ isActive: true, combatants: ['n1'], exchange_id: 3, combat_type: 'Sparring' })).toMatchObject({ isActive: true, exchange_id: 3, combat_type: 'Sparring' });
  });
});

describe('turn', () => {
  it('test_story_combat_non_combat_action_does_nothing', () => {
    const t = runStoryCombatTurn({ intent: attackIntent({ is_combat: false, action_type: 'none' }), state: IDLE_STORY_COMBAT_STATE, player, characters, rng: seq() });
    expect(t.kind).toBe('none');
    expect(t.commands).toBe('');
  });

  it('test_story_combat_attack_on_present_npc_starts_battle_and_resolves_first_exchange', () => {
    const t = runStoryCombatTurn({ intent: attackIntent(), state: IDLE_STORY_COMBAT_STATE, player, characters, rng: seq(0.1, 0.9, 0.1, 0.9, 0.1, 0.9) });
    expect(t.kind).toBe('started');
    expect(t.opponent?.id).toBe('n1');
    expect(t.state.isActive).toBe(true);
    expect(t.state.exchange_id).toBe(1);
    expect(t.state.combat_type).toBe('Lethal');
    expect(t.state.used_thuc.p1).toEqual(['sk_hoa']);
    expect(t.result?.per_actor.A.thuc_name).toBe('Hỏa Cầu Thuật');
    expect(t.result?.per_actor.B.thuc_name).toBe('Đao Pháp Sơn Lâm');
    expect(t.commands).toContain('[CHARACTER_UPDATE: Name="Sơn Tặc", Stats="hp:-');
    expect(t.lines[0]).toBe('Pha giao đấu 1.');
    expect(t.unusedPlayerThuc).toEqual(['Lạc Anh Kiếm Pháp']);
    expect(t.messages[0]).toContain('Giao chiến với Sơn Tặc bắt đầu');
    expect(t.handoff).toBeNull();
  });

  it('test_story_combat_used_thuc_falls_back_to_basic_attack_with_a_message', () => {
    const state = { ...IDLE_STORY_COMBAT_STATE, isActive: true, combatants: ['n1'], exchange_id: 1, used_thuc: { p1: ['sk_hoa'] } };
    const t = runStoryCombatTurn({ intent: attackIntent(), state, player, characters, rng: seq(0.9, 0.9, 0.9) });
    expect(t.result?.per_actor.A.thuc_id).toBe('basic_attack');
    expect(t.messages.some((m) => m.includes('đã dùng trong trận này'))).toBe(true);
  });

  it('test_story_combat_lethal_kill_emits_system_death_tag_and_victory_handoff', () => {
    // A 5-HP lethal NPC tries to flee (Tier 1); 0.99 fails it, then the player's strike lands.
    const weak = { ...bandit, hp: 5 };
    const t = runStoryCombatTurn({ intent: attackIntent(), state: IDLE_STORY_COMBAT_STATE, player, characters: [player, weak], rng: seq(0.99, 0.1, 0.9) });
    expect(t.result?.flee).toMatchObject({ actor: 'B', success: false });
    expect(t.result?.battle_active).toBe(false);
    expect(t.commands).toContain('[CHARACTER_DEATH: Name="Sơn Tặc"]');
    expect(t.handoff).toMatchObject({ outcome: 'VICTORY', combatType: 'Lethal' });
    expect(t.handoff?.winningSideInfo[0].id).toBe('p1');
    expect(t.state.isActive).toBe(false);
    expect(t.unusedPlayerThuc).toEqual([]);
  });

  it('test_story_combat_sparring_win_never_kills', () => {
    // Sparring: no Tier-1 flee, so rng = npc pick, hit, crit.
    const weak = { ...bandit, hp: 5 };
    const t = runStoryCombatTurn({ intent: attackIntent({ lethal: false }), state: IDLE_STORY_COMBAT_STATE, player, characters: [player, weak], rng: seq(0.1, 0.1, 0.9) });
    expect(t.state.combat_type === 'Sparring' || t.state.isActive === false).toBe(true);
    expect(t.commands).not.toContain('CHARACTER_DEATH');
    expect(t.handoff?.combatType).toBe('Sparring');
  });

  it('test_story_combat_player_defeat_hands_off_to_death_and_consequence_not_a_tag', () => {
    // rng: npc thuc pick, then the NPC's hit roll (p_hit 0.875 after its 1-tier penalty), then crit.
    const dying = { ...player, hp: 3, spd: 1 };
    const t = runStoryCombatTurn({ intent: attackIntent({ action_type: 'defend' }), state: IDLE_STORY_COMBAT_STATE, player: dying, characters: [dying, bandit], rng: seq(0.1, 0.1, 0.9) });
    expect(t.result?.outcome?.type).toBe('lose');
    expect(t.handoff?.outcome).toBe('DEFEAT');
    expect(t.handoff?.losingSideInfo[0].hp).toBe(0); // post-exchange HP for death_roll
    expect(t.commands).not.toContain('CHARACTER_DEATH');
    expect(t.commands).toContain('Name="Diệp Thần", Stats="hp:-3"');
  });

  it('test_story_combat_talk_that_ends_the_fight_closes_without_verdict', () => {
    const state = { ...IDLE_STORY_COMBAT_STATE, isActive: true, combatants: ['n1'], exchange_id: 2 };
    const t = runStoryCombatTurn({ intent: attackIntent({ action_type: 'talk', ends_combat: true }), state, player, characters, rng: seq() });
    expect(t.kind).toBe('ended_by_talk');
    expect(t.state.isActive).toBe(false);
    expect(t.handoff).toBeNull();
    expect(t.lines[0]).toContain('ngừng tay');
  });

  it('test_story_combat_talk_mid_fight_is_a_defend_and_the_npc_still_strikes', () => {
    const state = { ...IDLE_STORY_COMBAT_STATE, isActive: true, combatants: ['n1'], exchange_id: 2 };
    const t = runStoryCombatTurn({ intent: attackIntent({ action_type: 'talk', ends_combat: false }), state, player, characters, rng: seq(0.1, 0.1, 0.9) });
    expect(t.result?.per_actor.A.action_type).toBe('defend');
    expect(t.result?.per_actor.B.hit).toBe(true);
  });

  it('test_story_combat_flee_success_hands_off_fled', () => {
    const state = { ...IDLE_STORY_COMBAT_STATE, isActive: true, combatants: ['n1'], exchange_id: 2 };
    const t = runStoryCombatTurn({ intent: attackIntent({ action_type: 'flee' }), state, player, characters, rng: seq(0.1) });
    expect(t.handoff?.outcome).toBe('FLED');
    expect(t.state.isActive).toBe(false);
  });

  it('test_story_combat_vanished_opponent_closes_the_battle', () => {
    const state = { ...IDLE_STORY_COMBAT_STATE, isActive: true, combatants: ['ghost'], exchange_id: 2 };
    const t = runStoryCombatTurn({ intent: attackIntent(), state, player, characters, rng: seq() });
    expect(t.kind).toBe('ended_by_talk');
    expect(t.state.isActive).toBe(false);
  });

  it('test_story_combat_npc_action_is_systemic_and_flees_when_low', () => {
    const low = { ...bandit, hp: 10 };
    const state = { ...IDLE_STORY_COMBAT_STATE, isActive: true, combatants: ['n1'], exchange_id: 3 };
    const t = runStoryCombatTurn({ intent: attackIntent({ action_type: 'defend' }), state, player, characters: [player, low], rng: seq(0.1) });
    expect(t.result?.per_actor.B.action_type).toBe('flee');
    expect(t.result?.flee?.actor).toBe('B');
  });

  it('test_story_combat_realm_gap_makes_the_elder_hard_to_hurt', () => {
    // Player tier 2 vs elder tier 6: 4 tiers -> mult 0.4 on the player's stats.
    // rng: npc pick, elder hit, elder crit, player hit, player crit.
    const t = runStoryCombatTurn({ intent: attackIntent({ target_name: 'Trưởng Lão' }), state: IDLE_STORY_COMBAT_STATE, player, characters, rng: seq(0.1, 0.9, 0.9, 0.1, 0.9) });
    expect(t.opponent?.id).toBe('n2');
    expect(t.result?.first_id).toBe('n2');
    expect(t.result?.per_actor.A.hit).toBe(true);
    const dmg = t.result?.per_actor.A.damage_dealt ?? 0;
    // ATK 50 x 0.4 = 20 vs DEF 80 -> chip floor 20 x 0.05 = 1
    expect(dmg).toBe(1);
  });
});

describe('prompt blocks', () => {
  it('test_story_combat_prompt_block_carries_facts_pillar4_rules_and_choice_rule', () => {
    const t = runStoryCombatTurn({ intent: attackIntent(), state: IDLE_STORY_COMBAT_STATE, player, characters, rng: seq(0.1, 0.9, 0.1, 0.9) });
    const block = buildStoryCombatPromptBlock(t);
    expect(block).toContain('KẾT QUẢ ĐÃ KHÓA');
    expect(block).toContain('Pha giao đấu 1.');
    expect(block).toContain('Gọi ĐÚNG TÊN từng thức');
    expect(block).toContain('Không viết số HP');
    expect(block).toContain('"Lạc Anh Kiếm Pháp"');
    expect(block).toContain('Không xuất bất kỳ thẻ lệnh nào');
    expect(buildStoryCombatPromptBlock({ ...t, kind: 'none' })).toBe('');
  });

  it('test_story_combat_mode_rules_no_longer_make_the_ai_the_referee', () => {
    expect(STORY_MODE_COMBAT_RULES).toContain('KHÔNG phải do ngươi');
    expect(STORY_MODE_COMBAT_RULES).not.toContain('người quyết định thắng thua duy nhất');
  });
});

describe('App.tsx wiring', () => {
  const APP_SRC = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');

  it('test_story_combat_is_wired_into_api1_schema_and_the_hybrid_turn', () => {
    expect(APP_SRC).toContain('COMBAT_INTENT_SCHEMA');
    expect(APP_SRC).toContain('buildCombatIntentInstruction(');
    const chosen = APP_SRC.indexOf('const chosenScenario = rollDiceAndChooseScenario(scenarios)');
    const run = APP_SRC.indexOf('runStoryCombatTurn(', chosen);
    const prompt = APP_SRC.indexOf('const narrativePrompt = `', chosen);
    expect(chosen).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(chosen);
    expect(prompt).toBeGreaterThan(run);
    expect(APP_SRC.slice(prompt, prompt + 8000)).toContain('${storyCombatPromptBlock}');
  });

  it('test_story_combat_replaces_the_old_referee_rule_block', () => {
    expect(APP_SRC).not.toContain('Ngươi là người quyết định thắng thua duy nhất');
    expect(APP_SRC).toContain('STORY_MODE_COMBAT_RULES');
  });
});
