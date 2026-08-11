// The selection-driven offer, proved without a viewport.
//
// Every failure here is a version of "the app knows perfectly well that Fillet
// works on this, and still isn't offering it" — the complaint
// features/toolCapabilities.ts was written to end, now one layer further up
// where the buttons are.

import { describe, it, expect } from "vitest";
import { TOOL_CAPABILITIES, TOOL_IDS } from "../features/toolCapabilities";
import { allCommands } from "./commands";
import { iconPaths } from "./icons";
import { MAX_PIE_ITEMS } from "./pieMath";
import {
  TOOLBAR_MAX,
  primaryKind,
  selectionOffers,
  selectionPie,
  toolbarOffers,
  type ToolOffer,
} from "./selectionTools";

const labels = (offers: ToolOffer[]) => offers.map((o) => o.tool);

describe("the offer's shape", () => {
  it("names an icon that ui/icons.ts actually draws", () => {
    // The icon table is a Record over every ToolId, so a MISSING tool is a
    // compile error already. What the compiler cannot see is a name that no
    // pack defines: resolveIconPaths deliberately returns "" for an unknown
    // name rather than throwing, so a typo here ships as an invisible button
    // that still takes clicks.
    const seen = new Set<string>();
    for (const sel of [{ edge: 2 }, { face: 2 }, { body: 2 }, { "sketch-region": 2 }] as const) {
      for (const o of selectionOffers(sel)) {
        seen.add(o.tool);
        expect(iconPaths(o.iconName), `${o.tool} -> ${o.iconName}`).not.toBe("");
      }
    }
    // ...and between them those four selections reach every tool that consumes
    // a selection at all, so nothing in the table went unchecked.
    const consumesSelection = TOOL_IDS.filter((id) => TOOL_CAPABILITIES[id].source === "selection");
    expect([...seen].sort()).toEqual([...consumesSelection].sort());
  });

  it("only ever hands out action ids the app actually dispatches", () => {
    // A button whose click dispatches an id nothing handles is indistinguishable
    // from a broken tool. The single exception is declared as `action: null`,
    // never as a plausible-looking string.
    const known = new Set(allCommands().map((c) => c.id));
    for (const sel of [{ edge: 1 }, { face: 1 }, { body: 2 }, { "sketch-region": 2 }]) {
      for (const o of selectionOffers(sel)) {
        if (o.action !== null) expect(known.has(o.action)).toBe(true);
      }
    }
  });

  it("marks face delete as having no action id", () => {
    // It is dispatched through engine.deleteSelectedFace, not through the
    // action table; a caller that forgot would run nothing at all.
    const del = selectionOffers({ face: 1 }).find((o) => o.tool === "delete-face");
    expect(del?.action).toBeNull();
  });
});

describe("what a selection offers", () => {
  it("offers an edge the two blends and nothing else", () => {
    // Press/Pull consumes faces. Offering it beside a selected edge would be an
    // offer that cannot be taken.
    expect(labels(selectionOffers({ edge: 3 }))).toEqual(["fillet", "chamfer"]);
  });

  it("offers a face the blends too, not just Press/Pull", () => {
    // The headline of the capability table: a face is shorthand for all of its
    // edges. Before it, selecting a face and wanting a fillet meant going back
    // and picking twelve edges by hand.
    expect(labels(selectionOffers({ face: 1 }))).toContain("fillet");
    expect(labels(selectionOffers({ face: 1 }))).toContain("presspull");
  });

  it("never offers a tool that runs its own pick", () => {
    // Shell can act on a face, but a selected face does not make Shell runnable
    // — it would ignore the selection and ask for another click, which reads as
    // the button having done nothing.
    for (const sel of [{ face: 4 }, { edge: 2 }, { body: 1 }]) {
      expect(labels(selectionOffers(sel))).not.toContain("shell");
      expect(labels(selectionOffers(sel))).not.toContain("measure");
    }
  });

  it("ranks an edge over a face when both are selected", () => {
    // Must agree with app/viewportWiring.ts, which ranks the drag handle the
    // same way. Two affordances on one selection that disagreed about what is
    // selected is worse than either one being wrong alone.
    expect(primaryKind({ edge: 1, face: 2 })).toBe("edge");
    expect(primaryKind({ face: 2, "sketch-region": 1 })).toBe("sketch-region");
    expect(labels(selectionOffers({ edge: 1, face: 2 }))).toEqual(["fillet", "chamfer"]);
  });

  it("offers nothing at all for an empty selection", () => {
    // The toolbar's whole disappearing act rests on this being empty rather
    // than on the component remembering to check.
    expect(selectionOffers({})).toEqual([]);
    expect(selectionPie(0, 0, {}, () => {})).toBeNull();
  });
});

describe("shown versus live", () => {
  it("keeps Loft in the wheel with one profile, and dims it", () => {
    // Filtering it out instead would slide Revolve and Sweep into different
    // slots the moment a second profile was picked — the exact muscle-memory
    // break the fixed slots exist to prevent. Dim also answers "why can't I
    // loft this", which silence does not.
    const one = selectionOffers({ "sketch-region": 1 });
    const loft = one.find((o) => o.tool === "loft");
    expect(loft).toBeDefined();
    expect(loft!.enabled).toBe(false);
    expect(one.find((o) => o.tool === "extrude")!.enabled).toBe(true);

    const two = selectionOffers({ "sketch-region": 2 });
    expect(two.map((o) => o.tool)).toEqual(one.map((o) => o.tool)); // same wheel...
    expect(two.find((o) => o.tool === "loft")!.enabled).toBe(true); // ...just live now
  });

  it("keeps the pie's identity and order fixed as the count changes", () => {
    const a = selectionPie(0, 0, { face: 1 }, () => {})!;
    const b = selectionPie(0, 0, { face: 9 }, () => {})!;
    expect(a.id).toBe(b.id);
    expect(a.items.map((i) => i.label)).toEqual(b.items.map((i) => i.label));
    expect(a.items.length).toBeLessThanOrEqual(MAX_PIE_ITEMS);
  });
});

describe("the toolbar's cut", () => {
  it("shows only what can run, and no more than fits over the model", () => {
    const bar = toolbarOffers({ "sketch-region": 1 });
    expect(bar.every((o) => o.enabled)).toBe(true);
    expect(bar.length).toBeLessThanOrEqual(TOOLBAR_MAX);
    expect(labels(bar)).not.toContain("loft");
  });

  it("leaves the destructive one to the pie", () => {
    // Delete Face is last in the capability table's preference order, so the
    // cap drops it without anybody special-casing it — and a destructive verb
    // one stray click from the cursor, floating over the part, is exactly what
    // a hover toolbar should not carry.
    expect(labels(toolbarOffers({ face: 1 }))).not.toContain("delete-face");
    expect(selectionPie(0, 0, { face: 1 }, () => {})!.items.map((i) => i.label)).toContain(
      "Delete Face",
    );
  });

  it("runs the offer it was clicked on", () => {
    const ran: string[] = [];
    const pie = selectionPie(0, 0, { edge: 1 }, (o) => ran.push(o.tool))!;
    pie.items[0]?.onPick?.();
    expect(ran).toEqual(["fillet"]);
  });
});
