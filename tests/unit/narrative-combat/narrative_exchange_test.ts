/**
 * Narrative combat exchange resolver - Combat GDD Section D ported for STORY
 * mode. Design doc: design/gdd/combat-system.md (D.1-D.14, Core Rules #2,
 * #2b, #3, #7, #9). RNG is a scripted sequence, so every test is deterministic.
 */

import { describe, expect, it } from 'vitest';
import {
  BASIC_ATTACK,
  DEFAULT_NARRATIVE_COMBAT_KNOBS,
  NarrativeCombatConfigError,
  assertNarrativeCombatKnobs,
  chooseNpcAction,
  describeExchange,
  effectiveStats,
  fleeProbability,
  hitProbability,
  layerMult,
  narrativeCombatKnobsFromGameConfig,
  resolveAttack,
  resolveExchange,
  sparParityEligible,
  statScore,
  totalPenaltyMultiplier,
  type CombatantStats,
  type ExchangeInput,
} from '../../../src-web/systems/combat/narrativeExchange';
import { GAME_CONFIG } from '../../../gameConfig.js';

const K = DEFAULT_NARRATIVE_COMBAT_KNOBS;

/** Scripted rng: returns the given values in order, then 0.5 forever. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

function fighter(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    id: 'p', name: 'Người chơi', level: 12, hp: 200, maxhp: 200,
    atk: 50, def: 20, spd: 30, evasion: 5, cr: 10, cdmg: 150, dmgAmp: 0, dmgRes: 0,
    ...overrides,
  };
}

function exchange(overrides: Partial<ExchangeInput> = {}): ExchangeInput {
  return {
    exchange_id: 1,
    A: fighter(),
    B: fighter({ id: 'n', name: 'Sơn tặc', spd: 25 }),
    actions: { A: { type: 'skill', thuc: { thucId: 'hoa_cau', name: 'Hỏa Cầu Thuật' } }, B: { type: 'skill', thuc: BASIC_ATTACK } },
    player: 'A',
    is_spar_friendly: false,
    spar_parity_eligible: false,
    rng: seq(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// D.1
// ---------------------------------------------------------------------------

describe('D.1 effective stats', () => {
  it('test_narrative_exchange_gdd_example_realm_and_gear_gap', () => {
    // GDD example: C tier 3 vs tier 6 -> gap_realm 3; weapon tier 5, skill tier 4 -> gap_gear 2.
    const c = fighter({ level: 25, weaponTier: 5, atk: 50 });
    const opp = fighter({ level: 55 });
    const m = totalPenaltyMultiplier(c, opp, { thucId: 'x', name: 'x', tier: 4 }, K);
    expect(m).toBeCloseTo(0.385, 6);
    expect(effectiveStats(c, opp, { thucId: 'x', name: 'x', tier: 4 }, K).atk).toBeCloseTo(19.25, 6);
  });

  it('test_narrative_exchange_floor_total_wins_over_layer_product', () => {
    const c = fighter({ level: 1, weaponTier: 11 });
    const opp = fighter({ level: 105 });
    expect(layerMult(10, K)).toBe(0.1);
    expect(totalPenaltyMultiplier(c, opp, { thucId: 'x', name: 'x', tier: 11 }, K)).toBe(0.05);
    expect(effectiveStats(c, opp, null, K).atk).toBeCloseTo(2.5, 6);
  });

  it('test_narrative_exchange_no_gap_means_no_penalty_and_crippled_is_a_third_layer', () => {
    expect(totalPenaltyMultiplier(fighter(), fighter(), null, K)).toBe(1);
    expect(totalPenaltyMultiplier(fighter({ crippled: true }), fighter(), null, K)).toBe(0.85);
  });

  it('test_narrative_exchange_missing_tiers_do_not_penalise', () => {
    const e = effectiveStats(fighter({ level: 40 }), fighter({ level: 12 }), { thucId: 'x', name: 'x' }, K);
    expect(e.mult).toBe(1);
    expect(e.acc).toBe(K.BASE_ACC);
    expect(e.critDamage).toBeCloseTo(1.5, 6);
  });
});

// ---------------------------------------------------------------------------
// D.3 / D.11 / D.4-D.6
// ---------------------------------------------------------------------------

describe('D.3 hit and D.11 flee', () => {
  it('test_narrative_exchange_hit_probability_is_clamped_and_difference_based', () => {
    const a = effectiveStats(fighter({ acc: 45.2 }), fighter(), null, K);
    const d = effectiveStats(fighter({ evasion: 38 }), fighter(), null, K);
    expect(hitProbability(a, d, K)).toBeCloseTo(0.572, 6);
    const zero = effectiveStats(fighter({ acc: 0, evasion: 0 }), fighter(), null, K);
    expect(hitProbability(zero, zero, K)).toBe(0.5);
    const strong = effectiveStats(fighter({ acc: 500 }), fighter(), null, K);
    expect(hitProbability(strong, d, K)).toBe(K.P_MAX);
  });

  it('test_narrative_exchange_flee_probability_gdd_example', () => {
    const f = effectiveStats(fighter({ spd: 32.5 }), fighter(), null, K);
    const o = effectiveStats(fighter({ spd: 40 }), fighter(), null, K);
    expect(fleeProbability(f, o, K)).toBeCloseTo(0.425, 6);
  });
});

describe('D.4-D.6 damage', () => {
  it('test_narrative_exchange_gdd_damage_example', () => {
    // raw 30, crit x1.6, amp 0.1, mitigation 0.15 -> 45
    const attacker = effectiveStats(fighter({ atk: 30, cr: 100, cdmg: 160, dmgAmp: 10, acc: 500 }), fighter(), null, K);
    const defender = effectiveStats(fighter({ def: 0, dmgRes: 15, evasion: 0 }), fighter(), null, K);
    const r = resolveAttack(attacker, 30, defender, 200, false, seq(0.1, 0.1), K);
    expect(r.hit).toBe(true);
    expect(r.crit).toBe(true);
    expect(r.damage).toBe(45);
    expect(r.hp_defender_after).toBe(155);
  });

  it('test_narrative_exchange_chip_floor_and_minimum_one_damage', () => {
    // effective ATK 2.5 vs DEF 22, mitigation 0.5 -> raw 0.125 -> final 1
    const attacker = effectiveStats(fighter({ atk: 2.5, cr: 0, acc: 500 }), fighter(), null, K);
    const defender = effectiveStats(fighter({ def: 22, dmgRes: 50, evasion: 0 }), fighter(), null, K);
    const r = resolveAttack(attacker, 2.5, defender, 100, false, seq(0.1, 0.9), K);
    expect(r.damage).toBe(1);
  });

  it('test_narrative_exchange_miss_deals_nothing_and_skips_crit_roll', () => {
    const attacker = effectiveStats(fighter({ acc: 0 }), fighter(), null, K);
    const defender = effectiveStats(fighter({ evasion: 0 }), fighter(), null, K);
    const r = resolveAttack(attacker, 50, defender, 100, false, seq(0.99), K);
    expect(r).toMatchObject({ hit: false, crit: null, damage: 0, hp_defender_after: 100 });
  });

  it('test_narrative_exchange_defend_reduces_damage_deterministically', () => {
    const attacker = effectiveStats(fighter({ atk: 45, cr: 0, acc: 500 }), fighter(), null, K);
    const defender = effectiveStats(fighter({ def: 0, evasion: 0 }), fighter(), null, K);
    const open = resolveAttack(attacker, 45, defender, 200, false, seq(0.1, 0.9), K);
    const guarded = resolveAttack(attacker, 45, defender, 200, true, seq(0.1, 0.9), K);
    expect(open.damage).toBe(45);
    expect(guarded.damage).toBe(29);
  });
});

// ---------------------------------------------------------------------------
// D.9 exchange
// ---------------------------------------------------------------------------

describe('D.9 exchange', () => {
  it('test_narrative_exchange_faster_side_strikes_first_and_both_strike_when_nobody_falls', () => {
    const r = resolveExchange(exchange({ rng: seq(0.1, 0.9, 0.1, 0.9) }));
    expect(r.first_id).toBe('p');
    expect(r.second_id).toBe('n');
    expect(r.per_actor.A.hit).toBe(true);
    expect(r.per_actor.B.hit).toBe(true);
    expect(r.per_actor.B.executed).toBe(true);
    expect(r.battle_active).toBe(true);
    expect(r.outcome).toBeNull();
    expect(r.per_actor.B.hp_after).toBe(200 - r.per_actor.A.damage_dealt);
    expect(r.per_actor.A.hp_after).toBe(200 - r.per_actor.B.damage_dealt);
  });

  it('test_narrative_exchange_early_termination_when_first_strike_kills', () => {
    const r = resolveExchange(exchange({ B: fighter({ id: 'n', name: 'Sơn tặc', spd: 25, hp: 10, maxhp: 200 }), rng: seq(0.1, 0.9) }));
    expect(r.per_actor.B.hp_after).toBe(0);
    expect(r.per_actor.B.executed).toBe(false);
    expect(r.per_actor.B.hit).toBeNull();
    expect(r.battle_active).toBe(false);
    expect(r.outcome).toEqual({ type: 'win', winner_id: 'p', loser_id: 'n' });
  });

  it('test_narrative_exchange_player_losing_reports_lose_from_player_view', () => {
    const r = resolveExchange(exchange({
      A: fighter({ hp: 5, spd: 10 }),
      B: fighter({ id: 'n', name: 'Sơn tặc', spd: 25 }),
      rng: seq(0.1, 0.9),
    }));
    expect(r.first_id).toBe('n');
    expect(r.outcome).toEqual({ type: 'lose', winner_id: 'n', loser_id: 'p' });
  });

  it('test_narrative_exchange_hp_after_is_not_swapped_between_actors', () => {
    const r = resolveExchange(exchange({ A: fighter({ hp: 150 }), B: fighter({ id: 'n', name: 'N', spd: 25, hp: 90 }), rng: seq(0.1, 0.9, 0.1, 0.9) }));
    expect(r.per_actor.A.hp_after).toBeLessThanOrEqual(150);
    expect(r.per_actor.B.hp_after).toBeLessThanOrEqual(90);
    expect(r.per_actor.A.hp_after).toBeGreaterThan(90);
  });

  it('test_narrative_exchange_successful_flee_ends_battle_with_no_outcome', () => {
    const r = resolveExchange(exchange({ actions: { A: { type: 'flee' }, B: { type: 'skill', thuc: BASIC_ATTACK } }, rng: seq(0.1) }));
    expect(r.flee).toMatchObject({ actor: 'A', success: true });
    expect(r.battle_active).toBe(false);
    expect(r.outcome).toEqual({ type: 'no_outcome', winner_id: null, loser_id: null });
    expect(r.per_actor.B.executed).toBe(false);
    expect(r.per_actor.A.hp_after).toBe(200);
  });

  it('test_narrative_exchange_failed_flee_hands_the_strike_to_the_opponent_only', () => {
    // p_flee = clamp(0.5 + 0.01*(30-25)) = 0.55; roll 0.9 fails.
    const r = resolveExchange(exchange({ actions: { A: { type: 'flee' }, B: { type: 'skill', thuc: BASIC_ATTACK } }, rng: seq(0.9, 0.1, 0.9) }));
    expect(r.flee).toMatchObject({ actor: 'A', success: false });
    expect(r.first_id).toBe('n');
    expect(r.per_actor.B.hit).toBe(true);
    expect(r.per_actor.A.hit).toBeNull();
    expect(r.per_actor.A.damage_dealt).toBe(0);
    expect(r.battle_active).toBe(true);
  });

  it('test_narrative_exchange_defend_takes_no_strike_and_less_damage', () => {
    const open = resolveExchange(exchange({ rng: seq(0.1, 0.9, 0.99) }));
    const guarded = resolveExchange(exchange({ actions: { A: { type: 'skill', thuc: BASIC_ATTACK }, B: { type: 'defend' } }, rng: seq(0.1, 0.9) }));
    expect(guarded.per_actor.B.action_type).toBe('defend');
    expect(guarded.per_actor.B.hit).toBeNull();
    expect(guarded.per_actor.A.damage_dealt).toBeLessThan(open.per_actor.A.damage_dealt);
  });

  it('test_narrative_exchange_exhaustion_drains_both_sides_after_onset', () => {
    const r = resolveExchange(exchange({ exchange_id: 120, rng: seq(0.99, 0.99) }));
    // (120-40)/(200-40) = 0.5 -> round(200*0.05*0.5) = 5 each
    expect(r.drain).toEqual({ A: 5, B: 5 });
    expect(r.per_actor.A.hp_after).toBe(195);
    expect(r.per_actor.B.hp_after).toBe(195);
    const early = resolveExchange(exchange({ exchange_id: 10, rng: seq(0.99, 0.99) }));
    expect(early.drain).toEqual({ A: 0, B: 0 });
  });

  it('test_narrative_exchange_technical_cap_forces_a_verdict_by_hp_pct', () => {
    const r = resolveExchange(exchange({ exchange_id: 200, A: fighter({ hp: 180 }), B: fighter({ id: 'n', name: 'N', spd: 25, hp: 120 }), rng: seq(0.99, 0.99) }));
    expect(r.battle_active).toBe(false);
    expect(r.outcome?.type).toBe('win');
    expect(r.outcome?.winner_id).toBe('p');
  });

  it('test_narrative_exchange_spar_parity_turns_a_narrow_win_into_no_outcome', () => {
    const A = fighter({ hp: 20 });
    const B = fighter({ id: 'n', name: 'N', spd: 25, hp: 10 });
    expect(sparParityEligible(A, B, true, K)).toBe(true);
    expect(sparParityEligible(A, B, false, K)).toBe(false);
    const r = resolveExchange(exchange({ A, B, is_spar_friendly: true, spar_parity_eligible: true, rng: seq(0.1, 0.9) }));
    expect(r.per_actor.B.hp_after).toBe(0);
    expect(r.outcome).toEqual({ type: 'no_outcome', winner_id: null, loser_id: null });
    const lethal = resolveExchange(exchange({ A, B, rng: seq(0.1, 0.9) }));
    expect(lethal.outcome?.type).toBe('win');
  });

  it('test_narrative_exchange_speed_tie_uses_the_injected_coin_flip', () => {
    const a = resolveExchange(exchange({ B: fighter({ id: 'n', name: 'N', spd: 30 }), rng: seq(0.2, 0.99, 0.99) }));
    const b = resolveExchange(exchange({ B: fighter({ id: 'n', name: 'N', spd: 30 }), rng: seq(0.8, 0.99, 0.99) }));
    expect(a.first_id).toBe('p');
    expect(b.first_id).toBe('n');
  });

  it('test_narrative_exchange_power_override_feeds_the_attack_and_keeps_the_penalty', () => {
    const r = resolveExchange(exchange({
      A: fighter({ level: 1 }),
      B: fighter({ id: 'n', name: 'N', level: 11, spd: 25, def: 0, evasion: 0 }),
      powerOf: () => 100,
      rng: seq(0.1, 0.9, 0.99),
    }));
    // A is one tier below B -> mult 0.85 -> power 85 -> raw 85 -> final 85
    expect(r.per_actor.A.damage_dealt).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// D.14 NPC action
// ---------------------------------------------------------------------------

describe('D.14 NPC action', () => {
  const known = [
    { thucId: 'c_thuc', name: 'Cửu Thức', tier: 3 },
    { thucId: 'a_thuc', name: 'Ám Thức', tier: 1 },
    { thucId: 'b_thuc', name: 'Bạch Thức', tier: 1 },
  ];

  it('test_narrative_exchange_npc_flees_below_threshold_only_when_lethal', () => {
    const npc = fighter({ id: 'n', hp: 30, maxhp: 200 });
    expect(chooseNpcAction({ npc, known, usedThucIds: [], is_spar_friendly: false, rng: seq() }).type).toBe('flee');
    expect(chooseNpcAction({ npc, known, usedThucIds: [], is_spar_friendly: true, rng: seq() }).type).toBe('skill');
  });

  it('test_narrative_exchange_npc_prefers_unpenalised_thuc_sorted_by_id', () => {
    const npc = fighter({ id: 'n', level: 12 }); // tier 2 -> tier-3 thuc is penalised
    const first = chooseNpcAction({ npc, known, usedThucIds: [], is_spar_friendly: false, rng: seq(0.0) });
    const last = chooseNpcAction({ npc, known, usedThucIds: [], is_spar_friendly: false, rng: seq(0.99) });
    expect(first.thuc?.thucId).toBe('a_thuc');
    expect(last.thuc?.thucId).toBe('b_thuc');
  });

  it('test_narrative_exchange_npc_never_repeats_and_falls_back_to_basic_attack', () => {
    const npc = fighter({ id: 'n', level: 12 });
    const third = chooseNpcAction({ npc, known, usedThucIds: ['a_thuc', 'b_thuc'], is_spar_friendly: false, rng: seq(0.5) });
    expect(third.thuc?.thucId).toBe('c_thuc');
    const none = chooseNpcAction({ npc, known, usedThucIds: ['a_thuc', 'b_thuc', 'c_thuc'], is_spar_friendly: false, rng: seq(0.5) });
    expect(none.thuc).toEqual(BASIC_ATTACK);
  });
});

// ---------------------------------------------------------------------------
// Narration hand-off, stat score, knobs
// ---------------------------------------------------------------------------

describe('narration hand-off', () => {
  it('test_narrative_exchange_description_names_thuc_hit_crit_and_state', () => {
    const input = exchange({ B: fighter({ id: 'n', name: 'Sơn tặc', spd: 25, hp: 10, maxhp: 200 }), rng: seq(0.1, 0.05) });
    const r = resolveExchange(input);
    const lines = describeExchange(r, input);
    expect(lines[0]).toBe('Pha giao đấu 1.');
    expect(lines.some((l) => l.includes('"Hỏa Cầu Thuật"') && l.includes('TRÚNG') && l.includes('CHÍ MẠNG'))).toBe(true);
    expect(lines.some((l) => l.includes('chưa kịp ra đòn'))).toBe(true);
    expect(lines[lines.length - 1]).toContain('TRẬN ĐẤU KẾT THÚC: Người chơi thắng');
  });

  it('test_narrative_exchange_description_of_flee_and_ongoing_battle', () => {
    const fled = exchange({ actions: { A: { type: 'flee' }, B: { type: 'skill', thuc: BASIC_ATTACK } }, rng: seq(0.1) });
    expect(describeExchange(resolveExchange(fled), fled).join(' ')).toContain('bỏ chạy THÀNH CÔNG');
    const ongoing = exchange({ rng: seq(0.99, 0.99) });
    expect(describeExchange(resolveExchange(ongoing), ongoing).join(' ')).toContain('CHƯA kết thúc');
  });

  it('test_narrative_exchange_stat_score_is_non_negative_and_weights_hp', () => {
    expect(statScore(fighter({ maxhp: 400, atk: 0, def: 0, spd: 0, evasion: 0, cr: 0, cdmg: 50, acc: 0 }), K)).toBe(100);
    expect(statScore(fighter({ maxhp: 0, atk: 0, def: 0, spd: 0, evasion: 0, cr: 0, cdmg: 0, acc: 0 }), K)).toBe(0);
  });
});

describe('knobs', () => {
  it('test_narrative_exchange_game_config_block_loads', () => {
    const k = narrativeCombatKnobsFromGameConfig(GAME_CONFIG as Record<string, unknown>);
    expect(k.PENALTY_PER_TIER).toBe((GAME_CONFIG as Record<string, any>).narrativeCombat.PENALTY_PER_TIER);
    expect(narrativeCombatKnobsFromGameConfig({})).toEqual(DEFAULT_NARRATIVE_COMBAT_KNOBS);
  });

  it('test_narrative_exchange_cross_constraints_fail_loud', () => {
    expect(() => assertNarrativeCombatKnobs({ EXHAUSTION_ONSET_EXCHANGE: 150 })).toThrow(NarrativeCombatConfigError);
    expect(() => assertNarrativeCombatKnobs({ EXHAUSTION_DRAIN_PCT: 0.02 })).toThrow(NarrativeCombatConfigError);
    expect(() => assertNarrativeCombatKnobs({ P_MIN: 0.9, P_MAX: 0.5 })).toThrow(NarrativeCombatConfigError);
    expect(() => assertNarrativeCombatKnobs({ K_HIT: 0 })).toThrow(NarrativeCombatConfigError);
    expect(assertNarrativeCombatKnobs({ PENALTY_PER_TIER: 0.2 }).PENALTY_PER_TIER).toBe(0.2);
  });
});
