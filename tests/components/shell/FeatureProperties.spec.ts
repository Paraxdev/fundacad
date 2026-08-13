// The feature's values, as rendered by the panel BOTH surfaces use.
//
// FeatureProperties was lifted out of InspectorPane so the History strip could
// show the same rows under the chip you clicked. The reason it is one component
// rather than two lists is that these rows are the WRITE PATH into the feature,
// not a display of it, and a second copy would drift the first time a field type
// was added. So what is worth pinning here is that both halves of that write
// path still work: a sketch dimension re-serialising one entity, and a feature
// field going through the unit-agnostic parser.

import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import FeatureProperties from "../../../src/components/shell/FeatureProperties.vue";
import { ENGINE } from "../../../src/app/engineKey";
import type { Engine } from "../../../src/app/engine";
import type { CadDocument, Feature } from "../../../src/types";

/** The narrowest engine FeatureProperties touches. */
function makeEngine(doc: CadDocument) {
  const docVersion = ref(0);
  const buildVersion = ref(0);
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const values: { field: string; value: number }[] = [];
  const store = {
    get document() { return doc; },
    updateFeature: (id: string, patch: Record<string, unknown>) => {
      updates.push({ id, patch });
      Object.assign(doc.features.find((f) => f.id === id)!, patch);
      docVersion.value++;
    },
    boundExpr: () => null,
    isParamBound: () => false,
    setTargetValue: (t: { field: string }, value: number) => { values.push({ field: t.field, value }); },
    setTargetExpr: () => null,
  };
  return {
    updates,
    values,
    engine: { store, bridge: { docVersion, buildVersion } } as unknown as Engine,
  };
}

function render(fake: ReturnType<typeof makeEngine>, featureId: string): VueWrapper {
  return mount(FeatureProperties, {
    props: { featureId, unit: "mm" },
    global: { provide: { [ENGINE as symbol]: fake.engine } },
  });
}

/** Every row as [label, value]. */
const rows = (w: VueWrapper) =>
  w.findAll(".param-row").map((r) => [r.find("label").text(), r.find("input").element.value]);

/** Commit `text` into the row whose label starts with `label`. */
async function commit(w: VueWrapper, label: string, text: string) {
  const row = w.findAll(".param-row").find((r) => r.find("label").text().startsWith(label))!;
  const input = row.find("input");
  input.element.value = text;
  await input.trigger("input");
  await input.trigger("change"); // change is the commit, not input
}

const CIRCLE = (r: number): Feature =>
  ({ id: "s1", type: "sketch", plane: "XY", entities: [{ type: "circle", id: "c1", x: 0, y: 0, radius: r }] }) as Feature;

const EXTRUDE: Feature =
  ({ id: "e1", type: "extrude", sketch: "s1", distance: 10, operation: "new" }) as Feature;

describe("FeatureProperties", () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  it("lists a sketch's entity dimensions", () => {
    const fake = makeEngine({ parameters: {}, features: [CIRCLE(6)] });
    // The circle's diameter, in the unit the caller passed.
    expect(rows(render(fake, "s1"))).toEqual([["Diameter mm", "12"]]);
  });

  it("lists a feature's numeric fields", () => {
    const fake = makeEngine({ parameters: {}, features: [EXTRUDE] });
    expect(rows(render(fake, "e1"))).toContainEqual(["Distance mm", "10"]);
  });

  it("writes a sketch dimension back through the ONE entity it belongs to", async () => {
    const fake = makeEngine({ parameters: {}, features: [CIRCLE(6)] });
    const w = render(fake, "s1");
    await commit(w, "Diameter", "20");
    // Diameter 20 is radius 10 — the row is a diameter, the document stores a
    // radius, and entityDims owns that conversion.
    expect(fake.updates).toHaveLength(1);
    const ents = fake.updates[0]!.patch["entities"] as { radius: number }[];
    expect(ents[0]!.radius).toBeCloseTo(10, 9);
  });

  it("takes a unit the field is not showing", async () => {
    // The whole point of routing every value surface through ui/measure: this
    // row says mm, and "1 inch" has to mean 25.4mm rather than 1. parseFloat
    // returned 1 here and reported nothing, so the part was simply wrong.
    const fake = makeEngine({ parameters: {}, features: [CIRCLE(6)] });
    await commit(render(fake, "s1"), "Diameter", "1 inch");
    const ents = fake.updates[0]!.patch["entities"] as { radius: number }[];
    expect(ents[0]!.radius).toBeCloseTo(12.7, 9); // 1in diameter = 12.7mm radius
  });

  it("takes a fraction, which parseFloat read as its numerator", async () => {
    const fake = makeEngine({ parameters: {}, features: [CIRCLE(6)] });
    await commit(render(fake, "s1"), "Diameter", '1/2"');
    const ents = fake.updates[0]!.patch["entities"] as { radius: number }[];
    expect(ents[0]!.radius).toBeCloseTo(6.35, 9); // half-inch diameter
  });

  it("refuses text that is not a value instead of writing NaN", async () => {
    const fake = makeEngine({ parameters: {}, features: [CIRCLE(6)] });
    const w = render(fake, "s1");
    await commit(w, "Diameter", "banana");
    expect(fake.updates).toHaveLength(0);
    // The input goes red and KEEPS the rejected text, so the value can be
    // fixed rather than retyped, and the tooltip says what was wrong.
    const input = w.find("input");
    expect(input.classes()).toContain("input-error");
    expect(input.element.value).toBe("banana");
    expect(input.attributes("title")).toBeTruthy();
  });

  it("renders nothing for a feature with no numeric fields", () => {
    const fake = makeEngine({ parameters: {}, features: [{ id: "d1", type: "deleteFace" } as Feature] });
    expect(rows(render(fake, "d1"))).toEqual([]);
  });
});
