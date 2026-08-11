// The modal-depth gate, end to end.
//
// `depth` (stores/modals.ts) is what toolBusy() reads through isChoiceOpen(),
// so a global shortcut cannot fire underneath an open dialog. Get the DECREMENT
// wrong and there is no error and no visible symptom — depth simply never
// returns to zero, toolBusy() stays true forever, and every tool in the app is
// silently dead. That is exactly the class of bug a test is worth writing for,
// and exactly the one the imperative version was structurally exposed to
// (pushModal() in open(), popModal() hand-repeated on four dismissal paths).
//
// So these tests do not mount the dialogs directly. They drive them the way the
// app does — through the store, with a host that mirrors App.vue's v-if — and
// assert the count is back to zero after each dialog closes by its OWN exit
// path: Escape, backdrop, Cancel, or a resolve() from inside an async flow.
//
// The dialogs Teleport to body, so assertions query `document` rather than the
// wrapper: the wrapper only holds the teleport anchor comments.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useModalStore } from "../../../src/stores/modals";
import { useDialogStore } from "../../../src/stores/dialogs";
import type { BugReportDeps } from "../../../src/ui/bugReporter";
import PublishDialog from "../../../src/components/overlays/PublishDialog.vue";
import SignInDialog from "../../../src/components/overlays/SignInDialog.vue";
import BugReportDialog from "../../../src/components/overlays/BugReportDialog.vue";

// Every dialog installs a capture-phase window key trap for its lifetime. A
// wrapper left mounted would keep swallowing Escape in the NEXT test.
enableAutoUnmount(afterEach);

const depth = () => useModalStore().depth;
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

/** Mirrors the App.vue entries for the gated dialogs. */
const Host = defineComponent({
  setup() {
    const dialogs = useDialogStore();
    return () => [
      dialogs.signIn ? h(SignInDialog, { req: dialogs.signIn }) : null,
      dialogs.publish ? h(PublishDialog, { req: dialogs.publish }) : null,
      dialogs.bugReport && dialogs.bugDeps ? h(BugReportDialog) : null,
    ];
  },
});

function esc() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}
function click(sel: string) {
  $(sel)!.dispatchEvent(new Event("click", { bubbles: true }));
}

/** The narrowest bug-report deps the dialog actually touches at open time. */
function fakeBugDeps(): BugReportDeps {
  return {
    store: { toJSON: () => `{"features":[]}` },
    geometry: { connected: true },
    viewport: { sceneStats: () => ["1 body"] },
    sketch: { snapshotFeature: () => null },
  } as unknown as BugReportDeps;
}

describe("modal depth gate", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    mount(Host, { attachTo: document.body });
  });

  it("starts at zero — the host on its own gates nothing", () => {
    expect(depth()).toBe(0);
  });

  it("counts the publish form exactly once, and gives the count back on Escape", async () => {
    const dialogs = useDialogStore();
    const answer = dialogs.openPublishForm("Bracket");
    await nextTick();
    expect($(".ta-publish")).not.toBeNull();
    expect(depth()).toBe(1);

    esc();
    await nextTick();
    expect(await answer).toBeNull();
    expect($(".ta-publish")).toBeNull();
    expect(depth()).toBe(0);
  });

  it("gives the count back when the publish form COMMITS, not only when cancelled", async () => {
    const dialogs = useDialogStore();
    const answer = dialogs.openPublishForm("Bracket");
    await nextTick();

    click(".ta-publish .choice-primary");
    expect(await answer).toEqual({ title: "Bracket", description: "", publish: true });
    await nextTick();
    expect(depth()).toBe(0);
  });

  it("keeps the count while a rejected commit holds the form open", async () => {
    const dialogs = useDialogStore();
    void dialogs.openPublishForm("ab"); // under the 3-character minimum
    await nextTick();

    click(".ta-publish .choice-primary");
    await nextTick();
    expect($(".ta-signin-error")!.textContent).toMatch(/at least 3/);
    expect(depth()).toBe(1); // still open, so still gating
  });

  it("counts the sign-in dialog once and releases it on the backdrop click", async () => {
    const dialogs = useDialogStore();
    const answer = dialogs.openSignIn();
    await nextTick();
    expect(depth()).toBe(1);

    // .self: the backdrop dismisses, a click inside the card does not.
    $(".ta-signin")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(depth()).toBe(1);

    $(".choice-backdrop")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(await answer).toBeNull();
    expect(depth()).toBe(0);
  });

  it("does not stack a second sign-in dialog when two callers race", async () => {
    // The menubar and the publish flow can both ask. The imperative version
    // built a second backdrop with a second capture-phase key trap over the
    // first, pushed the depth twice, and only the top one was dismissible.
    const dialogs = useDialogStore();
    const a = dialogs.openSignIn();
    const b = dialogs.openSignIn();
    await nextTick();
    expect(document.querySelectorAll(".ta-signin").length).toBe(1);
    expect(depth()).toBe(1);

    esc();
    await nextTick();
    expect(await a).toBeNull();
    expect(await b).toBeNull();
    expect(depth()).toBe(0);
  });

  it("counts the bug reporter once and releases it on Cancel", async () => {
    const dialogs = useDialogStore();
    dialogs.bindBugReporter(fakeBugDeps());
    dialogs.bugReport = true;
    await nextTick();
    expect(depth()).toBe(1);

    click(".bug-cancel");
    await nextTick();
    expect(dialogs.bugReport).toBe(false);
    expect(depth()).toBe(0);
  });

  it("nests rather than double-counting when dialogs stack", async () => {
    // Publish opens sign-in before its own form; the welcome screen opens
    // sign-in over itself. Each has to give its own count back.
    //
    // One Escape dismisses ONE of them: every trap calls
    // stopImmediatePropagation, and capture listeners on window fire in
    // registration order, so the dialog that opened first wins. That is the
    // imperative behaviour too, and it is why the count is per-dialog.
    const dialogs = useDialogStore();
    const signIn = dialogs.openSignIn();
    await nextTick();
    const form = dialogs.openPublishForm("Bracket");
    await nextTick();
    expect(depth()).toBe(2);

    esc();
    await nextTick();
    expect(await signIn).toBeNull();
    expect(depth()).toBe(1);

    esc();
    await nextTick();
    expect(await form).toBeNull();
    expect(depth()).toBe(0);
  });
});
