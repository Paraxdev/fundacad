// The printed-Texture panel. Which rows a kind/profile shows is tested purely in
// features/textureForm.test.ts; this covers the wiring, and two behaviours that
// exist because their opposite was a bug:
//
//   * commit does NOT close the panel — the tool refuses a commit with no target
//     and stays active, and closing first stranded the user in an invisible
//     modal (panel gone, tool still owning face-picking, toolBusy() blocking
//     every Esc handler);
//   * the summary line is separate from the form, so refreshing it on every rAF
//     tick cannot re-render the fields and steal focus from one being typed in.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TextureToolPanel from "../../../src/components/overlays/TextureToolPanel.vue";
import { useToolPanelStore } from "../../../src/stores/toolPanels";
import { TexturePanel } from "../../../src/features/texturePanel";
import type { TextureMode, TextureValues } from "../../../src/features/textureForm";

enableAutoUnmount(afterEach);

function open(opts: Partial<Parameters<TexturePanel["show"]>[0]> = {}) {
  const handlers = {
    onCommit: vi.fn<(v: TextureValues) => void>(),
    onCancel: vi.fn(),
    onChange: vi.fn<(v: TextureValues) => void>(),
    onModeChange: vi.fn<(m: TextureMode) => void>(),
  };
  const panel = new TexturePanel();
  panel.show(
    { editing: false, mode: "faces", summary: "2 faces", initial: {}, ...opts },
    handlers,
  );
  const req = useToolPanelStore().texture!;
  mount(TextureToolPanel, { props: { req }, attachTo: document.body });
  return { panel, handlers };
}

const visible = (el: HTMLElement | null) => !!el && el.style.display !== "none";
const rowOf = (labelText: string) =>
  [...document.querySelectorAll<HTMLElement>("label")]
    .find((l) => l.textContent === labelText)?.parentElement ?? null;

describe("TextureToolPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("reaches the store through the facade", () => {
    open();
    expect(useToolPanelStore().texture).not.toBeNull();
    expect(new TexturePanel().isActive).toBe(true);
  });

  it("labels the commit button for the flow it is in", async () => {
    open({ editing: true });
    expect(document.body.textContent).toContain("Apply");
    document.body.innerHTML = "";
    setActivePinia(createPinia());
    open({ editing: false });
    expect(document.body.textContent).toContain("Add");
  });

  it("shows the live summary and refreshes it without touching the form", async () => {
    const { panel } = open({ summary: "2 faces" });
    expect(document.body.textContent).toContain("2 faces");

    const depth = document.querySelector<HTMLInputElement>("input[type=number]")!;
    depth.value = "9";
    depth.dispatchEvent(new Event("input"));
    await nextTick();

    panel.setSummary("5 faces");
    await nextTick();
    expect(document.body.textContent).toContain("5 faces");
    expect(depth.value).toBe("9"); // the field being typed into is untouched
  });

  it("switches mode from a button and reflects a mode set by the tool", async () => {
    const { panel, handlers } = open({ mode: "faces" });
    const [faces, body] = [...document.querySelectorAll<HTMLButtonElement>("button")];
    expect(faces!.textContent).toBe("Faces");

    body!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(handlers.onModeChange).toHaveBeenCalledWith("body");
    expect(useToolPanelStore().textureMode).toBe("body");

    panel.setMode("faces");
    await nextTick();
    expect(useToolPanelStore().textureMode).toBe("faces");
  });

  it("hides the rows the chosen kind has no use for", async () => {
    open({ initial: { kind: "knurl", profile: "round" } });
    expect(visible(rowOf("Angle°"))).toBe(true);
    expect(visible(rowOf("Seed"))).toBe(false);

    const kind = document.querySelector<HTMLSelectElement>("select")!;
    kind.value = "voronoi";
    kind.dispatchEvent(new Event("change"));
    await nextTick();
    expect(visible(rowOf("Angle°"))).toBe(false);
    expect(visible(rowOf("Seed"))).toBe(true);
    // Direction is not gated on kind: every kind honours it, and gating it left
    // noise/voronoi/image able only to grow the part.
    expect(visible(rowOf("Direction"))).toBe(true);
  });

  it("hides the print-colour row when the document has no palette", () => {
    open({ palette: [] });
    expect(visible(rowOf("Print color"))).toBe(false);
  });

  it("offers one option per palette slot when there is one", async () => {
    open({ palette: [{ name: "Black", color: "#000" }, { name: "Red", color: "#f00" }] });
    expect(visible(rowOf("Print color"))).toBe(true);
    expect(document.body.textContent).toContain("Red (slot 2)");
  });

  it("fires the live preview on an edit", async () => {
    const { handlers } = open();
    const depth = document.querySelector<HTMLInputElement>("input[type=number]")!;
    depth.value = "1.5";
    depth.dispatchEvent(new Event("input"));
    await nextTick();
    expect(handlers.onChange.mock.lastCall![0].depth).toBe(1.5);
  });

  it("commits WITHOUT closing — the tool may refuse and stay active", async () => {
    const { handlers } = open();
    const ok = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent!.includes("Add"))!;
    ok.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    await nextTick();
    expect(handlers.onCommit).toHaveBeenCalledOnce();
    expect(useToolPanelStore().texture).not.toBeNull();
  });

  it("cancels and closes on Cancel", async () => {
    const { handlers } = open();
    const no = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent!.includes("Cancel"))!;
    no.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    await nextTick();
    expect(handlers.onCancel).toHaveBeenCalledOnce();
    expect(useToolPanelStore().texture).toBeNull();
  });

  // TextureTool owns Escape for its whole active lifetime, which starts before
  // this panel exists and must outlast a refused commit.
  it("does not handle Escape itself", async () => {
    const { handlers } = open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });
});
