import { defineConfig } from 'vitest/config';

// Unit tests live in tests/unit/<system>/ and exercise the pure TS modules
// under src-web/systems/. App.tsx (the React monolith) is intentionally not
// imported by unit tests — see production/gdd-integration/plan.md.
export default defineConfig({
  test: {
    // Two patterns on purpose: `*.test.ts` is the repo's existing convention, and
    // `*_test.ts` is the naming the GDD acceptance criteria mandate
    // (`[system]_[feature]_test.*`, coding-standards.md "Automated Test Rules").
    // `tests/golden/**/*_golden.ts` are ADVISORY LLM-output scorers; they skip
    // themselves unless a capture file exists (tests/golden/narration/README.md).
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*_test.ts', 'tests/golden/**/*_golden.ts'],
    environment: 'node',
  },
});
