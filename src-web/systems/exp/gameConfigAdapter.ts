/**
 * Bridge between the designer-facing `gameConfig.js` blocks and the typed knob
 * structures the deterministic systems consume.
 *
 * Design docs: production/gdd-integration/gdd-02-exp-equipment.md (A3 "26
 * mandatory constants", A5 knob table), production/gdd-integration/plan.md P1.
 *
 * WHY A BRIDGE
 * `gameConfig.js` is edited by designers, so its keys are flat and Vietnamese-
 * commented (`statGrowth.LEVEL_GROWTH_HP`), while the systems want nested
 * per-stat records. Doing that reshape in one audited place means a typo in the
 * config surfaces as one fail-loud error at load, not as a silent `undefined`
 * deep inside the EXP economy (gdd-02 EC-8: never default to 0).
 *
 * Pure module: no React, no I/O, no RNG.
 */

import { GAME_CONFIG } from '../../../gameConfig.js';
import {
  CONTENT_EXCHANGE_ESTIMATE_RANGE,
  EQUIPMENT_KNOBS,
  GDD_STAT_KEYS,
  type GddStatKey,
} from '../registry';
import {
  cloneDefaultSystemsConfig,
  validateSystemsConfig,
  type SystemsConfig,
} from '../configValidation';
import {
  assertEconomyInvariant,
  assertExpKnobs,
  type ExpKnobs,
} from './resolveTurnExp';
import {
  assertStatGrowthConfig,
  type StatGrowthConfig,
} from './statGrowth';
import type { EquipmentKnobs } from '../equipment/validateDataset';
import { assertAffinityKnobs, type AffinityKnobs } from '../affinity/table';
import { assertDeathKnobs, type DeathKnobs } from '../death/deathRoll';
import { assertNarrationLintKnobs } from '../contract/narrationLint';
import { assertNarrationGuardKnobs } from '../contract/narrationGuard';
import { assertNarrativeCombatKnobs } from '../combat/narrativeExchange';

type AnyConfig = Record<string, unknown>;

function block(gc: AnyConfig, name: string): AnyConfig {
  const value = gc?.[name];
  return value && typeof value === 'object' ? (value as AnyConfig) : {};
}

/** `GAME_CONFIG.expProgression` -> `ExpKnobs`. Missing keys stay missing so the
 *  fail-loud assert can name them (gdd-02 EC-8). */
export function expKnobsFromGameConfig(gc: AnyConfig = GAME_CONFIG as AnyConfig): ExpKnobs {
  return { ...(block(gc, 'expProgression') as unknown as ExpKnobs) };
}

/** `GAME_CONFIG.statGrowth` (flat `LEVEL_GROWTH_HP` keys) -> nested records. */
export function statGrowthConfigFromGameConfig(
  gc: AnyConfig = GAME_CONFIG as AnyConfig,
): StatGrowthConfig {
  const flat = block(gc, 'statGrowth');
  const exp = block(gc, 'expProgression');
  const levelGrowth = {} as Record<GddStatKey, number>;
  const breakthroughBonus = {} as Record<GddStatKey, number>;
  for (const stat of GDD_STAT_KEYS) {
    levelGrowth[stat] = flat['LEVEL_GROWTH_' + stat] as number;
    breakthroughBonus[stat] = flat['BREAKTHROUGH_BONUS_' + stat] as number;
  }
  return {
    levelGrowth,
    breakthroughBonus,
    percentStatCap: exp.PERCENT_STAT_CAP as number,
  };
}

/** `GAME_CONFIG.equipment` -> `EquipmentKnobs`, falling back to the registry. */
export function equipmentKnobsFromGameConfig(
  gc: AnyConfig = GAME_CONFIG as AnyConfig,
): EquipmentKnobs {
  const cfg = block(gc, 'equipment');
  return {
    min_thuc_per_skill:
      typeof cfg.min_thuc_per_skill === 'number'
        ? cfg.min_thuc_per_skill
        : EQUIPMENT_KNOBS.min_thuc_per_skill,
    max_known_skills_per_character:
      typeof cfg.max_known_skills_per_character === 'number'
        ? cfg.max_known_skills_per_character
        : EQUIPMENT_KNOBS.max_known_skills_per_character,
  };
}

/**
 * `GAME_CONFIG.affinity` -> `AffinityKnobs` (gdd-03 1.5, 21 knobs, phase P2).
 * Missing keys stay missing so `assertAffinityKnobs` can name them.
 */
export function affinityKnobsFromGameConfig(
  gc: AnyConfig = GAME_CONFIG as AnyConfig,
): AffinityKnobs {
  return { ...(block(gc, 'affinity') as unknown as AffinityKnobs) };
}

/** `GAME_CONFIG.death` -> `DeathKnobs` (gdd-03 2.5, 12 knobs, phase P2). */
export function deathKnobsFromGameConfig(gc: AnyConfig = GAME_CONFIG as AnyConfig): DeathKnobs {
  return { ...(block(gc, 'death') as unknown as DeathKnobs) };
}

/**
 * Full cross-system config: registry defaults overridden by whatever
 * `gameConfig.js` actually declares. Only the three P1 blocks are wired; the
 * remaining sections keep their registry defaults until their own phase lands.
 */
export function systemsConfigFromGameConfig(
  gc: AnyConfig = GAME_CONFIG as AnyConfig,
): SystemsConfig {
  const cfg = cloneDefaultSystemsConfig();
  const exp = expKnobsFromGameConfig(gc);
  const growth = statGrowthConfigFromGameConfig(gc);

  cfg.exp = { ...cfg.exp, ...(exp as unknown as Record<string, number>) };
  for (const stat of GDD_STAT_KEYS) {
    if (Number.isFinite(growth.levelGrowth[stat])) cfg.levelGrowth[stat] = growth.levelGrowth[stat];
    if (Number.isFinite(growth.breakthroughBonus[stat])) {
      cfg.breakthroughBonus[stat] = growth.breakthroughBonus[stat];
    }
  }
  cfg.equipment = { ...cfg.equipment, ...equipmentKnobsFromGameConfig(gc) };
  // P2 blocks: gdd-03 affinity + death. `validateSystemsConfig` already knows the
  // cross-system invariants for both (DIMINISH_FLOOR > 0, the three MIN<MAX pairs,
  // FATIGUE_WINDOW_TURNS >= POSITIVE_SOCIAL_COOLDOWN_TURNS, ...).
  cfg.affinity = {
    ...cfg.affinity,
    ...(affinityKnobsFromGameConfig(gc) as unknown as Record<string, number>),
  };
  cfg.death = {
    ...cfg.death,
    ...(deathKnobsFromGameConfig(gc) as unknown as Record<string, number>),
  };
  // Pillar 1 (game-concept.md 243-255): the objective-world block. Same shape as
  // the P2 blocks - registry defaults, overridden by whatever gameConfig.js says.
  cfg.objectivity = {
    ...cfg.objectivity,
    ...(block(gc, 'objectivity') as unknown as Record<string, number | boolean>),
  };
  return cfg;
}

/**
 * Runs every data-load gate the GDDs require, once, at App start.
 * Throws `SystemsConfigError`, `ExpError` or `StatGrowthConfigError`.
 *
 * gdd-02 A3 forbids a release-stripped assert: this ships in the production
 * bundle. The caller decides whether to rethrow (dev) or log (prod).
 */
export function validateGameConfig(gc: AnyConfig = GAME_CONFIG as AnyConfig): void {
  validateSystemsConfig(systemsConfigFromGameConfig(gc));
  const knobs = assertExpKnobs(expKnobsFromGameConfig(gc));
  assertEconomyInvariant(knobs, [...CONTENT_EXCHANGE_ESTIMATE_RANGE]);
  assertStatGrowthConfig(statGrowthConfigFromGameConfig(gc));
  // gdd-03 1.5 / 2.5 (phase P2): a missing affinity or death knob is fail-loud
  // for the same reason EXP knobs are - a silent 0 would quietly disable a whole
  // dampening rule (D.2/D.3/D.4) or make `medium` severity unreachable.
  assertAffinityKnobs(affinityKnobsFromGameConfig(gc));
  assertDeathKnobs(deathKnobsFromGameConfig(gc));
  // Narration lint (Pillar 1 measure, gameConfig.js block 22): a bad threshold
  // would silently turn the repeat check into "everything repeats" or "nothing".
  assertNarrationLintKnobs(block(gc, 'narrationLint') as never);
  // Same block, part B: the cure knobs (each assert ignores keys it does not own).
  assertNarrationGuardKnobs(block(gc, 'narrationLint') as never);
  // Block 23: STORY-mode combat knobs (Combat GDD Tuning Knobs + cross constraints).
  assertNarrativeCombatKnobs(block(gc, 'narrativeCombat') as never);
}
