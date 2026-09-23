# Narration golden set

Behavioral measurement for **Pillar 1 (Thế Giới Khách Quan)** and **NPC line
repetition** in the API-2 narration. This is the "AI-Generated Content"
evidence layer proposed in the qa-lead memory (2026-08-01): a fixed scenario
set scored by a rubric, re-run whenever the prompt or the model changes.
ADVISORY, not a CI gate.

Two halves:

- **Automated**: `src-web/systems/contract/narrationLint.ts` scores each
  response (narrator-voice superiority claims, generic praise in NPC
  dialogue, praise from a much stronger NPC, repeated lines). Knobs live in
  `gameConfig.js` block 22 `narrationLint`.
- **Manual**: three rubric columns a reviewing lead fills in on the report.

## Files

| Path | Role |
|---|---|
| `tests/golden/narration/README.md` | this playbook |
| `tests/golden/narration/narration_golden.ts` | runner (vitest, skipped without a capture file) |
| `tests/golden/narration/captures/latest.json` | exported captures (gitignored, large) |
| `production/qa/evidence/narration-golden/*.md` | generated reports (kept) |

## How to capture a baseline

1. `npm run dev`, open the game, load the save you use for golden runs
   (keep ONE save for this; the scenarios assume its cast, see below).
2. In the browser console:
   ```js
   localStorage.setItem('golden_capture', '1');
   localStorage.setItem('golden_scenario_id', 'S01');
   ```
3. Play the scenario's action. Every API-2 turn is captured while the flag
   is on. Change `golden_scenario_id` before each scenario.
4. When done:
   ```js
   exportGoldenCaptures();            // downloads golden-captures-<date>.json
   localStorage.removeItem('golden_capture');
   ```
5. Save the file as `tests/golden/narration/captures/latest.json`.
6. Score it:
   ```powershell
   $env:GOLDEN_LABEL = 'baseline'; npm run golden:lint
   ```
   The report path is printed. Fill in the manual columns.

To measure variance of the exact same prompts (costs API calls):

```powershell
$env:GEMINI_API_KEY = '<key>'; $env:GOLDEN_REPLAY = '3'; $env:GOLDEN_LABEL = 'baseline-replay'
npm run golden:replay
```

After a prompt change, **re-capture** (the prompt bytes changed, so replaying
the old capture would measure the old prompt) with a new label, e.g.
`after-step1`, and compare the two reports.

The dev console also prints `[narration-lint]` warnings on every turn,
capture flag or not, so ordinary play surfaces the same findings.

## Scenario set (12)

All scenarios use the same save. Cast assumed: the player at roughly Cấp
10-15; one companion with affinity ≥ 80 ("Tri kỷ"); one neutral elder or
sect master ≥ 30 levels above the player; one merchant; one hostile NPC
near the player's level; one canon character if the save is fan-fiction.
Adjust names to your save; the scenario ids stay.

| Id | Situation | Action to type (verbatim, adapt names) | What Pillar 1 predicts |
|---|---|---|---|
| S01 | Stranger, similar level, first meeting | `Tiến lại chào hỏi người lạ đang đứng bên đường và hỏi đường tới trấn gần nhất.` | Polite or indifferent. No praise, no "để mắt tới". |
| S02 | Elder ≥30 levels up, player challenges | `Lớn tiếng thách thức trưởng lão tỉ thí một trận.` | Low probability locked by API-1; narration: ignored, dismissed, or a subordinate steps in. No admiration. |
| S03 | Same elder, affinity Thân thiết, player demonstrates a technique | `Thi triển bộ pháp vừa học trước mặt trưởng lão và xin chỉ điểm.` | Praise, if any, is reserved and points at the concrete move ("có chút nền tảng"). No "kỳ tài". |
| S04 | Companion Tri kỷ, right after a small won fight | (finish any easy fight, then) `Quay sang nhìn nàng.` | Personality-driven reaction (checks wounds, relief, scolding). No cheer-and-recap, no "thiên tài". |
| S05 | Same companion, the same greeting three turns in a row | `Hỏi nàng hôm nay thế nào.` ×3 | Three different lines. `repeated_line` should stay 0. |
| S06 | Merchant, player asks for a discount with no leverage | `Xin chủ tiệm bớt nửa giá vì thấy có duyên.` | Merchant refuses or haggles for a reason. No selling at a loss. |
| S07 | Visible failure in front of the companion | (pick an action API-1 will score as failure, e.g. attack far above level) | Companion reacts to the failure honestly. No praise. |
| S08 | Canon character, first meeting (fan-fiction saves only) | `Tự giới thiệu với <nhân vật nguyên tác>.` | They keep their own agenda. Not a mentor, protector, admirer or nemesis on sight. |
| S09 | Hostile NPC near player level, player threatens | `Đe dọa hắn: cút ngay nếu không muốn chết.` | Hostile holds position or escalates. No sudden fear or submission. |
| S10 | Weaker NPC watches the player win | (win a fight in front of a low-level NPC) | Admiration allowed but tied to the specific thing seen. No generic superlatives. |
| S11 | A long 'dai' turn (API-1 tags it) | any action producing a 1500+ word narration | Count narrator-voice `objective_praise` over a long text. |
| S12 | Ten consecutive turns with the same party | play 10 turns of ordinary travel with the companion | Global repetition check across the whole window. |

## Rubric (manual columns)

| Column | Đạt when |
|---|---|
| NPC self-interest | every NPC decision in the turn is explainable by that NPC's interest, personality or power, not by what makes the protagonist look good |
| Praise grounded | every compliment names a concrete thing the player just did or has, and its warmth matches the real power gap |
| Fresh lines | no NPC line is a re-phrasing of one it already said in this session |

The reviewing lead signs each row. Two rounds are compared side by side
(baseline vs. after each fix step); the goal is a falling total per kind
and a rising clean percentage, not a perfect zero.

## Why the lint is shallow on purpose

Phrase lists catch the exact wording the prompt directives already ban and
nothing subtler; the similarity check catches re-used wording, not re-used
meaning. Anything the lint misses is what the manual columns exist for.
Widen the lists in `gameConfig.js` when a new pattern shows up in reports;
do not add rules to the prompt to chase it.
