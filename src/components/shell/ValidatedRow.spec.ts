// The other half of what keystrokeGuard used to do.
//
// Vue's keyed patching stops the <input> being destroyed mid-edit, but a value
// binding still re-fires when the document changes, which clobbers uncommitted
// keystrokes just as thoroughly. Parameter commits land asynchronously on a
// promise chain in the store, so an update arriving mid-typing is routine, not
// hypothetical. useDraft's focus guard is what survives it.

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ValidatedRow from "./ValidatedRow.vue";

function mountRow(opts: { value: string; commit?: (raw: string) => string | null }) {
  return mount(ValidatedRow, {
    props: { label: "Width", value: opts.value, commit: opts.commit ?? (() => null) },
    attachTo: document.body, // focus/activeElement only behave when attached
  });
}

/** Type into the field WITHOUT committing.
 *
 *  Deliberately not wrapper.setValue(): that fires `input` AND `change` (it
 *  supports v-model.lazy), so it would commit on every simulated keystroke and
 *  quietly invalidate every mid-edit assertion below. Committing is `change`,
 *  which is the blur/Enter moment — that is the distinction these tests are
 *  about, so they draw it by hand. */
async function type(w: ReturnType<typeof mountRow>, text: string) {
  const input = w.get("input");
  input.element.focus();
  input.element.value = text;
  await input.trigger("input");
  return input;
}

describe("ValidatedRow", () => {
  it("tracks the source value while NOT focused", async () => {
    const w = mountRow({ value: "10" });
    expect(w.get("input").element.value).toBe("10");

    await w.setProps({ value: "25" });
    expect(w.get("input").element.value).toBe("25");
  });

  it("keeps uncommitted keystrokes when a background update lands mid-edit", async () => {
    const w = mountRow({ value: "10" });
    const input = await type(w, "123");

    // An async param commit from elsewhere rewrites the bound value. Before
    // useDraft this wiped the field under the user's cursor.
    await w.setProps({ value: "99" });

    expect(input.element.value).toBe("123");
  });

  it("commits the typed text on change, not on every keystroke", async () => {
    const seen: string[] = [];
    const w = mountRow({ value: "10", commit: (raw) => { seen.push(raw); return null; } });
    const input = await type(w, "42");

    expect(seen).toEqual([]); // typing alone must not touch the store
    await input.trigger("change");
    expect(seen).toEqual(["42"]);
  });

  it("re-syncs from the source after a successful commit", async () => {
    // The panel may legitimately re-spell what was sent (canonical rounding, an
    // fx badge), so a success must re-read rather than keep the typed text.
    const w = mountRow({ value: "10", commit: () => null });
    const input = await type(w, "7");

    await w.setProps({ value: "7.00" }); // the store's canonical spelling
    expect(input.element.value).toBe("7"); // still mid-edit, draft wins

    await input.trigger("change");
    expect(input.element.value).toBe("7.00");
  });

  it("keeps the rejected text and flags the error when a commit fails", async () => {
    const w = mountRow({ value: "10", commit: () => "unknown parameter" });
    const input = await type(w, "widht/2");
    await input.trigger("change");

    // The user has to be able to see and fix what they typed.
    expect(input.element.value).toBe("widht/2");
    expect(input.classes()).toContain("input-error");
    expect(input.attributes("title")).toBe("unknown parameter");
  });

  it("clears the error as soon as the user types again", async () => {
    const w = mountRow({ value: "10", commit: () => "nope" });
    const input = await type(w, "bad");
    await input.trigger("change");
    expect(input.classes()).toContain("input-error");

    await type(w, "bad2");
    expect(input.classes()).not.toContain("input-error");
  });
});
