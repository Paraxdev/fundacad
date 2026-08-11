import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// Two suites, separated by filename so they can't blur together:
//   tests/**/*.test.ts -> "logic": node, no DOM. The geometry/solver tests are the
//                         load-bearing ones and have no business paying for a DOM.
//   tests/**/*.spec.ts -> "components": Vue SFCs under happy-dom.
//
// happy-dom implements no layout: offsetWidth is 0 and getBoundingClientRect()
// returns zeros, so measurement-driven code (ribbon overflow, context-menu flip,
// timeline gapIndexAt, dimension-label projection) is e2e territory, not this.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "logic",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          globals: false,
        },
      },
      {
        plugins: [vue()],
        test: {
          name: "components",
          include: ["tests/**/*.spec.ts"],
          environment: "happy-dom",
          globals: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/document/**", "src/sketch/**", "src/geometry/**", "src/io/**"],
      reporter: ["text-summary"],
    },
  },
});
