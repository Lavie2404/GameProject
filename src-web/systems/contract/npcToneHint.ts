/**
 * NPC tone hint - one data-driven line per present NPC telling the narrator
 * how warmly THIS NPC may speak to the protagonist, derived from the numbers
 * the game already tracks (affinity band, level gap) instead of the general
 * Pillar-1 rule alone.
 *
 * Design docs: design/gdd/game-concept.md "Pillar 1" (243-255):
 *   "NPC có hảo cảm vẫn được bộc lộ tình cảm ... nhưng lời khen phải ... TỶ LỆ
 *    với chênh lệch thực lực thật" (DIRECTIVE_P1_GROUNDED_PRAISE);
 * gdd-03 1.3 / AC-37b: the prompt receives the ATTITUDE BAND NAME, never the
 * raw affinity integer - this module honours that by construction.
 *
 * WHY
 * A rule that says "scale praise with the real power gap" leaves the model to
 * compute the gap from a wall of stats. Stating the conclusion next to the
 * NPC's name ("cao hơn 4 cảnh giới → khen dè dặt kiểu bề trên") is a fact the
 * model can copy, not a rule it has to apply.
 *
 * Pure module: no React, no I/O, no RNG.
 */

import { attitudeBand } from '../affinity/bands';
import type { AttitudeBand } from '../types';
import type { NarrationLintKnobs } from './narrationLint';

export interface ToneNpcLike {
  level?: number | null;
  affinity?: number | null;
}

/**
 * Signed whole tiers between NPC and player: +2 = NPC two tiers above,
 * -1 = one tier below, 0 = within a tier. `null` when either level is unknown.
 */
export function powerGapTiers(npcLevel: unknown, playerLevel: unknown, tierSize: number): number | null {
  const a = Number(npcLevel);
  const b = Number(playerLevel);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  const size = Math.max(1, Math.floor(tierSize));
  const gap = a - b;
  const tiers = Math.floor(Math.abs(gap) / size);
  if (tiers === 0) return 0; // never -0
  return gap < 0 ? -tiers : tiers;
}

function gapPhrase(tiers: number | null): string {
  if (tiers === null) return 'chưa rõ thực lực → không khen năng lực tổng quát';
  if (tiers >= 1) {
    return `cao hơn ${tiers} cảnh giới → khen dè dặt kiểu bề trên ("có chút tư chất", "không tệ"), không coi ngang hàng`;
  }
  if (tiers <= -1) {
    return `thấp hơn ${-tiers} cảnh giới → được ngưỡng mộ, nhưng chỉ vào việc cụ thể vừa thấy`;
  }
  return 'ngang tầm → khen như với đối thủ ngang hàng, phải có căn cứ';
}

const AFFECTION_PHRASE: Record<AttitudeBand, string> = {
  'Tri kỷ': 'tình cảm bộc lộ tự nhiên (lo lắng, bao dung, bênh vực) — yêu không có nghĩa là mù, không đánh giá sai thực lực',
  'Thân thiết': 'thân tình, quan tâm — không nịnh, không đánh giá sai thực lực',
  'Thiện cảm': 'thiện chí nhẹ — không khen trừ khi có việc cụ thể đáng khen',
  'Trung lập': 'lịch sự hoặc dửng dưng — không khen trừ khi có lý do',
  'Lạnh nhạt': 'dè dặt, xa cách — không khen',
  'Thù địch': 'không khen; phản ứng theo thù địch, không bỗng nhiên khiếp sợ hay quy phục',
  'Thù địch sâu sắc': 'không khen; thù hằn công khai, không bỗng nhiên khiếp sợ hay quy phục',
};

/**
 * The suffix appended to an NPC's line in the prompt's NPC list, e.g.
 * ` [Giọng với nhân vật chính: Thân thiết · cao hơn 4 cảnh giới → ... · thân tình, ...]`.
 * Never contains the affinity integer (gdd-03 AC-37b).
 */
export function npcToneHint(
  npc: ToneNpcLike | null | undefined,
  playerLevel: unknown,
  knobs: Pick<NarrationLintKnobs, 'SUPERIOR_NPC_LEVEL_GAP'>,
): string {
  const affinity = Number.isFinite(Number(npc?.affinity)) ? Number(npc?.affinity) : 0;
  const band = attitudeBand(affinity);
  const tiers = powerGapTiers(npc?.level, playerLevel, knobs.SUPERIOR_NPC_LEVEL_GAP);
  return ` [Giọng với nhân vật chính: ${band} · ${gapPhrase(tiers)} · ${AFFECTION_PHRASE[band]}]`;
}
