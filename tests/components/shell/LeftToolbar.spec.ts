// The rail as a function of state, and the pointer wiring that turns one press
// into either a click or a hold.
//
// The rules themselves are proved headlessly (ui/holdGesture.test.ts,
// ui/toolRail.test.ts); what can only break HERE is the plumbing between them —
// a release listened for on the wrong element, a timer that is never armed, a
// pick that runs the tool but forgets to move the button face. Each of those
// leaves both pure modules perfectly correct and the rail unusable.
//
// happy-dom implements no layout, so nothing about where the flyout lands is
// asserted; that stays e2e/manual territory, exactly as it is for the ribbon's
// popup.

import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LeftToolbar from "../../../src/components/shell/LeftToolbar.vue";
import { useRibbonStore } from "../../../src/stores/ribbon";
import { HOLD_MS } from "../../../src/ui/holdGesture";
import { railFor } from "../../../src/ui/toolRail";

let wrapper: VueWrapper | null = null;

/** Mount with a fresh pinia and record everything the rail dispatches. */
function open() {
  setActivePinia(createPinia());
  const ribbon = useRibbonStore();
  const acted: string[] = [];
  ribbon.bind((action) => acted.push(action));
  // attachTo matters: the rail listens for the release on the WINDOW, so a
  // wrapper mounted detached would swallow every pointerup dispatched inside
  // it and the pick could never be observed.
  wrapper = mount(LeftToolbar, {
    attachTo: document.body,
    global: { stubs: { teleport: true } },
  });
  return { ribbon, acted, w: wrapper };
}

/** A real release, dispatched where the pointer actually came up — the rail
 *  listens on the window, so the event has to bubble from somewhere. */
function releaseOver(el: Element) {
  el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
  return nextTick();
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

describe("the rail's contents", () => {
  it("shows one button per group, not one per tool", () => {
    // The whole point of the rail: eighteen sketch tools behind ten buttons.
    const { w } = open();
    expect(w.findAll(".rail-btn")).toHaveLength(railFor("model").length);
  });

  it("swaps to the sketch tools when a sketch opens", () => {
    // The context lives in the store and is pushed in from sketch mode; if this
    // stopped propagating the rail would keep offering Extrude inside a sketch.
    const { ribbon, w } = open();
    expect(w.find('[data-rail-group="rectangle"]').exists()).toBe(false);
    ribbon.context = "sketch";
    return nextTick().then(() => {
      expect(w.find('[data-rail-group="rectangle"]').exists()).toBe(true);
      expect(w.find('[data-rail-group="extrude"]').exists()).toBe(false);
    });
  });

  it("marks only the groups that have variants", () => {
    // The corner wedge is the only thing on screen saying a hold will do
    // something; putting it on a one-tool button promises a menu that never
    // opens.
    const { ribbon, w } = open();
    ribbon.context = "sketch";
    return nextTick().then(() => {
      expect(w.find('[data-rail-group="circle"]').classes()).toContain("variants");
      expect(w.find('[data-rail-group="line"]').classes()).not.toContain("variants");
    });
  });

  it("lights up the group holding the tool armed from somewhere else", () => {
    // Press R and the rail must agree with the app about what is armed, even
    // though nothing told the rail directly.
    const { ribbon, w } = open();
    ribbon.context = "sketch";
    ribbon.activeSketchTool = "circle3";
    return nextTick().then(() => {
      const btn = w.find('[data-rail-group="circle"]');
      expect(btn.classes()).toContain("active");
      expect(btn.attributes("data-action")).toBe("circle3");
    });
  });
});

describe("a click", () => {
  it("runs the tool on the face", async () => {
    const { acted, w } = open();
    const btn = w.find('[data-rail-group="extrude"]');
    await btn.trigger("pointerdown", { button: 0 });
    await releaseOver(document.body);
    expect(acted).toEqual(["extrude"]);
    expect(w.find(".rail-flyout").exists()).toBe(false);
  });

  it("ignores a right-button press entirely", async () => {
    // Otherwise the contextmenu path would be racing a press it never asked for.
    const { acted, w } = open();
    await w.find('[data-rail-group="extrude"]').trigger("pointerdown", { button: 2 });
    await releaseOver(document.body);
    expect(acted).toEqual([]);
  });
});

describe("a hold", () => {
  it("opens the variants and runs nothing", async () => {
    vi.useFakeTimers();
    const { ribbon, acted, w } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="rectangle"]').trigger("pointerdown", { button: 0 });
    vi.advanceTimersByTime(HOLD_MS);
    await nextTick();
    expect(w.find(".rail-flyout").exists()).toBe(true);
    expect(w.findAll("[data-rail-action]").map((r) => r.attributes("data-rail-action"))).toEqual([
      "rectangle",
      "centerRectangle",
    ]);
    expect(acted).toEqual([]);
  });

  it("does not open before the threshold", async () => {
    // A slow click is still a click. If the timer were armed short, drawing
    // would keep being interrupted by menus nobody asked for.
    vi.useFakeTimers();
    const { ribbon, w } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="rectangle"]').trigger("pointerdown", { button: 0 });
    vi.advanceTimersByTime(HOLD_MS - 20);
    await nextTick();
    expect(w.find(".rail-flyout").exists()).toBe(false);
  });

  it("never opens for a group with only one tool", async () => {
    vi.useFakeTimers();
    const { ribbon, acted, w } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="line"]').trigger("pointerdown", { button: 0 });
    vi.advanceTimersByTime(HOLD_MS * 3);
    await nextTick();
    expect(w.find(".rail-flyout").exists()).toBe(false);
    // ...and the press it swallowed nothing from still draws a line.
    await releaseOver(document.body);
    expect(acted).toEqual(["line"]);
  });
});

describe("picking a variant", () => {
  it("runs it and leaves it on the button face", async () => {
    // The rail is supposed to learn. If the face did not move, the user would
    // have to hold the button again every single time.
    vi.useFakeTimers();
    const { ribbon, acted, w } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="rectangle"]').trigger("pointerdown", { button: 0 });
    vi.advanceTimersByTime(HOLD_MS);
    await nextTick();

    await releaseOver(w.find('[data-rail-action="centerRectangle"]').element);
    expect(acted).toEqual(["centerRectangle"]);
    expect(w.find(".rail-flyout").exists()).toBe(false);
    expect(w.find('[data-rail-group="rectangle"]').attributes("data-action")).toBe("centerRectangle");

    // ...and the next plain click runs the remembered one, with no hold.
    await w.find('[data-rail-group="rectangle"]').trigger("pointerdown", { button: 0 });
    await releaseOver(document.body);
    expect(acted).toEqual(["centerRectangle", "centerRectangle"]);
  });

  it("cancels when the pointer comes up off the list", async () => {
    vi.useFakeTimers();
    const { ribbon, acted, w } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="circle"]').trigger("pointerdown", { button: 0 });
    vi.advanceTimersByTime(HOLD_MS);
    await nextTick();
    await releaseOver(document.body);
    expect(w.find(".rail-flyout").exists()).toBe(false);
    expect(acted).toEqual([]);
  });
});

describe("right-click", () => {
  it("opens the variants at once, without running anything", async () => {
    const { ribbon, acted, w } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="circle"]').trigger("contextmenu");
    expect(w.find(".rail-flyout").exists()).toBe(true);
    expect(acted).toEqual([]);
  });

  it("survives the pointerup that every right-click emits", async () => {
    // A right-click is pointerdown, contextmenu, pointerup. Counting that
    // trailing release would shut the flyout in the same frame it opened.
    const { w, ribbon } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="circle"]').trigger("contextmenu");
    document.body.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 2 }));
    await nextTick();
    expect(w.find(".rail-flyout").exists()).toBe(true);
  });

  it("closes on Escape", async () => {
    const { w, ribbon } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="circle"]').trigger("contextmenu");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(w.find(".rail-flyout").exists()).toBe(false);
  });

  it("closes when a sketch is finished under it", async () => {
    // The context switch replaces every button; a flyout left open would be
    // anchored to one that no longer exists.
    const { w, ribbon } = open();
    ribbon.context = "sketch";
    await nextTick();
    await w.find('[data-rail-group="circle"]').trigger("contextmenu");
    ribbon.context = "model";
    await nextTick();
    expect(w.find(".rail-flyout").exists()).toBe(false);
  });
});
