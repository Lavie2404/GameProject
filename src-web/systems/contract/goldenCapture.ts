/**
 * Golden narration capture - records real API-2 turns (prompt, response,
 * lint context, lint report) so the golden scenario set in
 * tests/golden/narration/README.md can be scored offline and replayed.
 *
 * WHY CAPTURE INSTEAD OF REBUILDING THE PROMPT
 * The narration prompt is assembled inside App.tsx (a 36k-line React module
 * that unit tests cannot import). Rebuilding it in a test would drift from
 * the real thing within a week. Capturing the exact bytes the model saw is
 * the only honest baseline, and re-capturing after a prompt change is how a
 * fix gets measured.
 *
 * Storage is injected (`StorageLike`), so the store is unit-testable and the
 * browser wiring in App.tsx is two lines. Everything here is best-effort:
 * a full localStorage never fails a turn.
 *
 * Pure module: no React, no I/O beyond the injected storage.
 */

import type { LintContext, NarrationLintReport } from './narrationLint';
import type { GuardTrace } from './narrationGuard';

export const GOLDEN_CAPTURE_SCHEMA = 1;
/** localStorage flag: set to "1" to record turns. */
export const GOLDEN_CAPTURE_FLAG_KEY = 'golden_capture';
/** localStorage: free-text scenario id stamped onto each capture (e.g. "S03"). */
export const GOLDEN_SCENARIO_ID_KEY = 'golden_scenario_id';
/** localStorage: the persisted capture array. */
export const GOLDEN_CAPTURES_KEY = 'golden_captures';

export interface GoldenCaptureContext extends LintContext {
  action: string;
  locked_summary: string;
  location?: string;
}

export interface GoldenCapture {
  schema: typeof GOLDEN_CAPTURE_SCHEMA;
  captured_at: string;
  scenario_id: string;
  turn: number;
  context: GoldenCaptureContext;
  prompt: string;
  /** The response the game KEPT (after the cure step, when it ran). */
  response: string;
  lint: NarrationLintReport;
  /** What the narration guard did this turn; absent when it did not run. */
  guard?: GuardTrace;
}

export interface GoldenCaptureInput {
  scenario_id?: string | null;
  turn?: number | null;
  context: GoldenCaptureContext;
  prompt: string;
  response: string;
  lint: NarrationLintReport;
  guard?: GuardTrace;
  /** Injected so tests are deterministic. */
  now: () => string;
}

export function buildGoldenCapture(input: GoldenCaptureInput): GoldenCapture {
  return {
    schema: GOLDEN_CAPTURE_SCHEMA,
    captured_at: input.now(),
    scenario_id: (input.scenario_id || '').trim() || 'unlabelled',
    turn: Number.isFinite(input.turn) ? (input.turn as number) : 0,
    context: input.context,
    prompt: input.prompt,
    response: input.response,
    lint: input.lint,
    ...(input.guard ? { guard: input.guard } : {}),
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GoldenCaptureStore {
  enabled(): boolean;
  scenarioId(): string | null;
  /** Appends when enabled; returns whether it was stored. */
  record(input: Omit<GoldenCaptureInput, 'now' | 'scenario_id'>): boolean;
  list(): GoldenCapture[];
  clear(): void;
  /** The JSON document `tests/golden/narration` consumes. */
  exportJson(): string;
}

export interface GoldenCaptureStoreOptions {
  storage: StorageLike | null | undefined;
  now: () => string;
  /** Oldest captures are dropped past this. Prompts are ~50 KB each. */
  maxCaptures?: number;
}

export function createGoldenCaptureStore(opts: GoldenCaptureStoreOptions): GoldenCaptureStore {
  const max = opts.maxCaptures ?? 40;
  const storage = opts.storage;
  // In-memory mirror: survives a localStorage quota failure within the session.
  let memory: GoldenCapture[] | null = null;

  const read = (): GoldenCapture[] => {
    if (memory) return memory;
    try {
      const raw = storage ? storage.getItem(GOLDEN_CAPTURES_KEY) : null;
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      memory = Array.isArray(parsed) ? (parsed as GoldenCapture[]) : [];
    } catch {
      memory = [];
    }
    return memory;
  };

  const write = (list: GoldenCapture[]) => {
    memory = list;
    if (!storage) return;
    try {
      storage.setItem(GOLDEN_CAPTURES_KEY, JSON.stringify(list));
    } catch {
      // Quota or private mode: the in-memory copy still serves exportJson().
    }
  };

  return {
    enabled() {
      try {
        return !!storage && storage.getItem(GOLDEN_CAPTURE_FLAG_KEY) === '1';
      } catch {
        return false;
      }
    },
    scenarioId() {
      try {
        return storage ? storage.getItem(GOLDEN_SCENARIO_ID_KEY) : null;
      } catch {
        return null;
      }
    },
    record(input) {
      if (!this.enabled()) return false;
      const capture = buildGoldenCapture({ ...input, scenario_id: this.scenarioId(), now: opts.now });
      const next = [...read(), capture].slice(-max);
      write(next);
      return true;
    },
    list() {
      return [...read()];
    },
    clear() {
      memory = [];
      if (!storage) return;
      try {
        storage.removeItem(GOLDEN_CAPTURES_KEY);
      } catch {
        // ignore
      }
    },
    exportJson() {
      return JSON.stringify({ schema: GOLDEN_CAPTURE_SCHEMA, exported_at: opts.now(), captures: read() }, null, 2);
    },
  };
}

/** Shape of the exported document (also what the golden runner reads). */
export interface GoldenCaptureDocument {
  schema: number;
  exported_at: string;
  captures: GoldenCapture[];
}

export function parseGoldenCaptureDocument(json: string): GoldenCaptureDocument {
  const doc = JSON.parse(json) as Partial<GoldenCaptureDocument>;
  if (!doc || doc.schema !== GOLDEN_CAPTURE_SCHEMA || !Array.isArray(doc.captures)) {
    throw new Error('Not a golden capture document (schema ' + GOLDEN_CAPTURE_SCHEMA + ' expected)');
  }
  return doc as GoldenCaptureDocument;
}
