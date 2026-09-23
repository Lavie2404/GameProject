/**
 * Narrative combat exchange resolver - the mechanical heart of STORY-mode
 * combat, ported from the Combat System GDD so that Pillar 3 ("Sức Mạnh Có
 * Logic") is a formula and not an AI verdict.
 *
 * Design docs: design/gdd/combat-system.md Section D - D.1 effective stats
 * (realm/gear/crippled penalties), D.2 SPD order, D.3 hit, D.4 raw damage,
 * D.4b exhaustion, D.5 crit, D.6 final damage (+ Core Rule #2b defend),
 * D.8 attack chain, D.9 exchange + early termination, D.9b spar parity,
 * D.9c technical cap tiebreak, D.10 regen, D.11 flee, D.13 stat score,
 * D.14 NPC thuc selection. Core Rule #2: the NPC's action comes from D.14,
 * never from the AI. game-concept.md 304-324 (Khế Ước): lock first,
 * narrate second.
 *
 * WHY THIS EXISTS
 * The GDD's implementation was GDScript (`src/gameplay/combat/*.gd`, ADR-0001)
 * and was dropped in the 2026-08-14 web pivot; the web app's STORY mode then
 * told the model "you are the sole referee". This module puts the formulas
 * back, in TypeScript, for the narrative path only. The turn-based sa bàn
 * (`CombatLoop`) is untouched.
 *
 * DOCUMENTED DEVIATIONS FROM THE GDD (this app's data model)
 * - ACC: the app has no accuracy stat. `BASE_ACC` (knob) stands in for
 *   `base_ACC`; the app's `evasion` (0-100 %) is `Né` on the same scale.
 * - Crit rate / crit damage / amp / mitigation arrive as percentages
 *   (`cr`, `cdmg`, `dmgAmp`, `dmgRes`) and are converted to the GDD's
 *   fractions here.
 * - Lifesteal (D.7) and HP regen (D.10) have no stat in the app: `heal` is
 *   always 0 and regen is 0 unless `hpRegen` is supplied.
 * - Weapon/skill tiers are optional (`weaponTier`, `ThucChoice.tier`); when
 *   absent the gear layer of D.1 is 1.0. Items and skills carry no `tier`
 *   in the app today.
 * - Skill power: the GDD uses effective ATK only. The app's skills have their
 *   own power components, so `powerOf(attacker, thuc)` is injectable; the
 *   default is effective ATK. The attacker's D.1 multiplier is applied to
 *   whatever `powerOf` returns.
 *
 * Pure module: no React, no I/O, no RNG of its own (`rng` is injected,
 * `[0,1)`), no clock.
 */

import { tierFromLevel } from '../math';

// ---------------------------------------------------------------------------
// Knobs (gameConfig.js block 23 `narrativeCombat`)
// ---------------------------------------------------------------------------

export interface NarrativeCombatKnobs {
  PENALTY_PER_TIER: number;
  FLOOR_LAYER: number;
  FLOOR_TOTAL: number;
  CRIPPLED_PENALTY_MULT: number;
  BASE_ACC: number;
  K_HIT: number;
  P_MIN: number;
  P_MAX: number;
  MIN_RAW_RATIO: number;
  MIN_DMG_MULT: number;
  DEFEND_DMG_REDUCTION_PCT: number;
  K_FLEE: number;
  P_MIN_FLEE: number;
  P_MAX_FLEE: number;
  NPC_FLEE_HP_THRESHOLD: number;
  HP_REGEN_CAP: number;
  EXHAUSTION_ONSET_EXCHANGE: number;
  EXHAUSTION_DRAIN_PCT: number;
  TECHNICAL_EXCHANGE_CAP: number;
  SPAR_PARITY_TOLERANCE: number;
  SPAR_LOW_HP_THRESHOLD: number;
  W_HP: number;
}

/** GDD Tuning Knobs defaults, verbatim where the app has the stat. */
export const DEFAULT_NARRATIVE_COMBAT_KNOBS: NarrativeCombatKnobs = {
  PENALTY_PER_TIER: 0.15,
  FLOOR_LAYER: 0.1,
  FLOOR_TOTAL: 0.05,
  CRIPPLED_PENALTY_MULT: 0.85,
  BASE_ACC: 50,
  K_HIT: 0.01,
  P_MIN: 0.05,
  P_MAX: 0.95,
  MIN_RAW_RATIO: 0.05,
  MIN_DMG_MULT: 0.1,
  DEFEND_DMG_REDUCTION_PCT: 0.35,
  K_FLEE: 0.01,
  P_MIN_FLEE: 0.05,
  P_MAX_FLEE: 0.95,
  NPC_FLEE_HP_THRESHOLD: 0.2,
  HP_REGEN_CAP: 0.05,
  EXHAUSTION_ONSET_EXCHANGE: 40,
  EXHAUSTION_DRAIN_PCT: 0.05,
  TECHNICAL_EXCHANGE_CAP: 200,
  SPAR_PARITY_TOLERANCE: 0.15,
  SPAR_LOW_HP_THRESHOLD: 0.15,
  W_HP: 0.25,
};

export class NarrativeCombatConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrativeCombatConfigError';
  }
}

function inRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
}

/** Fail-loud at load: GDD Safe Range boundaries plus the two cross constraints. */
export function assertNarrativeCombatKnobs(raw: Partial<NarrativeCombatKnobs>): NarrativeCombatKnobs {
  const k: NarrativeCombatKnobs = { ...DEFAULT_NARRATIVE_COMBAT_KNOBS };
  for (const [key, v] of Object.entries(raw || {})) if (v !== undefined) (k as Record<string, unknown>)[key] = v;
  const fail = (m: string) => {
    throw new NarrativeCombatConfigError('narrativeCombat.' + m);
  };
  if (!inRange(k.PENALTY_PER_TIER, 0, 1)) fail('PENALTY_PER_TIER must be within [0, 1]');
  if (!inRange(k.FLOOR_LAYER, 0, 1)) fail('FLOOR_LAYER must be within [0, 1]');
  if (!inRange(k.FLOOR_TOTAL, 0, 1)) fail('FLOOR_TOTAL must be within [0, 1]');
  if (!inRange(k.CRIPPLED_PENALTY_MULT, 0, 1)) fail('CRIPPLED_PENALTY_MULT must be within [0, 1]');
  if (!inRange(k.BASE_ACC, 0, 1000)) fail('BASE_ACC must be within [0, 1000]');
  if (!(inRange(k.K_HIT, 0, 1) && k.K_HIT > 0)) fail('K_HIT must be > 0');
  if (!(inRange(k.P_MIN, 0, 1) && inRange(k.P_MAX, 0, 1) && k.P_MIN < k.P_MAX)) fail('P_MIN < P_MAX within [0, 1]');
  if (!inRange(k.MIN_RAW_RATIO, 0, 1)) fail('MIN_RAW_RATIO must be within [0, 1]');
  if (!inRange(k.MIN_DMG_MULT, 0, 1)) fail('MIN_DMG_MULT must be within [0, 1]');
  if (!inRange(k.DEFEND_DMG_REDUCTION_PCT, 0, 1)) fail('DEFEND_DMG_REDUCTION_PCT must be within [0, 1]');
  if (!(inRange(k.K_FLEE, 0, 1) && k.K_FLEE > 0)) fail('K_FLEE must be > 0');
  if (!(inRange(k.P_MIN_FLEE, 0, 1) && inRange(k.P_MAX_FLEE, 0, 1) && k.P_MIN_FLEE < k.P_MAX_FLEE)) {
    fail('P_MIN_FLEE < P_MAX_FLEE within [0, 1]');
  }
  if (!inRange(k.NPC_FLEE_HP_THRESHOLD, 0, 1)) fail('NPC_FLEE_HP_THRESHOLD must be within [0, 1]');
  if (!inRange(k.HP_REGEN_CAP, 0, 1)) fail('HP_REGEN_CAP must be within [0, 1]');
  if (!(Number.isInteger(k.EXHAUSTION_ONSET_EXCHANGE) && k.EXHAUSTION_ONSET_EXCHANGE > 0)) fail('EXHAUSTION_ONSET_EXCHANGE must be an integer > 0');
  if (!(Number.isInteger(k.TECHNICAL_EXCHANGE_CAP) && k.TECHNICAL_EXCHANGE_CAP > 0)) fail('TECHNICAL_EXCHANGE_CAP must be an integer > 0');
  if (!(k.EXHAUSTION_ONSET_EXCHANGE < k.TECHNICAL_EXCHANGE_CAP)) fail('EXHAUSTION_ONSET_EXCHANGE must be < TECHNICAL_EXCHANGE_CAP');
  if (k.TECHNICAL_EXCHANGE_CAP - k.EXHAUSTION_ONSET_EXCHANGE < 120) {
    fail('TECHNICAL_EXCHANGE_CAP - EXHAUSTION_ONSET_EXCHANGE must be >= 120 (GDD cross constraint #2)');
  }
  if (!inRange(k.EXHAUSTION_DRAIN_PCT, 0.05, 1)) fail('EXHAUSTION_DRAIN_PCT must be within [0.05, 1] (GDD: never below 0.05)');
  if (!inRange(k.SPAR_PARITY_TOLERANCE, 0, 1)) fail('SPAR_PARITY_TOLERANCE must be within [0, 1]');
  if (!inRange(k.SPAR_LOW_HP_THRESHOLD, 0, 1)) fail('SPAR_LOW_HP_THRESHOLD must be within [0, 1]');
  if (!inRange(k.W_HP, 0, 100)) fail('W_HP must be within [0, 100]');
  return k;
}

export function narrativeCombatKnobsFromGameConfig(gc: Record<string, unknown> | null | undefined): NarrativeCombatKnobs {
  const raw = gc && typeof gc.narrativeCombat === 'object' && gc.narrativeCombat
    ? (gc.narrativeCombat as Partial<NarrativeCombatKnobs>)
    : {};
  return assertNarrativeCombatKnobs(raw);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What the resolver reads off an App character. All percentages are 0-100. */
export interface CombatantStats {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxhp: number;
  atk: number;
  def: number;
  spd: number;
  /** Optional accuracy; `BASE_ACC` when absent (deviation note in header). */
  acc?: number;
  /** Dodge chance in % (App `evasion`). */
  evasion?: number;
  /** Crit rate in % (App `cr`). */
  cr?: number;
  /** Crit damage in % (App `cdmg`, 200 = x2.0). */
  cdmg?: number;
  /** Damage amplification in % (App `dmgAmp`). */
  dmgAmp?: number;
  /** Damage resistance in % (App `dmgRes`). */
  dmgRes?: number;
  /** HP regen per exchange as a FRACTION of max HP (no App stat; default 0). */
  hpRegen?: number;
  /** Tier of the equipped weapon, when the data model has one. */
  weaponTier?: number;
  /** Death & Consequence `death_and_consequence_blocked` (crippled). */
  crippled?: boolean;
}

export type ActorKey = 'A' | 'B';
export type ActionType = 'skill' | 'defend' | 'flee';

export interface ThucChoice {
  /** Stable id; `'basic_attack'` for the fallback strike. */
  thucId: string;
  /** Display name the narrator must use. */
  name: string;
  /** Skill tier when the data model has one. */
  tier?: number;
}

export const BASIC_ATTACK: ThucChoice = { thucId: 'basic_attack', name: 'Đánh thường' };

export interface ActorAction {
  type: ActionType;
  /** Required when `type === 'skill'`; ignored otherwise. */
  thuc?: ThucChoice | null;
}

export interface Outcome {
  type: 'win' | 'lose' | 'no_outcome';
  winner_id: string | null;
  loser_id: string | null;
}

export interface PerActorResult {
  thuc_id: string | null;
  thuc_name: string | null;
  action_type: ActionType;
  executed: boolean;
  hit: boolean | null;
  crit: boolean | null;
  damage_dealt: number;
  heal: number;
  hp_after: number;
  /** Hit probability that was rolled (diagnostic; null when no attack). */
  p_hit: number | null;
}

export interface ExchangeResult {
  exchange_id: number;
  first_id: string;
  second_id: string;
  per_actor: Record<ActorKey, PerActorResult>;
  battle_active: boolean;
  outcome: Outcome | null;
  /** Flee attempt bookkeeping (null when nobody tried). */
  flee: { actor: ActorKey; success: boolean; p_flee: number } | null;
  /** Exhaustion drain applied this exchange per actor (0 before onset). */
  drain: Record<ActorKey, number>;
}

export interface ExchangeInput {
  exchange_id: number;
  A: CombatantStats;
  B: CombatantStats;
  actions: Record<ActorKey, ActorAction>;
  player: ActorKey;
  is_spar_friendly: boolean;
  /** D.9b gate, computed once per battle via `sparParityEligible`. */
  spar_parity_eligible: boolean;
  /** Uniform `[0,1)` roll. Injected: tests pass a scripted sequence. */
  rng: () => number;
  knobs?: NarrativeCombatKnobs;
  /** Base attack power for a thuc (pre-penalty). Default: base ATK. */
  powerOf?: (attacker: CombatantStats, thuc: ThucChoice) => number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function other(k: ActorKey): ActorKey {
  return k === 'A' ? 'B' : 'A';
}

// ---------------------------------------------------------------------------
// D.1 - effective stats
// ---------------------------------------------------------------------------

export function layerMult(gap: number, knobs: NarrativeCombatKnobs): number {
  return clamp(1 - knobs.PENALTY_PER_TIER * Math.max(0, gap), knobs.FLOOR_LAYER, 1);
}

/**
 * `total_penalty_multiplier(C)` for C facing `opponent`, using `thuc` (if
 * any) for the gear layer's skill term.
 */
export function totalPenaltyMultiplier(
  c: CombatantStats,
  opponent: CombatantStats,
  thuc: ThucChoice | null | undefined,
  knobs: NarrativeCombatKnobs,
): number {
  const tier = tierFromLevel(num(c.level, 1));
  const gapRealm = Math.max(0, tierFromLevel(num(opponent.level, 1)) - tier);
  const weaponGap = c.weaponTier === undefined ? 0 : Math.max(0, num(c.weaponTier) - tier);
  const skillGap = thuc && thuc.tier !== undefined ? Math.max(0, num(thuc.tier) - tier) : 0;
  const gapGear = Math.max(0, weaponGap, skillGap);
  const crippled = c.crippled ? knobs.CRIPPLED_PENALTY_MULT : 1;
  return clamp(layerMult(gapRealm, knobs) * layerMult(gapGear, knobs) * crippled, knobs.FLOOR_TOTAL, 1);
}

export interface EffectiveStats {
  mult: number;
  atk: number;
  def: number;
  spd: number;
  acc: number;
  ne: number;
  critRate: number;
  critDamage: number;
  amp: number;
  mitigation: number;
  hpRegen: number;
}

export function effectiveStats(
  c: CombatantStats,
  opponent: CombatantStats,
  thuc: ThucChoice | null | undefined,
  knobs: NarrativeCombatKnobs,
): EffectiveStats {
  const m = totalPenaltyMultiplier(c, opponent, thuc, knobs);
  return {
    mult: m,
    atk: Math.max(0, num(c.atk)) * m,
    def: Math.max(0, num(c.def)) * m,
    spd: Math.max(0, num(c.spd)) * m,
    acc: Math.max(0, c.acc === undefined ? knobs.BASE_ACC : num(c.acc)) * m,
    ne: Math.max(0, num(c.evasion)) * m,
    critRate: clamp((Math.max(0, num(c.cr)) / 100) * m, 0, 1),
    critDamage: (Math.max(0, num(c.cdmg, 150)) / 100) * m,
    amp: (Math.max(0, num(c.dmgAmp)) / 100) * m,
    mitigation: (Math.max(0, num(c.dmgRes)) / 100) * m,
    hpRegen: Math.max(0, num(c.hpRegen)) * m,
  };
}

// ---------------------------------------------------------------------------
// D.3 / D.4 / D.5 / D.6 / D.8 - one attack
// ---------------------------------------------------------------------------

export function hitProbability(attacker: EffectiveStats, defender: EffectiveStats, knobs: NarrativeCombatKnobs): number {
  return clamp(0.5 + knobs.K_HIT * (attacker.acc - defender.ne), knobs.P_MIN, knobs.P_MAX);
}

export function fleeProbability(fleeing: EffectiveStats, opponent: EffectiveStats, knobs: NarrativeCombatKnobs): number {
  return clamp(0.5 + knobs.K_FLEE * (fleeing.spd - opponent.spd), knobs.P_MIN_FLEE, knobs.P_MAX_FLEE);
}

export interface AttackResult {
  hit: boolean;
  crit: boolean | null;
  damage: number;
  heal: number;
  hp_defender_after: number;
  p_hit: number;
}

/** D.8 with `power` already carrying the attacker's D.1 multiplier. */
export function resolveAttack(
  attacker: EffectiveStats,
  attackPower: number,
  defender: EffectiveStats,
  hpDefender: number,
  defenderIsDefending: boolean,
  rng: () => number,
  knobs: NarrativeCombatKnobs,
): AttackResult {
  const pHit = hitProbability(attacker, defender, knobs);
  if (!(rng() < pHit)) {
    return { hit: false, crit: null, damage: 0, heal: 0, hp_defender_after: hpDefender, p_hit: pHit };
  }
  // D.4
  const power = Math.max(0, attackPower);
  const raw = Math.max(power * knobs.MIN_RAW_RATIO, power - defender.def);
  // D.5
  const isCrit = rng() < attacker.critRate;
  const critMult = isCrit ? Math.max(1, attacker.critDamage) : 1;
  // D.6
  const preMitigation = raw * critMult;
  const finalMult = Math.max(knobs.MIN_DMG_MULT, (1 + attacker.amp) * (1 - defender.mitigation));
  const defendMult = defenderIsDefending ? 1 - knobs.DEFEND_DMG_REDUCTION_PCT : 1;
  const finalRaw = Math.round(preMitigation * finalMult * defendMult);
  const finalDamage = raw > 0 ? Math.max(1, finalRaw) : 0;
  return {
    hit: true,
    crit: isCrit,
    damage: finalDamage,
    heal: 0, // D.7: no lifesteal stat in this app
    hp_defender_after: Math.max(0, hpDefender - finalDamage),
    p_hit: pHit,
  };
}

// ---------------------------------------------------------------------------
// D.13 stat score + D.9b parity gate (computed once per battle)
// ---------------------------------------------------------------------------

export function statScore(c: CombatantStats, knobs: NarrativeCombatKnobs): number {
  const acc = c.acc === undefined ? knobs.BASE_ACC : num(c.acc);
  const score =
    knobs.W_HP * Math.max(0, num(c.maxhp)) +
    Math.max(0, num(c.atk)) +
    Math.max(0, num(c.def)) +
    Math.max(0, num(c.spd)) +
    Math.max(0, acc) +
    Math.max(0, num(c.evasion)) +
    Math.max(0, num(c.cr)) +
    Math.max(0, num(c.cdmg, 150) - 100) +
    Math.max(0, num(c.dmgAmp)) +
    Math.max(0, num(c.dmgRes)) +
    Math.max(0, num(c.hpRegen)) * 100;
  return Math.max(0, score);
}

export function sparParityEligible(A: CombatantStats, B: CombatantStats, isSparFriendly: boolean, knobs: NarrativeCombatKnobs): boolean {
  if (!isSparFriendly) return false;
  const a = statScore(A, knobs);
  const b = statScore(B, knobs);
  if (a === 0 && b === 0) return false;
  const parityDiff = Math.abs(a - b) / Math.max(a, b, 1);
  return parityDiff <= knobs.SPAR_PARITY_TOLERANCE;
}

function reclassifyOutcome(
  nominalWinner: ActorKey,
  nominalLoser: ActorKey,
  input: ExchangeInput,
  hp: Record<ActorKey, number>,
  knobs: NarrativeCombatKnobs,
): Outcome {
  const w = input[nominalWinner];
  const hpPct = hp[nominalWinner] / Math.max(num(w.maxhp), 1);
  if (input.spar_parity_eligible && hpPct <= knobs.SPAR_LOW_HP_THRESHOLD) {
    return { type: 'no_outcome', winner_id: null, loser_id: null };
  }
  return {
    type: nominalWinner === input.player ? 'win' : 'lose',
    winner_id: w.id,
    loser_id: input[nominalLoser].id,
  };
}

// ---------------------------------------------------------------------------
// D.14 - NPC action (Core Rule #2, two tiers)
// ---------------------------------------------------------------------------

export interface NpcActionInput {
  npc: CombatantStats;
  /** Every thuc the NPC knows (id, name, optional tier). */
  known: readonly ThucChoice[];
  /** thuc ids already used in this battle (no-repeat rule). */
  usedThucIds: readonly string[];
  is_spar_friendly: boolean;
  rng: () => number;
  knobs?: NarrativeCombatKnobs;
}

export function chooseNpcAction(input: NpcActionInput): ActorAction {
  const knobs = input.knobs ?? DEFAULT_NARRATIVE_COMBAT_KNOBS;
  const npc = input.npc;
  // Tier 1 - survival: flee below the threshold, never in a friendly spar.
  const hpPct = num(npc.hp) / Math.max(num(npc.maxhp), 1);
  if (!input.is_spar_friendly && hpPct < knobs.NPC_FLEE_HP_THRESHOLD) {
    return { type: 'flee', thuc: null };
  }
  // Tier 2 - D.14 pool: unpenalised thuc first, then any, then basic attack.
  const used = new Set(input.usedThucIds);
  const tier = tierFromLevel(num(npc.level, 1));
  const unused = input.known.filter((t) => t && t.thucId && !used.has(t.thucId));
  const low = unused.filter((t) => t.tier === undefined || num(t.tier) <= tier);
  const poolSet = low.length ? low : unused.length ? unused : [BASIC_ATTACK];
  const pool = [...poolSet].sort((x, y) => (x.thucId < y.thucId ? -1 : x.thucId > y.thucId ? 1 : 0));
  const idx = Math.min(Math.floor(input.rng() * pool.length), pool.length - 1);
  return { type: 'skill', thuc: pool[idx] };
}

// ---------------------------------------------------------------------------
// D.9 - the exchange
// ---------------------------------------------------------------------------

export function resolveExchange(input: ExchangeInput): ExchangeResult {
  const knobs = input.knobs ?? DEFAULT_NARRATIVE_COMBAT_KNOBS;
  const rng = input.rng;
  const powerOf = input.powerOf ?? ((attacker: CombatantStats) => Math.max(0, num(attacker.atk)));
  const thucOf = (k: ActorKey): ThucChoice | null =>
    input.actions[k].type === 'skill' ? input.actions[k].thuc || BASIC_ATTACK : null;

  // Effective stats: each side is penalised against the OTHER side (D.1).
  const eff: Record<ActorKey, EffectiveStats> = {
    A: effectiveStats(input.A, input.B, thucOf('A'), knobs),
    B: effectiveStats(input.B, input.A, thucOf('B'), knobs),
  };
  const hp: Record<ActorKey, number> = { A: Math.max(0, num(input.A.hp)), B: Math.max(0, num(input.B.hp)) };
  const maxhp: Record<ActorKey, number> = { A: Math.max(1, num(input.A.maxhp, 1)), B: Math.max(1, num(input.B.maxhp, 1)) };

  const emptyActor = (k: ActorKey, executed: boolean): PerActorResult => ({
    thuc_id: null,
    thuc_name: null,
    action_type: input.actions[k].type,
    executed,
    hit: null,
    crit: null,
    damage_dealt: 0,
    heal: 0,
    hp_after: hp[k],
    p_hit: null,
  });

  // (0) D.2 canonical order.
  let orderFirst: ActorKey;
  if (eff.A.spd > eff.B.spd) orderFirst = 'A';
  else if (eff.B.spd > eff.A.spd) orderFirst = 'B';
  else orderFirst = rng() < 0.5 ? 'A' : 'B';
  let orderSecond = other(orderFirst);

  // (1) Flee has priority over SPD.
  let flee: ExchangeResult['flee'] = null;
  let fleeFailedBy: ActorKey | null = null;
  for (const X of [orderFirst, orderSecond] as ActorKey[]) {
    if (input.actions[X].type !== 'flee') continue;
    const pFlee = fleeProbability(eff[X], eff[other(X)], knobs);
    const success = rng() < pFlee;
    flee = { actor: X, success, p_flee: pFlee };
    if (success) {
      const perActor = {
        [X]: { ...emptyActor(X, true), action_type: 'flee' as ActionType },
        [other(X)]: emptyActor(other(X), false),
      } as Record<ActorKey, PerActorResult>;
      return {
        exchange_id: input.exchange_id,
        first_id: input[X].id,
        second_id: input[other(X)].id,
        per_actor: perActor,
        battle_active: false,
        outcome: { type: 'no_outcome', winner_id: null, loser_id: null },
        flee,
        drain: { A: 0, B: 0 },
      };
    }
    fleeFailedBy = X;
  }
  // A failed flee hands `first` to the opponent (D.11).
  let first: ActorKey = orderFirst;
  let second: ActorKey = orderSecond;
  const bothFled = input.actions.A.type === 'flee' && input.actions.B.type === 'flee';
  if (fleeFailedBy !== null && !bothFled) {
    first = other(fleeFailedBy);
    second = fleeFailedBy;
  }

  const attackPower = (k: ActorKey): number => {
    const thuc = thucOf(k) || BASIC_ATTACK;
    return Math.max(0, num(powerOf(input[k], thuc))) * eff[k].mult;
  };

  // (2) First strike.
  let r1: AttackResult | null = null;
  if (input.actions[first].type === 'skill') {
    r1 = resolveAttack(eff[first], attackPower(first), eff[second], hp[second], input.actions[second].type === 'defend', rng, knobs);
    hp[second] = r1.hp_defender_after;
  }

  let battleActive = true;
  let outcome: Outcome | null = null;
  let r2: AttackResult | null = null;
  let r2Executed = true;
  const drain: Record<ActorKey, number> = { A: 0, B: 0 };

  if (hp[second] === 0) {
    // Early termination: the second strike never happens.
    r2Executed = false;
    battleActive = false;
    outcome = reclassifyOutcome(first, second, input, hp, knobs);
  } else {
    if (input.actions[second].type === 'skill') {
      r2 = resolveAttack(eff[second], attackPower(second), eff[first], hp[first], input.actions[first].type === 'defend', rng, knobs);
      hp[first] = r2.hp_defender_after;
    }
    if (hp[first] === 0) {
      battleActive = false;
      outcome = reclassifyOutcome(second, first, input, hp, knobs);
    } else {
      // D.4b progress, D.10 regen, then symmetric drain.
      const progress = clamp(
        (input.exchange_id - knobs.EXHAUSTION_ONSET_EXCHANGE) / (knobs.TECHNICAL_EXCHANGE_CAP - knobs.EXHAUSTION_ONSET_EXCHANGE),
        0,
        1,
      );
      const regenMult = 1 - progress;
      for (const k of ['A', 'B'] as ActorKey[]) {
        const regenPct = Math.min(eff[k].hpRegen, knobs.HP_REGEN_CAP);
        hp[k] = Math.min(maxhp[k], hp[k] + Math.round(maxhp[k] * regenPct * regenMult));
      }
      const prePct: Record<ActorKey, number> = { A: hp.A / maxhp.A, B: hp.B / maxhp.B };
      for (const k of ['A', 'B'] as ActorKey[]) {
        drain[k] = Math.round(maxhp[k] * knobs.EXHAUSTION_DRAIN_PCT * progress);
        hp[k] = Math.max(0, hp[k] - drain[k]);
      }
      const firstDead = hp[first] === 0;
      const secondDead = hp[second] === 0;
      if (firstDead && secondDead) {
        battleActive = false;
        let winner: ActorKey;
        if (prePct[first] !== prePct[second]) winner = prePct[first] > prePct[second] ? first : second;
        else winner = rng() < 0.5 ? 'A' : 'B';
        outcome = { type: winner === input.player ? 'win' : 'lose', winner_id: input[winner].id, loser_id: input[other(winner)].id };
      } else if (firstDead) {
        battleActive = false;
        outcome = reclassifyOutcome(second, first, input, hp, knobs);
      } else if (secondDead) {
        battleActive = false;
        outcome = reclassifyOutcome(first, second, input, hp, knobs);
      }
    }
  }

  // (3) D.9c technical cap, after the exchange fully resolved.
  if (battleActive && input.exchange_id >= knobs.TECHNICAL_EXCHANGE_CAP) {
    battleActive = false;
    if (input.is_spar_friendly) {
      outcome = { type: 'no_outcome', winner_id: null, loser_id: null };
    } else {
      const pctA = hp.A / maxhp.A;
      const pctB = hp.B / maxhp.B;
      const winner: ActorKey = pctA !== pctB ? (pctA > pctB ? 'A' : 'B') : rng() < 0.5 ? 'A' : 'B';
      outcome = { type: winner === input.player ? 'win' : 'lose', winner_id: input[winner].id, loser_id: input[other(winner)].id };
    }
  }

  const build = (k: ActorKey, r: AttackResult | null, executed: boolean): PerActorResult => {
    const thuc = thucOf(k);
    return {
      thuc_id: thuc ? thuc.thucId : null,
      thuc_name: thuc ? thuc.name : null,
      action_type: input.actions[k].type,
      executed,
      hit: r ? r.hit : null,
      crit: r ? r.crit : null,
      damage_dealt: r ? r.damage : 0,
      heal: r ? r.heal : 0,
      hp_after: hp[k],
      p_hit: r ? r.p_hit : null,
    };
  };

  return {
    exchange_id: input.exchange_id,
    first_id: input[first].id,
    second_id: input[second].id,
    per_actor: { [first]: build(first, r1, true), [second]: build(second, r2, r2Executed) } as Record<ActorKey, PerActorResult>,
    battle_active: battleActive,
    outcome,
    flee,
    drain,
  };
}

// ---------------------------------------------------------------------------
// Narration hand-off (Pillar 4): the facts the narrator must carry
// ---------------------------------------------------------------------------

function pctLabel(hp: number, maxhp: number): string {
  const p = hp / Math.max(maxhp, 1);
  if (hp <= 0) return 'gục ngã (HP về 0)';
  if (p < 0.2) return 'nguy kịch (dưới 20% HP)';
  if (p < 0.5) return 'trọng thương (dưới 50% HP)';
  if (p < 0.8) return 'bị thương (dưới 80% HP)';
  return 'gần như lành lặn';
}

/**
 * The "KẾT QUẢ ĐÃ ĐỊNH" lines for API-2, in order. Facts only, with the thuc
 * names the narration must use; HP is given as a state label plus the raw
 * numbers for the model's calibration (the prose rule forbids numbers).
 */
export function describeExchange(result: ExchangeResult, input: Pick<ExchangeInput, 'A' | 'B'>): string[] {
  const byId = (id: string): { key: ActorKey; c: CombatantStats } =>
    input.A.id === id ? { key: 'A', c: input.A } : { key: 'B', c: input.B };
  const lines: string[] = [];
  lines.push(`Pha giao đấu ${result.exchange_id}.`);
  if (result.flee) {
    const f = input[result.flee.actor];
    lines.push(result.flee.success
      ? `${f.name} bỏ chạy THÀNH CÔNG; trận đấu kết thúc, không bên nào thắng.`
      : `${f.name} cố bỏ chạy nhưng THẤT BẠI, không kịp ra đòn pha này.`);
    if (result.flee.success) return lines;
  }
  const order: ActorKey[] = [byId(result.first_id).key, byId(result.second_id).key];
  for (const k of order) {
    const pa = result.per_actor[k];
    const c = input[k];
    const target = input[other(k)];
    if (pa.action_type === 'defend') {
      lines.push(`${c.name} chọn PHÒNG THỦ, không ra đòn (sát thương nhận vào pha này giảm).`);
      continue;
    }
    if (pa.action_type === 'flee') continue; // already described
    if (!pa.executed) {
      lines.push(`${c.name} chưa kịp ra đòn: đối thủ đã gục trước.`);
      continue;
    }
    const thuc = pa.thuc_name || 'Đánh thường';
    if (pa.hit === false) {
      lines.push(`${c.name} dùng thức "${thuc}" nhắm vào ${target.name}: HỤT, không gây sát thương.`);
    } else {
      const crit = pa.crit ? ', CHÍ MẠNG' : '';
      const after = result.per_actor[other(k)].hp_after;
      lines.push(`${c.name} dùng thức "${thuc}" nhắm vào ${target.name}: TRÚNG${crit}, gây ${pa.damage_dealt} sát thương; ${target.name} ${pctLabel(after, target.maxhp)} (HP ${after}/${target.maxhp}).`);
    }
  }
  if (result.drain.A > 0 || result.drain.B > 0) {
    lines.push('Trận kéo dài, cả hai đã kiệt sức: chiêu chậm lại, vết thương nhỏ không kịp lành.');
  }
  if (!result.battle_active && result.outcome) {
    if (result.outcome.type === 'no_outcome' && !result.flee) {
      lines.push('Cả hai cùng kiệt lực, trận giao hữu kết thúc bất phân thắng bại.');
    } else if (result.outcome.winner_id) {
      const w = byId(result.outcome.winner_id).c;
      const l = byId(result.outcome.loser_id as string).c;
      lines.push(`TRẬN ĐẤU KẾT THÚC: ${w.name} thắng, ${l.name} gục ngã.`);
    }
  } else {
    lines.push('Trận đấu CHƯA kết thúc: cả hai còn đứng vững, pha kế tiếp sẽ tiếp diễn.');
  }
  return lines;
}
