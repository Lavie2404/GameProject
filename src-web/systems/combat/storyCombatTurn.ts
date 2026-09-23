/**
 * STORY-mode combat turn - the bridge between App.tsx's hybrid turn (API-1
 * logic call -> API-2 narration call) and the pure exchange resolver.
 *
 * Design docs: design/gdd/combat-system.md Core Rules #1, #2, #8, #11;
 * game-concept.md Pillar 3 (Sức Mạnh Có Logic) and Pillar 4 (Tường Thuật
 * Sống Động) and the Khế Ước (304-324): the system resolves and LOCKS the
 * exchange, the narrator only tells it.
 *
 * DIVISION OF LABOUR
 * - API-1 (logic engine) CLASSIFIES the player's text: is this combat, which
 *   action type, which thuc, which target, lethal or sparring, does it end the
 *   fight. It never scores the outcome (Core Rule #2 / Contract Enforcement).
 * - This module turns that classification plus the character records into a
 *   `resolveExchange` call, then into (a) system-owned command tags for the
 *   existing tag pipeline (NPC/player HP, NPC death when lethal), (b) the
 *   locked-result lines for API-2, (c) the combat hand-off Death & Consequence
 *   and EXP consume, (d) the next `narrativeCombatState`.
 * - API-2 receives the lines as "KẾT QUẢ ĐÃ ĐỊNH" plus the Pillar-4 rules and
 *   writes prose. Its tags are stripped by the hybrid path anyway.
 *
 * Pure module: no React, no I/O; RNG and skill power are injected.
 */

import {
  BASIC_ATTACK,
  DEFAULT_NARRATIVE_COMBAT_KNOBS,
  chooseNpcAction,
  describeExchange,
  resolveExchange,
  sparParityEligible,
  type ActionType,
  type ActorAction,
  type CombatantStats,
  type ExchangeResult,
  type NarrativeCombatKnobs,
  type ThucChoice,
} from './narrativeExchange';

// ---------------------------------------------------------------------------
// API-1 classification
// ---------------------------------------------------------------------------

export type IntentAction = 'skill' | 'defend' | 'flee' | 'talk' | 'none';

export interface CombatIntent {
  is_combat: boolean;
  action_type: IntentAction;
  skill_name: string;
  target_name: string;
  lethal: boolean;
  ends_combat: boolean;
}

export const EMPTY_INTENT: CombatIntent = {
  is_combat: false,
  action_type: 'none',
  skill_name: '',
  target_name: '',
  lethal: true,
  ends_combat: false,
};

/** Tolerant reader of the `combat` object API-1 returns (any field may be missing). */
export function parseCombatIntent(raw: unknown): CombatIntent {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_INTENT };
  const r = raw as Record<string, unknown>;
  const action = String(r.action_type ?? r.action ?? 'none').trim().toLowerCase();
  const actionType: IntentAction = (['skill', 'defend', 'flee', 'talk', 'none'] as IntentAction[]).includes(action as IntentAction)
    ? (action as IntentAction)
    : action === 'attack'
      ? 'skill'
      : 'none';
  const truthy = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : typeof v === 'string' ? /^(true|1|yes|có)$/i.test(v) : d);
  return {
    is_combat: truthy(r.is_combat, false),
    action_type: actionType,
    skill_name: String(r.skill_name ?? r.skill ?? '').trim(),
    target_name: String(r.target_name ?? r.target ?? '').trim(),
    lethal: truthy(r.lethal, true),
    ends_combat: truthy(r.ends_combat, false),
  };
}

/** JSON schema fragment for the `combat` field of the API-1 response. */
export const COMBAT_INTENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_combat: { type: 'BOOLEAN' },
    action_type: { type: 'STRING', enum: ['skill', 'defend', 'flee', 'talk', 'none'] },
    skill_name: { type: 'STRING' },
    target_name: { type: 'STRING' },
    lethal: { type: 'BOOLEAN' },
    ends_combat: { type: 'BOOLEAN' },
  },
  required: ['is_combat', 'action_type', 'skill_name', 'target_name', 'lethal', 'ends_combat'],
} as const;

/**
 * API-1 instruction (STORY mode only). Classification, never adjudication.
 * `playerThuc` and `presentNpcs` are the exact names it may pick from.
 */
export function buildCombatIntentInstruction(
  playerThuc: readonly string[],
  presentNpcs: readonly string[],
  battleActive: boolean,
  activeOpponent: string | null,
): string {
  const thucList = playerThuc.length ? playerThuc.map((n) => `"${n}"`).join(', ') : '(chưa có thức nào — chỉ có "Đánh thường")';
  const npcList = presentNpcs.length ? presentNpcs.map((n) => `"${n}"`).join(', ') : '(không có ai)';
  const state = battleActive
    ? `ĐANG TRONG TRẬN với "${activeOpponent}": mỗi lượt là MỘT pha giao đấu do HỆ THỐNG tính. Ngươi chỉ phân loại hành động của người chơi trong pha này.`
    : 'CHƯA có trận nào. Nếu hành động là ra tay đánh/tấn công/khiêu chiến một NPC đang hiện diện, đặt is_combat=true để HỆ THỐNG mở trận và tự tính pha đầu tiên.';
  return [
    "6. 'combat' (CHẾ ĐỘ KỂ CHUYỆN — CHỈ PHÂN LOẠI, KHÔNG PHÁN KẾT QUẢ): kết quả mọi đòn đánh, sát thương, thắng thua, sống chết do HỆ THỐNG tính bằng công thức Lực chiến, KHÔNG phải do ngươi. 'summary' và 'commands' của ngươi sẽ bị THAY THẾ bằng kết quả hệ thống khi is_combat=true, nên đừng viết đòn trúng/hụt hay HP.",
    `   - ${state}`,
    "   - is_combat: true nếu hành động lượt này là một hành động GIAO CHIẾN (tấn công, dùng thức, phòng thủ trong trận, bỏ chạy khỏi trận) hoặc trận đang diễn ra; false nếu là chuyện khác.",
    "   - action_type: 'skill' (ra đòn/dùng thức/đánh thường), 'defend' (thủ thế, đỡ, né), 'flee' (bỏ chạy, rút lui khỏi trận), 'talk' (nói chuyện/xin hàng/khuyên can giữa trận), 'none' (không liên quan chiến đấu).",
    `   - skill_name: tên thức người chơi dùng, CHỌN ĐÚNG NGUYÊN VĂN một trong: ${thucList}. Nếu người chơi mô tả đòn không khớp thức nào, để "" (hệ thống coi là Đánh thường).`,
    `   - target_name: tên NPC bị nhắm tới, CHỌN ĐÚNG NGUYÊN VĂN một trong: ${npcList}.`,
    "   - lethal: true nếu là đánh thật/sinh tử; false nếu hai bên rõ ràng chỉ tỉ thí giao hữu.",
    "   - ends_combat: true CHỈ khi trận đang diễn ra và hành động của người chơi khiến CẢ HAI bên ngừng tay theo lý (xin hàng được chấp nhận, khuyên can thành công, đối thủ chủ động dừng) — hệ thống sẽ khép trận không phân thắng bại.",
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Character -> CombatantStats
// ---------------------------------------------------------------------------

/** The App character fields this module reads. */
export interface AppCharacterLike {
  id: string;
  Name?: string;
  level?: number;
  hp?: number;
  maxhp?: number;
  atk?: number;
  def?: number;
  spd?: number;
  evasion?: number;
  cr?: number;
  cdmg?: number;
  dmgAmp?: number;
  dmgRes?: number;
  isPlayer?: boolean;
  isCompanion?: boolean;
  isPermanentlyDead?: boolean;
  current_location_id?: string | null;
  longTermStatuses?: Array<{ id?: string; status_id?: string; name?: string }>;
  equippedSkills?: Record<string, AppSkillLike | null | undefined>;
  learnedSkills?: AppSkillLike[];
  skills?: AppSkillLike[];
}

export interface AppSkillLike {
  id?: string;
  Name?: string;
  name?: string;
  skillType?: string;
  tier?: number;
}

export const CRIPPLED_STATUS_ID = 'PHE_DAN_DIEN';

export function combatantFromCharacter(c: AppCharacterLike): CombatantStats {
  const crippled = (c.longTermStatuses || []).some((s) => s && (s.id === CRIPPLED_STATUS_ID || s.status_id === CRIPPLED_STATUS_ID));
  return {
    id: c.id,
    name: c.Name || c.id,
    level: Number(c.level) || 1,
    hp: Math.max(0, Number(c.hp) || 0),
    maxhp: Math.max(1, Number(c.maxhp) || 1),
    atk: Number(c.atk) || 0,
    def: Number(c.def) || 0,
    spd: Number(c.spd) || 0,
    evasion: Number(c.evasion) || 0,
    cr: Number(c.cr) || 0,
    cdmg: Number.isFinite(Number(c.cdmg)) ? Number(c.cdmg) : 150,
    dmgAmp: Number(c.dmgAmp) || 0,
    dmgRes: Number(c.dmgRes) || 0,
    crippled,
  };
}

/** Every combat thuc a character knows, as resolver choices (deduplicated by id). */
export function knownThucOf(c: AppCharacterLike): ThucChoice[] {
  const pool: AppSkillLike[] = [
    ...Object.values(c.equippedSkills || {}).filter((s): s is AppSkillLike => !!s),
    ...(c.learnedSkills || []),
    ...(c.skills || []),
  ];
  const out: ThucChoice[] = [];
  const seen = new Set<string>();
  for (const s of pool) {
    if (!s) continue;
    const name = (s.Name || s.name || '').trim();
    if (!name) continue;
    if (s.skillType && s.skillType !== 'combat') continue;
    const id = String(s.id || name);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ thucId: id, name, ...(Number.isFinite(Number(s.tier)) ? { tier: Number(s.tier) } : {}) });
  }
  return out;
}

export const THUC_MATCH_THRESHOLD = 0.45;

/** Same padded-trigram Jaccard as ui/composerPayload.fuzzyScore, kept local so this module has no UI dependency. */
export function fuzzyScore(a: string, b: string): number {
  const norm = (s: string) => (s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const trigramsOf = (s: string): Set<string> => {
    const padded = `  ${norm(s)} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    return set;
  };
  const ta = trigramsOf(a);
  const tb = trigramsOf(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Exact name first, then trigram similarity; null when nothing is close enough. */
export function matchThucByName(name: string, known: readonly ThucChoice[]): ThucChoice | null {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  const exact = known.find((t) => t.name.trim().toLowerCase() === n);
  if (exact) return exact;
  let best: { t: ThucChoice; s: number } | null = null;
  for (const t of known) {
    const s = fuzzyScore(t.name, name);
    if (!best || s > best.s) best = { t, s };
  }
  return best && best.s >= THUC_MATCH_THRESHOLD ? best.t : null;
}

/** Present, alive, non-companion NPC whose name matches (exact, then fuzzy). */
export function findOpponent(name: string, characters: readonly AppCharacterLike[], playerLocationId: string | null | undefined): AppCharacterLike | null {
  const present = characters.filter((c) =>
    c && !c.isPlayer && !c.isCompanion && !c.isPermanentlyDead && c.Name &&
    (!c.current_location_id || !playerLocationId || c.current_location_id === playerLocationId));
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  const exact = present.find((c) => (c.Name || '').trim().toLowerCase() === n);
  if (exact) return exact;
  let best: { c: AppCharacterLike; s: number } | null = null;
  for (const c of present) {
    const s = fuzzyScore(c.Name || '', name);
    if (!best || s > best.s) best = { c, s };
  }
  return best && best.s >= THUC_MATCH_THRESHOLD ? best.c : null;
}

// ---------------------------------------------------------------------------
// Battle state (lives on `knowledge.narrativeCombatState`)
// ---------------------------------------------------------------------------

export interface StoryCombatState {
  isActive: boolean;
  combatants: string[];
  exchange_id: number;
  used_thuc: Record<string, string[]>;
  combat_type: 'Lethal' | 'Sparring';
  spar_parity_eligible: boolean;
}

export const IDLE_STORY_COMBAT_STATE: StoryCombatState = {
  isActive: false,
  combatants: [],
  exchange_id: 0,
  used_thuc: {},
  combat_type: 'Lethal',
  spar_parity_eligible: false,
};

export function normalizeStoryCombatState(raw: unknown): StoryCombatState {
  if (!raw || typeof raw !== 'object') return { ...IDLE_STORY_COMBAT_STATE };
  const r = raw as Partial<StoryCombatState>;
  return {
    isActive: r.isActive === true,
    combatants: Array.isArray(r.combatants) ? r.combatants.map(String) : [],
    exchange_id: Number.isInteger(r.exchange_id) ? (r.exchange_id as number) : 0,
    used_thuc: r.used_thuc && typeof r.used_thuc === 'object' ? { ...(r.used_thuc as Record<string, string[]>) } : {},
    combat_type: r.combat_type === 'Sparring' ? 'Sparring' : 'Lethal',
    spar_parity_eligible: r.spar_parity_eligible === true,
  };
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

export interface StoryCombatTurnInput {
  intent: CombatIntent;
  state: StoryCombatState;
  player: AppCharacterLike;
  characters: readonly AppCharacterLike[];
  rng: () => number;
  knobs?: NarrativeCombatKnobs;
  /** Base attack power for (attacker, thuc); default = attacker ATK. */
  powerOf?: (attackerId: string, thuc: ThucChoice) => number;
}

export type HandoffOutcome = 'VICTORY' | 'DEFEAT' | 'FLED';

export interface StoryCombatTurnResult {
  kind: 'started' | 'exchange' | 'ended_by_talk' | 'none';
  state: StoryCombatState;
  opponent: AppCharacterLike | null;
  result: ExchangeResult | null;
  /** Locked-result lines for API-2 ("KẾT QUẢ ĐÃ ĐỊNH"). */
  lines: string[];
  /** System-owned command tags for the existing tag pipeline. */
  commands: string;
  /** Present only on the turn the battle ended with a mechanical verdict. */
  handoff: { outcome: HandoffOutcome; winningSideInfo: AppCharacterLike[]; losingSideInfo: AppCharacterLike[]; combatType: 'Lethal' | 'Sparring' } | null;
  /** Player thuc still unused this battle (for the 4 choices). */
  unusedPlayerThuc: string[];
  /** Vietnamese system messages for the story log. */
  messages: string[];
}

function noTurn(state: StoryCombatState): StoryCombatTurnResult {
  return { kind: 'none', state, opponent: null, result: null, lines: [], commands: '', handoff: null, unusedPlayerThuc: [], messages: [] };
}

export function runStoryCombatTurn(input: StoryCombatTurnInput): StoryCombatTurnResult {
  const knobs = input.knobs ?? DEFAULT_NARRATIVE_COMBAT_KNOBS;
  const { intent, player } = input;
  let state = { ...input.state, used_thuc: { ...input.state.used_thuc } };

  // Resolve the opponent: the active one while a battle runs, else by name.
  let opponent: AppCharacterLike | null = null;
  if (state.isActive) {
    opponent = input.characters.find((c) => c && c.id === state.combatants[0]) || null;
    if (!opponent || opponent.isPermanentlyDead) {
      // Opponent vanished (deleted / died elsewhere): close the battle quietly.
      return { ...noTurn({ ...IDLE_STORY_COMBAT_STATE }), kind: 'ended_by_talk', messages: ['Trận đấu khép lại: đối thủ không còn hiện diện.'] };
    }
  } else {
    if (!intent.is_combat || !(intent.action_type === 'skill' || intent.action_type === 'defend')) return noTurn(state);
    opponent = findOpponent(intent.target_name, input.characters, player.current_location_id);
    if (!opponent) return noTurn(state);
  }

  // Talk that ends the fight: no exchange, no verdict (Core Rule #8b analogue).
  if (state.isActive && intent.action_type === 'talk' && intent.ends_combat) {
    return {
      ...noTurn({ ...IDLE_STORY_COMBAT_STATE }),
      kind: 'ended_by_talk',
      opponent,
      lines: [`Hai bên ngừng tay: trận đấu với ${opponent.Name} khép lại không phân thắng bại.`],
      messages: [`Trận đấu với ${opponent.Name} kết thúc: hai bên ngừng tay.`],
    };
  }

  const messages: string[] = [];
  let kind: StoryCombatTurnResult['kind'] = 'exchange';
  const A = combatantFromCharacter(player);
  const B = combatantFromCharacter(opponent);

  if (!state.isActive) {
    const combatType: 'Lethal' | 'Sparring' = intent.lethal ? 'Lethal' : 'Sparring';
    state = {
      isActive: true,
      combatants: [opponent.id],
      exchange_id: 0,
      used_thuc: {},
      combat_type: combatType,
      spar_parity_eligible: sparParityEligible(A, B, combatType === 'Sparring', knobs),
    };
    kind = 'started';
    messages.push(`${combatType === 'Sparring' ? 'Tỉ thí giao hữu' : 'Giao chiến'} với ${opponent.Name} bắt đầu. Kết quả từng pha do công thức Lực chiến quyết định.`);
  }

  // Player action.
  const playerKnown = knownThucOf(player);
  const playerUsed = new Set(state.used_thuc[player.id] || []);
  let playerAction: ActorAction;
  const actionType: IntentAction = state.isActive && intent.action_type === 'none' ? 'skill' : intent.action_type;
  if (actionType === 'flee') playerAction = { type: 'flee' };
  else if (actionType === 'defend' || actionType === 'talk') playerAction = { type: 'defend' };
  else {
    const matched = matchThucByName(intent.skill_name, playerKnown);
    const thuc = matched && !playerUsed.has(matched.thucId) ? matched : BASIC_ATTACK;
    if (matched && playerUsed.has(matched.thucId)) {
      messages.push(`Thức "${matched.name}" đã dùng trong trận này, lượt này tính là Đánh thường.`);
    }
    playerAction = { type: 'skill', thuc };
  }

  // NPC action (Core Rule #2, D.14) - never the AI's.
  const npcAction = chooseNpcAction({
    npc: B,
    known: knownThucOf(opponent),
    usedThucIds: state.used_thuc[opponent.id] || [],
    is_spar_friendly: state.combat_type === 'Sparring',
    rng: input.rng,
    knobs,
  });

  const exchangeId = state.exchange_id + 1;
  const powerOf = input.powerOf;
  const result = resolveExchange({
    exchange_id: exchangeId,
    A,
    B,
    actions: { A: playerAction, B: npcAction },
    player: 'A',
    is_spar_friendly: state.combat_type === 'Sparring',
    spar_parity_eligible: state.spar_parity_eligible,
    rng: input.rng,
    knobs,
    ...(powerOf ? { powerOf: (attacker: CombatantStats, thuc: ThucChoice) => powerOf(attacker.id, thuc) } : {}),
  });

  // Bookkeeping: exchange counter + no-repeat lists.
  state.exchange_id = exchangeId;
  const noteUsed = (id: string, action: ActorAction) => {
    if (action.type !== 'skill' || !action.thuc || action.thuc.thucId === BASIC_ATTACK.thucId) return;
    state.used_thuc[id] = [...(state.used_thuc[id] || []), action.thuc.thucId];
  };
  noteUsed(player.id, playerAction);
  if (result.per_actor.B.executed) noteUsed(opponent.id, npcAction);

  // System commands: HP deltas (damage + drain), NPC death when lethal.
  const cmds: string[] = [];
  const hpDelta = (who: AppCharacterLike, before: number, after: number) => {
    const d = Math.max(0, before - after);
    if (d > 0) cmds.push(`[CHARACTER_UPDATE: Name="${who.Name}", Stats="hp:-${d}"]`);
  };
  hpDelta(player, A.hp, result.per_actor.A.hp_after);
  hpDelta(opponent, B.hp, result.per_actor.B.hp_after);

  let handoff: StoryCombatTurnResult['handoff'] = null;
  const lethal = state.combat_type === 'Lethal';
  // Hand-off sides carry POST-exchange HP: Death & Consequence reads
  // `per_actor[id].hp_after` from these records (combatAdapter A5), and the
  // HP tags above have not been applied yet at this point of the turn.
  const playerAfter: AppCharacterLike = { ...player, hp: result.per_actor.A.hp_after };
  const opponentAfter: AppCharacterLike = { ...opponent, hp: result.per_actor.B.hp_after };
  if (!result.battle_active) {
    const o = result.outcome;
    if (result.flee && result.flee.success) {
      if (result.flee.actor === 'A') {
        handoff = { outcome: 'FLED', winningSideInfo: [opponentAfter], losingSideInfo: [playerAfter], combatType: state.combat_type };
        messages.push(`Ngươi thoát khỏi trận đấu với ${opponent.Name}.`);
      } else {
        messages.push(`${opponent.Name} bỏ chạy khỏi trận đấu.`);
      }
    } else if (o && o.type === 'win') {
      handoff = { outcome: 'VICTORY', winningSideInfo: [playerAfter], losingSideInfo: [opponentAfter], combatType: state.combat_type };
      if (lethal && result.per_actor.B.hp_after <= 0) cmds.push(`[CHARACTER_DEATH: Name="${opponent.Name}"]`);
      messages.push(`Ngươi thắng ${opponent.Name}${lethal ? ' — kẻ địch gục ngã' : ' trong trận giao hữu'}.`);
    } else if (o && o.type === 'lose') {
      handoff = { outcome: 'DEFEAT', winningSideInfo: [opponentAfter], losingSideInfo: [playerAfter], combatType: state.combat_type };
      messages.push(`Ngươi thua ${opponent.Name}${lethal ? '. Số phận do luật Sinh Tử định đoạt.' : ' trong trận giao hữu.'}`);
    } else {
      messages.push(`Trận đấu với ${opponent.Name} kết thúc bất phân thắng bại.`);
    }
    state = { ...IDLE_STORY_COMBAT_STATE };
  }

  const usedNow = new Set(state.isActive ? state.used_thuc[player.id] || [] : []);
  const unusedPlayerThuc = state.isActive ? playerKnown.filter((t) => !usedNow.has(t.thucId)).map((t) => t.name) : [];

  return {
    kind,
    state,
    opponent,
    result,
    lines: describeExchange(result, { A, B }),
    commands: cmds.join('\n'),
    handoff,
    unusedPlayerThuc,
    messages,
  };
}

// ---------------------------------------------------------------------------
// API-2 prompt block (Pillar 4)
// ---------------------------------------------------------------------------

export const STORY_COMBAT_PROMPT_HEADER = '--- CHIẾN ĐẤU TƯỜNG THUẬT: KẾT QUẢ ĐÃ KHÓA (PILLAR 3 + PILLAR 4) ---';

export function buildStoryCombatPromptBlock(turn: StoryCombatTurnResult): string {
  if (turn.kind === 'none') return '';
  const facts = turn.lines.map((l) => `  * ${l}`).join('\n');
  const battleOn = turn.state.isActive;
  const thucList = turn.unusedPlayerThuc.length
    ? turn.unusedPlayerThuc.map((n) => `"${n}"`).join(', ')
    : '(không còn thức nào chưa dùng — chỉ còn Đánh thường)';
  const choices = battleOn
    ? `4 lựa chọn cuối PHẢI là hành động cho pha kế tiếp, mỗi lựa chọn một kiểu: (1) ra đòn bằng MỘT thức CHƯA dùng, gọi đúng tên trong ${thucList}; (2) một thức chưa dùng khác hoặc Đánh thường; (3) Phòng thủ; (4) Bỏ chạy hoặc Nói chuyện/xin hàng. Không đề xuất thức đã dùng trong trận.`
    : 'Trận đã kết thúc: 4 lựa chọn cuối là hành động SAU trận (kiểm tra thương thế, lục soát, rời đi, nói chuyện...), không phải đòn đánh mới.';
  return [
    STORY_COMBAT_PROMPT_HEADER,
    'Pha giao đấu này đã được HỆ THỐNG tính xong bằng công thức Lực chiến. Các dòng dưới đây là SỰ THẬT DUY NHẤT của pha; ngươi chỉ kể lại, không thay đổi:',
    facts,
    'QUY TẮC KỂ (Tường Thuật Sống Động):',
    '  1. Gọi ĐÚNG TÊN từng thức đã dùng, đúng thứ tự ra đòn, đúng trúng/hụt/chí mạng như trên. Không thêm đòn nào không có trong danh sách, không bỏ sót đòn nào.',
    '  2. Không viết số HP hay số sát thương vào văn kể; thể hiện mức thương thế bằng hình ảnh (thở dốc, máu rỉ, lảo đảo, đứng vững...) đúng với trạng thái đã cho.',
    '  3. Ai gục thì gục, ai đứng thì đứng: không cho nhân vật nào chết, ngất, bị thương nặng hơn hay hồi phục ngoài kết quả trên. Trận CHƯA kết thúc thì không được kể như đã kết thúc, và ngược lại.',
    '  4. NPC đối thủ hành xử theo lợi ích và thực lực của họ (Thế Giới Khách Quan): không tự nhiên nương tay, không khiếp sợ vô cớ, không tâng bốc người chơi.',
    '  5. Không xuất bất kỳ thẻ lệnh nào: HP, sinh tử, phần thưởng đã do hệ thống xử lý.',
    `  6. ${choices}`,
  ].join('\n');
}

/** STORY-mode rule block replacing the old "AI is the sole referee" text. */
export const STORY_MODE_COMBAT_RULES = [
  '// B. HỆ THỐNG CHIẾN ĐẤU TƯỜNG THUẬT (NARRATIVE COMBAT — Pillar 3 "Sức Mạnh Có Logic"):',
  '//    1. NGUYÊN TẮC: KẾT QUẢ mọi đòn đánh, sát thương, thắng thua, sống chết do HỆ THỐNG tính bằng công thức Lực chiến (Chỉ số + Kỹ năng + Trang bị, áp chế cảnh giới), KHÔNG phải do ngươi. Ngươi không còn là trọng tài.',
  '//    2. Khi người chơi ra tay với một NPC đang hiện diện, hệ thống tự mở trận và tính từng pha giao đấu mỗi lượt. Kết quả đã khóa được đưa cho ngươi ở khối "CHIẾN ĐẤU TƯỜNG THUẬT: KẾT QUẢ ĐÃ KHÓA" — ngươi CHỈ tường thuật lại đúng như vậy (Pillar 4: gọi đúng tên thức, đúng trúng/hụt, không số liệu).',
  '//    3. Trong trận: KHÔNG tự xuất [CHARACTER_UPDATE ... hp], [CHARACTER_DEATH], [HEAL_PARTICIPANTS]. Không tự cho ai chết, ngất hay hồi phục. Không kể trước pha kế tiếp.',
  '//    4. NPC đối thủ chọn thức theo logic của hệ thống; ngươi không quyết định họ đánh gì.',
  '//    5. Ngoài trận (chưa có đối thủ hiện diện, hoặc hai bên đã ngừng tay), tường thuật bình thường như mọi lượt khác.',
].join('\n');
