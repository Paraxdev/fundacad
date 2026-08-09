import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// Two suites, deliberately separated by FILENAME so they can't blur together:
//
//   *.test.ts  -> "logic": headless, node environment, no DOM, no jsdom. This is
//                 the original suite and its policy is unchanged — the note in
//                 src/ui/browserTree.test.ts about there being no jsdom here
//                 stays literally true for every *.test.ts file.
//   *.spec.ts  -> "components": Vue SFCs under happy-dom + @vue/test-utils.
//
// Why the split rather than one DOM-enabled suite: the geometry/solver tests are
// the load-bearing ones and they have no business paying for a DOM, or being
// able to accidentally depend on one.
//
// Be honest about what the component suite can cover: happy-dom implements no
// layout, so offsetWidth is 0 and getBoundingClientRect() returns all zeros.
// The measurement-driven code (ribbon overflow reflow, context-menu flip math,
// timeline gapIndexAt, dimension-label projection) is NOT testable here and
// stays e2e/manual territory. What this suite is for is render output as a
// function of state — which is exactly what catches a computed that stopped
// propagating.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "logic",
          include: ["src/**/*.test.ts"],
          environment: "node",
          globals: false,
        },
      },
      {
        plugins: [vue()],
        test: {
          name: "components",
          include: ["src/**/*.spec.ts"],
          environment: "happy-dom",
          globals: false,
        },
      },
    ],
    coverage: {
      // scope the report to the core-logic dirs (loop target #15). The large
      // interactive-UI / Tauri / ws files (sketchMode, overlay, client, files)
      // are e2e territory, not unit-testable, so they stay out of the denominator.
      provider: "v8",
      include: ["src/document/**", "src/sketch/**", "src/geometry/**", "src/io/**"],
      reporter: ["text-summary"],
    },
  },
});
