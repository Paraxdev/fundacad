import { describe, it, expect } from "vitest";
import { MODEL, SKETCH, leavesOf } from "../../src/ui/ribbonDefs";
import type { Group } from "../../src/ui/ribbonDefs";
import {
  MODEL_RAIL,
  SKETCH_RAIL,
  asRailDefaults,
  defaultTool,
  groupForAction,
  hasVariants,
  onRailDefaultsChange,
  railDefaults,
  railFor,
  resolveRail,
  setRailDefault,
  toolIndex,
} from "../../src/ui/toolRail";

const actionsIn = (groups: Group[]) =>
  new Set(groups.flatMap((g) => g.items.flatMap(leavesOf)).map((t) => t.action));

describe("the rail definitions", () => {
  it("names only tools the ribbon actually has", () => {
    // The rail is bare action ids resolved against ribbonDefs, which is what
    // keeps labels and icons in one place — the price is that a typo, or a tool
    // someone retires, becomes a flyout row that dispatches into nothing. At
    // runtime the row is silently dropped; this is where it is meant to hurt.
    const model = actionsIn(MODEL);
    for (const g of MODEL_RAIL) for (const a of g.actions) expect([g.id, model.has(a)]).toEqual([g.id, true]);
    const sketch = actionsIn(SKETCH);
    for (const g of SKETCH_RAIL) for (const a of g.actions) expect([g.id, sketch.has(a)]).toEqual([g.id, true]);
  });

  it("keeps every group id unique across BOTH rails", () => {
    // One localStorage map serves both contexts, keyed by group id. Two groups
    // sharing an id would silently share a remembered variant — picking Center
    // Rect in a sketch would move a modelling button's face.
    const ids = [...MODEL_RAIL, ...SKETCH_RAIL].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never lists the same tool in two groups of one rail", () => {
    // groupForAction answers "which button should light up for the armed
    // tool?" — with a tool in two groups the answer depends on array order, so
    // the highlight would land on whichever group happened to come first.
    for (const rail of [MODEL_RAIL, SKETCH_RAIL]) {
      const seen = new Set<string>();
      for (const g of rail) {
        for (const a of g.actions) {
          expect([a, seen.has(a)]).toEqual([a, false]);
          seen.add(a);
        }
      }
    }
  });

  it("gives every group a label and at least one tool", () => {
    for (const g of [...MODEL_RAIL, ...SKETCH_RAIL]) {
      expect(g.label.trim().length).toBeGreaterThan(0);
      expect(g.actions.length).toBeGreaterThan(0);
    }
  });

  it("groups the variants the user asked for", () => {
    // The two families named in the request, pinned so a later tidy-up cannot
    // quietly unpick them: a rectangle anchored at a corner or at its centre,
    // and a pattern that is linear or circular.
    const rect = SKETCH_RAIL.find((g) => g.id === "rectangle");
    expect(rect?.actions).toContain("rectangle");
    expect(rect?.actions).toContain("centerRectangle");
    const pattern = SKETCH_RAIL.find((g) => g.id === "pattern");
    expect(pattern?.actions).toEqual(["patternRect", "patternCircular"]);
    const circle = SKETCH_RAIL.find((g) => g.id === "circle");
    expect(circle?.actions).toEqual(["circle", "circle2", "circle3"]);
  });
});

describe("toolIndex", () => {
  it("reaches tools that are folded into a ribbon split button", () => {
    // Loft and Sweep exist only as children of the Revolve split; indexing the
    // top level alone would drop them and leave that rail group holding one
    // tool with no flyout.
    const index = toolIndex(MODEL);
    expect(index.get("loft")?.label).toBe("Loft");
    expect(index.get("sweep")?.iconName).toBe("sweep");
  });
});

describe("resolveRail", () => {
  const source: Group[] = [
    {
      label: "CREATE",
      items: [
        { action: "rectangle", label: "Rectangle", iconName: "rectangle" },
        { action: "centerRectangle", label: "Center Rect", iconName: "centerRectangle" },
      ],
    },
  ];

  it("carries the ribbon's own label and icon rather than a second copy", () => {
    const [group] = resolveRail([{ id: "rectangle", label: "Rectangle", actions: ["rectangle"] }], source);
    expect(group?.items[0]).toEqual({ action: "rectangle", label: "Rectangle", iconName: "rectangle" });
  });

  it("keeps the flyout in the order the definition lists", () => {
    // Flyout order is a decision — the first entry is the factory default and
    // the rest read top to bottom — so it must come from the rail definition,
    // not from wherever the ribbon happens to put the tools.
    const [group] = resolveRail(
      [{ id: "rectangle", label: "Rectangle", actions: ["centerRectangle", "rectangle"] }],
      source,
    );
    expect(group?.items.map((t) => t.action)).toEqual(["centerRectangle", "rectangle"]);
  });

  it("drops an action the ribbon no longer has", () => {
    // Degrading to a shorter flyout beats rendering a button with no icon whose
    // only behaviour is to dispatch an action nothing handles.
    const [group] = resolveRail(
      [{ id: "rectangle", label: "Rectangle", actions: ["rectangle", "rect3pt"] }],
      source,
    );
    expect(group?.items.map((t) => t.action)).toEqual(["rectangle"]);
  });

  it("drops a group left with nothing at all", () => {
    expect(resolveRail([{ id: "gone", label: "Gone", actions: ["nope"] }], source)).toEqual([]);
  });
});

describe("railFor", () => {
  it("resolves every defined group in both contexts", () => {
    // If this ever shrinks, a group silently vanished from the rail because all
    // of its actions failed to resolve.
    expect(railFor("model")).toHaveLength(MODEL_RAIL.length);
    expect(railFor("sketch")).toHaveLength(SKETCH_RAIL.length);
  });

  it("gives the two contexts different tools", () => {
    const model = railFor("model").flatMap((g) => g.items.map((t) => t.action));
    expect(model).toContain("extrude");
    expect(model).not.toContain("rectangle");
  });
});

describe("defaultTool", () => {
  const group = railFor("sketch").find((g) => g.id === "rectangle")!;

  it("opens on the first variant before the user has chosen anything", () => {
    expect(defaultTool(group, undefined).action).toBe("rectangle");
  });

  it("honours a remembered choice", () => {
    expect(defaultTool(group, "centerRectangle").action).toBe("centerRectangle");
  });

  it("falls back when the remembered tool is no longer in the group", () => {
    // The stored value is untrusted: it may name a tool that has since been
    // retired, renamed or moved to another group. Membership is re-checked on
    // every read because this is the only place that knows what the group holds
    // TODAY — the alternative is a button face resolving to undefined and a
    // render that throws.
    expect(defaultTool(group, "circle3").action).toBe("rectangle");
    expect(defaultTool(group, "").action).toBe("rectangle");
  });
});

describe("groupForAction", () => {
  const groups = railFor("sketch");

  it("finds the button a tool armed elsewhere belongs to", () => {
    // Pressing R arms Rectangle from the keymap; without this the rail would go
    // on showing Center Rect as active and look out of sync with the app.
    expect(groupForAction(groups, "centerRectangle")?.id).toBe("rectangle");
  });

  it("is null for no tool and for a tool that is not on the rail", () => {
    expect(groupForAction(groups, "")).toBeNull();
    expect(groupForAction(groups, "extrude")).toBeNull();
  });
});

describe("hasVariants", () => {
  it("is false for a one-tool group, so holding it opens nothing", () => {
    // A flyout listing a single item is a menu you have to dismiss for no
    // reason; the gesture machine is told to ignore the hold instead.
    const groups = railFor("sketch");
    expect(hasVariants(groups.find((g) => g.id === "line")!)).toBe(false);
    expect(hasVariants(groups.find((g) => g.id === "circle")!)).toBe(true);
  });
});

describe("asRailDefaults", () => {
  it("keeps the good entries and drops only the bad ones", () => {
    // Unlike a theme id, this setting is a MAP: refusing the whole thing over
    // one unreadable entry would throw away every other choice the user has
    // made just because one group was renamed.
    expect(asRailDefaults({ rectangle: "centerRectangle", circle: 7, pattern: "" })).toEqual({
      rectangle: "centerRectangle",
    });
  });

  it("refuses anything that is not an object of strings", () => {
    expect(asRailDefaults(null)).toEqual({});
    expect(asRailDefaults("rectangle")).toEqual({});
    expect(asRailDefaults(["rectangle"])).toEqual({});
  });
});

describe("setRailDefault", () => {
  it("remembers a pick and tells subscribers", () => {
    let ticks = 0;
    const stop = onRailDefaultsChange(() => ticks++);
    setRailDefault("circle", "circle3");
    expect(railDefaults()["circle"]).toBe("circle3");
    expect(ticks).toBe(1);
    stop();
  });

  it("stays silent when the pick is already the default", () => {
    // The rail re-reads this on every render; a listener that fired on a no-op
    // write would turn "click the tool you already had" into a render storm.
    setRailDefault("circle", "circle3");
    let ticks = 0;
    const stop = onRailDefaultsChange(() => ticks++);
    setRailDefault("circle", "circle3");
    expect(ticks).toBe(0);
    stop();
  });

  it("replaces the map rather than mutating it, so identity means something", () => {
    // Subscribers are allowed to hold the returned object and compare identity
    // to decide whether to redraw.
    const before = railDefaults();
    setRailDefault("circle", "circle2");
    expect(railDefaults()).not.toBe(before);
    expect(before["circle"]).toBe("circle3");
  });

  it("ignores an empty group or action", () => {
    const before = railDefaults();
    setRailDefault("", "circle2");
    setRailDefault("circle", "");
    expect(railDefaults()).toBe(before);
  });

  it("survives having no storage at all", () => {
    // The headless suite runs with no localStorage, and so does a webview in
    // private mode: the choice simply does not outlive the session.
    expect(() => setRailDefault("pattern", "patternCircular")).not.toThrow();
    expect(railDefaults()["pattern"]).toBe("patternCircular");
  });
});
