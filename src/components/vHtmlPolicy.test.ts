// v-html is the one way to reintroduce the XSS surface this migration exists to
// remove. The app runs in a privileged Tauri webview, and the imperative UI
// needed ~37 hand-placed esc() calls to stay safe; interpolation now does that
// automatically EXCEPT inside v-html.
//
// Exactly one component may use it: Icon.vue, over icons.ts's compile-time
// constant path table. This test is the enforcement.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = ["Icon.vue"];

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return vueFiles(p);
    return name.endsWith(".vue") ? [p] : [];
  });
}

describe("v-html policy", () => {
  const files = vueFiles(join(__dirname));

  it("finds the components to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("is used only by Icon.vue", () => {
    const offenders = files
      .filter((f) => /\bv-html\b/.test(readFileSync(f, "utf8")))
      .map((f) => f.split(/[\\/]/).pop()!)
      .filter((name) => !ALLOWED.includes(name));

    // If this fails: use {{ }} or a :attr binding instead. If the content is
    // genuinely trusted markup, it belongs in a component, not a string.
    expect(offenders).toEqual([]);
  });
});
