/**
 * Golden narration runner - scores captured API-2 turns against the
 * narration lint and writes an ADVISORY evidence report. See
 * tests/golden/narration/README.md for the scenario playbook.
 *
 * This is NOT a pass/fail unit test (coding-standards.md: LLM output is
 * non-deterministic by construction). It is skipped unless a capture file
 * exists, and it only fails when GOLDEN_STRICT=1 is set on purpose.
 *
 * Modes
 *   lint   (default) re-lint every capture with the CURRENT gameConfig knobs.
 *   replay (GOLDEN_REPLAY=N) additionally re-send each captured prompt to
 *          Gemini N times and lint every response, to measure variance.
 *          Needs GEMINI_API_KEY (or the first key of
 *          VITE_GEMINI_API_KEY_FALLBACKS). Never runs in `npm test`.
 *
 * Env
 *   GOLDEN_CAPTURE  path to the exported JSON (default: captures/latest.json)
 *   GOLDEN_REPLAY   integer; 0/unset = lint only
 *   GOLDEN_MODEL    model id for replay (default: first ladder rung)
 *   GOLDEN_STRICT   "1" = fail the run when any violation remains
 *   GOLDEN_LABEL    free text stamped on the report (e.g. "before-step1")
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../../gameConfig.js';
import { GEMINI_TEXT_MODEL_FALLBACKS, SAFETY_SETTINGS_BLOCK_NONE } from '../../../src-web/systems/ai/config';
import {
  lintNarration,
  narrationLintKnobsFromGameConfig,
  type LintViolationKind,
  type NarrationLintReport,
} from '../../../src-web/systems/contract/narrationLint';
import { parseGoldenCaptureDocument, type GoldenCapture } from '../../../src-web/systems/contract/goldenCapture';

const HERE = __dirname;
const CAPTURE_PATH = resolve(HERE, process.env.GOLDEN_CAPTURE || 'captures/latest.json');
const REPORT_DIR = resolve(HERE, '../../../production/qa/evidence/narration-golden');
const REPLAY_N = Math.max(0, parseInt(process.env.GOLDEN_REPLAY || '0', 10) || 0);
const STRICT = process.env.GOLDEN_STRICT === '1';
const LABEL = (process.env.GOLDEN_LABEL || '').trim();
const KINDS: LintViolationKind[] = ['objective_praise', 'ungrounded_praise', 'superior_overpraise', 'repeated_line'];

const hasCapture = existsSync(CAPTURE_PATH);

// ---------------------------------------------------------------------------
// Replay (optional)
// ---------------------------------------------------------------------------

function apiKeyFromEnv(): string | null {
  const direct = (process.env.GEMINI_API_KEY || '').trim();
  if (direct) return direct;
  const list = (process.env.VITE_GEMINI_API_KEY_FALLBACKS || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return list[0] || null;
}

async function generate(model: string, key: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('empty candidate');
  return text;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface ScenarioRow {
  scenario_id: string;
  turn: number;
  source: 'capture' | 'replay';
  report: NarrationLintReport;
  /** "retried, kept second (1 → 0)" or "-" for replays / no guard data. */
  guard: string;
}

function guardLabel(c: GoldenCapture): string {
  const g = c.guard;
  if (!g) return '-';
  if (!g.retried) return `no retry (${g.first_triggering})`;
  return `retried, kept ${g.kept} (${g.first_triggering} → ${g.second_triggering})`;
}

function sum(rows: ScenarioRow[], kind: LintViolationKind): number {
  return rows.reduce((acc, r) => acc + r.report.counts[kind], 0);
}

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${Math.round((n / d) * 100)}%`;
}

function renderReport(rows: ScenarioRow[], captures: GoldenCapture[], model: string | null): string {
  const clean = rows.filter((r) => r.report.violations.length === 0).length;
  const lines: string[] = [];
  lines.push(`# Narration golden report${LABEL ? ` - ${LABEL}` : ''}`);
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Capture file: ${CAPTURE_PATH}`);
  lines.push(`- Captures: ${captures.length}; replay per capture: ${REPLAY_N}${model ? ` (${model})` : ''}`);
  lines.push(`- Responses scored: ${rows.length}; clean: ${clean} (${pct(clean, rows.length)})`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('| Kind | Count | Per response |');
  lines.push('|---|---|---|');
  for (const k of KINDS) {
    const n = sum(rows, k);
    lines.push(`| ${k} | ${n} | ${rows.length ? (n / rows.length).toFixed(2) : '-'} |`);
  }
  lines.push('');
  lines.push('## Per scenario');
  lines.push('');
  lines.push('| Scenario | Turn | Source | Guard | objective | ungrounded | superior | repeated | Manual: NPC self-interest | Manual: praise grounded | Manual: fresh lines | Signed |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const c = r.report.counts;
    lines.push(
      `| ${r.scenario_id} | ${r.turn} | ${r.source} | ${r.guard} | ${c.objective_praise} | ${c.ungrounded_praise} | ${c.superior_overpraise} | ${c.repeated_line} |  |  |  |  |`,
    );
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  for (const r of rows) {
    if (!r.report.violations.length) continue;
    lines.push(`### ${r.scenario_id} (turn ${r.turn}, ${r.source})`);
    for (const v of r.report.violations) {
      const who = v.speaker ? ` [${v.speaker}]` : '';
      const sim = v.similarity !== undefined ? ` (sim ${v.similarity})` : '';
      lines.push(`- **${v.kind}**${who}${sim}: "${v.excerpt.replace(/\n/g, ' ')}" ~ "${v.matched.replace(/\n/g, ' ')}"`);
    }
    lines.push('');
  }
  lines.push('Manual columns are filled by the reviewing lead (Đạt / Không) per README rubric.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

describe.skipIf(!hasCapture)('narration golden set', () => {
  it('scores every capture and writes the evidence report', async () => {
    const doc = parseGoldenCaptureDocument(readFileSync(CAPTURE_PATH, 'utf8'));
    const knobs = narrationLintKnobsFromGameConfig(GAME_CONFIG as Record<string, unknown>);
    const rows: ScenarioRow[] = [];

    for (const c of doc.captures) {
      rows.push({ scenario_id: c.scenario_id, turn: c.turn, source: 'capture', guard: guardLabel(c), report: lintNarration(c.response, c.context, knobs) });
    }

    let model: string | null = null;
    if (REPLAY_N > 0) {
      const key = apiKeyFromEnv();
      if (!key) throw new Error('GOLDEN_REPLAY set but no GEMINI_API_KEY / VITE_GEMINI_API_KEY_FALLBACKS in env');
      model = (process.env.GOLDEN_MODEL || '').trim() || GEMINI_TEXT_MODEL_FALLBACKS[0];
      for (const c of doc.captures) {
        for (let i = 0; i < REPLAY_N; i++) {
          try {
            const text = await generate(model, key, c.prompt);
            rows.push({ scenario_id: c.scenario_id, turn: c.turn, source: 'replay', guard: '-', report: lintNarration(text, c.context, knobs) });
          } catch (err) {
            // A failed call is recorded as a row with no dialogue so the totals stay honest.
            console.warn(`[golden] ${c.scenario_id} replay ${i + 1}/${REPLAY_N} failed:`, (err as Error).message);
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    mkdirSync(REPORT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = resolve(REPORT_DIR, `${stamp}${LABEL ? '-' + LABEL.replace(/[^\w-]+/g, '_') : ''}.md`);
    writeFileSync(file, renderReport(rows, doc.captures, model), 'utf8');
    console.log(`[golden] report written: ${file}`);

    expect(rows.length).toBeGreaterThan(0);
    if (STRICT) {
      const total = KINDS.reduce((acc, k) => acc + sum(rows, k), 0);
      expect(total, 'GOLDEN_STRICT: violations remain, see report').toBe(0);
    }
  }, 30 * 60 * 1000);
});
