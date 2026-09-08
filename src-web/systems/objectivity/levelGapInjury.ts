/**
 * Pillar 1 - "The Gioi Khach Quan": the LEVEL-GAP INJURY rule.
 *
 * Design doc: design/gdd/game-concept.md, "Boi Canh" (lines 38-100) and
 * "Pillar 1" (lines 243-255). Owner rule, stated verbatim:
 *
 *   Whenever a HOSTILE opponent is more than `HOSTILE_INITIATIVE_LEVEL_GAP_MAX`
 *   (= 20) levels above the player, that opponent MUST be "Trong Thuong"
 *   (gravely wounded): its EFFECTIVE level drops to `player.level + 20`, its
 *   TRUE level is preserved, and the injury is FULLY RECOVERABLE.
 *
 * WHY A CAP AND NOT A BAN
 * gdd-05 A5 already forbids an NPC OPENING hostilities across more than 20
 * levels. That rule alone cannot cover the cases where the player walks into
 * the fight themselves. This module keeps the fiction ("an ancient monster IS
 * level 90") while making the encounter survivable and, above all, honest: the
 * reduction is a diegetic old wound, not a difficulty slider.
 *
 * SCOPE
 * - Only HOSTILE NPCs. Neutral/friendly NPCs are exempt - gdd-05 gates hostile
 *   INITIATIVE, and a friendly level-90 mentor is a feature, not a threat.
 * - Recovery is NEVER automatic. Time does not heal it. Only an explicit
 *   recovery event (linh dan / ky ngo / danh y) removes it.
 *
 * PURITY
 * No React, no I/O, no RNG, no clock. The NPC stat recomputation belongs to
 * App.tsx (it owns the creation formula), so it is INJECTED as
 * `recomputeStatsForLevel`. That keeps this module testable with a stub.
 */

import { HOSTILE_INITIATIVE_LEVEL_GAP_MAX, OBJECTIVITY_KNOBS } from '../registry';

// ---------------------------------------------------------------------------
// The status entry
// ---------------------------------------------------------------------------

/** Status id written to `npc.longTermStatuses`. Distinct from the combat `TRONG_THUONG`. */
export const GAP_INJURY_STATUS_ID = 'TRONG_THUONG_CANH_GIOI';

export const GAP_INJURY_STATUS_NAME = 'Trọng Thương (Cảnh Giới Suy Giảm)';

export const GAP_INJURY_STATUS_DESCRIPTION =
  'Cựu thương chưa lành: gân cốt tổn hại, khí huyết suy kiệt, sức lực không thể phát huy trọn vẹn. ' +
  'Tu vi thật của người này vốn cao hơn nhiều, nhưng vết thương cũ đang đè nén cảnh giới xuống mức hiện tại. ' +
  'Có thể hồi phục hoàn toàn nhờ linh đan diệu dược, một cơ duyên lớn, hoặc bàn tay của bậc danh y — ' +
  'thời gian trôi qua KHÔNG tự chữa lành nó.';

/** The long-term status entry. `duration: null` = never expires by time. */
export interface GapInjuryStatus {
  status_id: typeof GAP_INJURY_STATUS_ID;
  id: typeof GAP_INJURY_STATUS_ID;
  name: string;
  type: 'injury';
  description: string;
  source: string;
  /** Always `null`: this injury is not on a clock (see module doc). */
  duration: null;
  /** Always `null`: `applyTimePassage` must never expire it. */
  expiresAt: null;
}

export function makeGapInjuryStatus(): GapInjuryStatus {
  return {
    status_id: GAP_INJURY_STATUS_ID,
    id: GAP_INJURY_STATUS_ID,
    name: GAP_INJURY_STATUS_NAME,
    type: 'injury',
    description: GAP_INJURY_STATUS_DESCRIPTION,
    source: 'Cựu thương chưa lành',
    duration: null,
    expiresAt: null,
  };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Snapshot of the pre-injury base stats, for exact restoration on recovery. */
export interface PreInjuryBase {
  baseHp?: number;
  baseAtk?: number;
  baseDef?: number;
  baseSpd?: number;
  ap?: number;
  allocatedPoints?: Record<string, number> | null;
  [k: string]: unknown;
}

export interface GapInjuryRecord {
  /** The level the NPC really is. Never shown to the player as a number. */
  trueLevel: number;
  /** Turn index at which the injury was applied. */
  appliedAtTurn: number;
  reason: 'level_gap';
  /** Player level used for the cap, kept for auditing/tests. */
  playerLevelAtApply: number;
  /** Effective (capped) level written onto the record. */
  cappedLevel: number;
  /** Exact pre-injury base stats, restored verbatim by `recoverGapInjury`. */
  preInjuryBase: PreInjuryBase;
}

/** The minimal NPC shape this module touches. Extra fields pass through. */
export interface GapInjuryNpc {
  level?: number;
  Stance?: string;
  stance?: string;
  isPlayer?: boolean;
  isCompanion?: boolean;
  longTermStatuses?: any[];
  gapInjury?: GapInjuryRecord | null;
  [k: string]: unknown;
}

/** Injected: rebuild an NPC's base stats for `level` using the App's formula. */
export type RecomputeStatsForLevel = (npc: GapInjuryNpc, level: number) => GapInjuryNpc;

// ---------------------------------------------------------------------------
// Hostility + predicate
// ---------------------------------------------------------------------------

/**
 * The Vietnamese `Stance` values the app writes that mean "will fight you".
 * `Nghi ngờ` (suspicious) is deliberately NOT hostile - suspicion is not
 * aggression, and treating it as such would cap half the world's NPCs.
 */
export const HOSTILE_STANCES: readonly string[] = [
  'Thù địch',
  'Thù nghịch',
  'Địch đối',
  'Hostile',
  'Kẻ địch',
  'Thù hận',
];

function normalise(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const HOSTILE_NORMALISED = HOSTILE_STANCES.map(normalise);

/** True when the NPC's stance means hostile. Accepts `Stance` or `stance`. */
export function isHostileStance(stanceOrNpc: unknown): boolean {
  const raw =
    typeof stanceOrNpc === 'string'
      ? stanceOrNpc
      : ((stanceOrNpc as GapInjuryNpc)?.Stance ?? (stanceOrNpc as GapInjuryNpc)?.stance);
  const n = normalise(raw);
  if (!n) return false;
  return HOSTILE_NORMALISED.some((h) => n === h || n.includes(h));
}

/** True when this NPC currently carries the gap-injury status. */
export function hasGapInjuryStatus(npc: GapInjuryNpc | null | undefined): boolean {
  const list = npc?.longTermStatuses;
  if (!Array.isArray(list)) return false;
  return list.some(
    (st) => st && ((st.status_id ?? st.id) === GAP_INJURY_STATUS_ID || st.name === GAP_INJURY_STATUS_NAME),
  );
}

/** True when this NPC is currently under the gap injury (record present). */
export function isGapInjured(npc: GapInjuryNpc | null | undefined): boolean {
  return !!(npc && npc.gapInjury && npc.gapInjury.reason === 'level_gap');
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

export interface ShouldApplyInput {
  npcLevel: number;
  playerLevel: number;
  /** Either an explicit boolean or the raw `Stance` string. */
  hostile?: boolean;
  stance?: string;
  /** Already carries the injury (record and/or status). */
  alreadyInjured?: boolean;
  /** The player provoked this NPC. Only matters if the knob is flipped ON. */
  provoked?: boolean;
  knobs?: { GAP_INJURY_EXEMPT_WHEN_PROVOKED?: boolean; [k: string]: unknown };
  /** Locked constant, injectable for tests only. */
  gapMax?: number;
}

/**
 * The whole rule in one predicate: hostile, not already injured, and strictly
 * MORE than `gapMax` levels above the player.
 *
 * `> gapMax` (not `>=`): at exactly +20 the NPC is at the edge of what gdd-05
 * already permits, so nothing needs to change.
 */
export function shouldApplyGapInjury(input: ShouldApplyInput): boolean {
  const gapMax = Number.isFinite(input.gapMax as number)
    ? (input.gapMax as number)
    : HOSTILE_INITIATIVE_LEVEL_GAP_MAX;
  const npcLevel = Number(input.npcLevel);
  const playerLevel = Number(input.playerLevel);
  if (!Number.isFinite(npcLevel) || !Number.isFinite(playerLevel)) return false;
  if (input.alreadyInjured === true) return false;

  const hostile = input.hostile === true || (input.hostile === undefined && isHostileStance(input.stance));
  if (!hostile) return false;

  const knobs = input.knobs ?? OBJECTIVITY_KNOBS;
  if (input.provoked === true && knobs.GAP_INJURY_EXEMPT_WHEN_PROVOKED === true) return false;

  return npcLevel - playerLevel > gapMax;
}

// ---------------------------------------------------------------------------
// Apply / recover
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  /** Turn index recorded on the injury. Defaults to 0. */
  turn?: number;
  /** Injected NPC stat rebuild. Omit to leave stats untouched (level only). */
  recomputeStatsForLevel?: RecomputeStatsForLevel;
  gapMax?: number;
}

function snapshotBase(npc: GapInjuryNpc): PreInjuryBase {
  const alloc = npc.allocatedPoints as Record<string, number> | undefined;
  return {
    baseHp: npc.baseHp as number | undefined,
    baseAtk: npc.baseAtk as number | undefined,
    baseDef: npc.baseDef as number | undefined,
    baseSpd: npc.baseSpd as number | undefined,
    ap: npc.ap as number | undefined,
    allocatedPoints: alloc ? { ...alloc } : null,
  };
}

/**
 * Applies the injury and returns a NEW npc record. Idempotent: an already
 * injured NPC is returned unchanged (its `trueLevel` must never be overwritten
 * by the already-reduced level - that would erase the real power for good).
 *
 * The cap always uses the player's CURRENT level at application time. A later
 * player level-up does NOT lift the cap; only recovery does.
 */
export function applyGapInjury(
  npc: GapInjuryNpc,
  playerLevel: number,
  options: ApplyOptions = {},
): GapInjuryNpc {
  if (!npc) return npc;
  if (isGapInjured(npc)) return npc;

  const gapMax = Number.isFinite(options.gapMax as number)
    ? (options.gapMax as number)
    : HOSTILE_INITIATIVE_LEVEL_GAP_MAX;
  const trueLevel = Number(npc.level) || 1;
  const cappedLevel = Math.max(1, Math.floor(Number(playerLevel) || 1) + gapMax);
  if (cappedLevel >= trueLevel) return npc;

  const preInjuryBase = snapshotBase(npc);

  let next: GapInjuryNpc = { ...npc, level: cappedLevel };
  if (typeof options.recomputeStatsForLevel === 'function') {
    next = { ...options.recomputeStatsForLevel(next, cappedLevel) };
  }
  next.level = cappedLevel;

  const statuses = Array.isArray(next.longTermStatuses) ? next.longTermStatuses.slice() : [];
  if (!hasGapInjuryStatus({ longTermStatuses: statuses })) statuses.push(makeGapInjuryStatus());
  next.longTermStatuses = statuses;

  next.gapInjury = {
    trueLevel,
    appliedAtTurn: Number.isFinite(options.turn as number) ? (options.turn as number) : 0,
    reason: 'level_gap',
    playerLevelAtApply: Math.floor(Number(playerLevel) || 1),
    cappedLevel,
    preInjuryBase,
  };
  return next;
}

/**
 * Restores the true level and the exact pre-injury base stats, drops the status
 * and the record. Returns a NEW npc record; a non-injured NPC passes through.
 *
 * `recomputeStatsForLevel` is used when no snapshot survives (an old save, or a
 * record hand-edited by the hack panel); the snapshot always wins when present,
 * because it restores AP allocation exactly as it was.
 */
export function recoverGapInjury(
  npc: GapInjuryNpc,
  options: { recomputeStatsForLevel?: RecomputeStatsForLevel } = {},
): GapInjuryNpc {
  if (!npc) return npc;
  const record = npc.gapInjury;
  const hadStatus = hasGapInjuryStatus(npc);
  if (!record && !hadStatus) return npc;

  const trueLevel = record ? Number(record.trueLevel) || Number(npc.level) || 1 : Number(npc.level) || 1;

  let next: GapInjuryNpc = { ...npc, level: trueLevel };

  const snap = record?.preInjuryBase;
  const hasSnapshot =
    !!snap && ['baseHp', 'baseAtk', 'baseDef', 'baseSpd'].some((k) => Number.isFinite(snap[k] as number));

  if (hasSnapshot) {
    if (Number.isFinite(snap!.baseHp as number)) next.baseHp = snap!.baseHp;
    if (Number.isFinite(snap!.baseAtk as number)) next.baseAtk = snap!.baseAtk;
    if (Number.isFinite(snap!.baseDef as number)) next.baseDef = snap!.baseDef;
    if (Number.isFinite(snap!.baseSpd as number)) next.baseSpd = snap!.baseSpd;
    if (Number.isFinite(snap!.ap as number)) next.ap = snap!.ap;
    if (snap!.allocatedPoints) next.allocatedPoints = { ...snap!.allocatedPoints };
  } else if (typeof options.recomputeStatsForLevel === 'function') {
    next = { ...options.recomputeStatsForLevel(next, trueLevel) };
    next.level = trueLevel;
  }

  next.longTermStatuses = (Array.isArray(next.longTermStatuses) ? next.longTermStatuses : []).filter(
    (st) => !(st && ((st.status_id ?? st.id) === GAP_INJURY_STATUS_ID || st.name === GAP_INJURY_STATUS_NAME)),
  );
  next.gapInjury = null;
  delete (next as Record<string, unknown>).gapInjury;
  return next;
}

/** Effective (possibly capped) level - what combat, prompts and the card use. */
export function effectiveLevel(npc: GapInjuryNpc | null | undefined): number {
  return Number(npc?.level) || 1;
}

/** True level. Internal only: NEVER rendered as a number to the player. */
export function trueLevelOf(npc: GapInjuryNpc | null | undefined): number {
  if (npc && npc.gapInjury && Number.isFinite(npc.gapInjury.trueLevel)) return npc.gapInjury.trueLevel;
  return effectiveLevel(npc);
}

// ---------------------------------------------------------------------------
// Player-facing / prompt-facing text (Vietnamese)
// ---------------------------------------------------------------------------

/** Prompt line for an injured NPC. Deliberately carries NO numbers. */
export const GAP_INJURY_PROMPT_HINT =
  'đang trọng thương, cảnh giới suy giảm (thực lực thật cao hơn nhiều)';

/** Character-card status line. */
export const GAP_INJURY_CARD_LINE = 'Trọng Thương — cảnh giới bị đè nén, có thể hồi phục';

/** System message shown when the injury is applied. */
export function gapInjuryAppliedMessage(name: string): string {
  return (
    '**' + (name || 'Đối phương') + '** mang trên mình cựu thương chưa lành — thân thể tổn hại khiến ' +
    'cảnh giới hiện tại bị đè nén xuống thấp hơn thực lực vốn có. Vết thương này có thể được chữa lành.'
  );
}

/** System message shown when the injury is recovered. */
export function gapInjuryRecoveredMessage(name: string): string {
  return (
    '**' + (name || 'Đối phương') + '** đã chữa lành cựu thương — khí huyết hồi phục, ' +
    'cảnh giới thật sự trở lại nguyên vẹn.'
  );
}
