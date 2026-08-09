// The welcome screen's three load-bearing details.
//
//   1. `.modal-close` still exists. e2e/assembly_tree_e2e.cjs — the CI script —
//      dismisses the startup modal by clicking it, and if the button is gone
//      that script HANGS rather than failing, so nothing tells you.
//   2. Recent-file names are escaped exactly once. The innerHTML version needed
//      esc() on every one; interpolation escapes on its own, so a leftover
//      esc() would render a file called "Bracket & Plate" as "Bracket &amp;
//      Plate" — a bug you only see with the right file on the recents list.
//   3. The iframe sandbox token list. It and the postMessage origin gate are
//      the app's only guards on the one piece of remote content the webview
//      embeds (CSP frame-src is the third). Widening it is a real
//      vulnerability in a privileged Tauri webview, so it is pinned here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useModalStore } from "../../stores/modals";
import { useDialogStore } from "../../stores/dialogs";
import WelcomeModal from "./WelcomeModal.vue";

// happy-dom really does fetch an <iframe src>, and the real URL is
// tinkeratlas.com. Point it at about:blank so the suite stays offline — the
// attribute under test is the sandbox list, not the address.
vi.mock("../../tinkeratlas/client", () => ({
  TA_WELCOME_URL: "about:blank",
  onAccountChange: (fn: (u: null) => void) => {
    fn(null);
    return () => {};
  },
  taAvatar: async () => null,
  taPing: async () => false,
}));

enableAutoUnmount(afterEach);

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

function open(recents: { path: string; openedAt: number }[] = []) {
  localStorage.setItem("sindri.recentFiles", JSON.stringify(recents));
  useDialogStore().bindWelcome({
    onNew: () => {},
    onOpen: () => {},
    onOpenPath: async () => "ok",
    onSignIn: () => {},
    onSignOut: () => {},
  });
  return mount(WelcomeModal, { attachTo: document.body });
}

describe("WelcomeModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("keeps the .modal-close button the CI e2e script clicks", () => {
    open();
    expect($(".modal-close")).not.toBeNull();
  });

  it("escapes a recent-file name exactly once", () => {
    open([{ path: "C:/work/Bracket & Plate.sindri", openedAt: 1 }]);
    const name = $(".welcome-recent-name")!;
    expect(name.textContent).toBe("Bracket & Plate.sindri");
    expect(name.innerHTML).not.toContain("&amp;amp;");
    expect($(".welcome-recent-dir")!.textContent).toBe("C:/work");
    // the full path stays on the title, for the user AND for disambiguation
    expect($(".welcome-recent")!.getAttribute("title")).toBe("C:/work/Bracket & Plate.sindri");
  });

  it("sandboxes the embedded TinkerAtlas page with exactly the agreed tokens", () => {
    open();
    // Outside Tauri there is no Rust to ask for reachability, so the frame goes
    // up best-effort — which is what makes it assertable here.
    const frame = document.querySelector("iframe.welcome-frame")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
  });

  it("gates global shortcuts for exactly its own lifetime", async () => {
    const w = open();
    expect(useModalStore().depth).toBe(1);
    w.unmount();
    await nextTick();
    expect(useModalStore().depth).toBe(0);
  });

  it("closes on Escape", async () => {
    open();
    const dialogs = useDialogStore();
    dialogs.welcome = true;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(dialogs.welcome).toBe(false);
  });

  it("remembers the show-on-startup choice", async () => {
    open();
    const box = document.querySelector<HTMLInputElement>(".welcome-startup input")!;
    expect(box.checked).toBe(true); // default is on
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(localStorage.getItem("sindri.welcomeOnStartup")).toBe("false");
  });
});
