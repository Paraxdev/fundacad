// Welcome screen — opens at startup (unless turned off) and from the
// TinkerAtlas menu.
//
// Facade over stores/dialogs.ts, rendered by
// components/overlays/WelcomeModal.vue. Every exported signature is unchanged:
// app/engine.ts still does `new WelcomeScreen(callbacks)` and app/menubarDef.ts
// still calls `.open()`. What moved is the DOM — including the iframe sandbox
// token list and the postMessage origin gate, which are copied into the
// component verbatim because they are the app's only guards on the one piece of
// remote content the webview embeds.

import { useDialogStore } from "../stores/dialogs";
import type { OpenOutcome } from "../io/files";
import { currentAccount } from "../tinkeratlas/client";

const SHOW_KEY = "sindri.welcomeOnStartup";
export function welcomeOnStartup(): boolean {
  return localStorage.getItem(SHOW_KEY) !== "false";
}

/** The footer checkbox. Split out so the component writes the same key rather
 *  than knowing the key's name. */
export function setWelcomeOnStartup(on: boolean): void {
  localStorage.setItem(SHOW_KEY, on ? "true" : "false");
}

const isTauri = () => "__TAURI_INTERNALS__" in window;

/** Open a URL in the system browser (Tauri opener; new tab in plain dev). */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export interface WelcomeCallbacks {
  onNew: () => void;
  onOpen: () => void;
  onOpenPath: (path: string) => Promise<OpenOutcome>;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** Kept as a class so app/engine.ts's construction site and the two `.open()`
 *  call sites are untouched. It is now three lines of store access. */
export class WelcomeScreen {
  constructor(cb: WelcomeCallbacks) {
    useDialogStore().bindWelcome(cb);
  }

  open(): void {
    useDialogStore().welcome = true;
  }

  close(): void {
    useDialogStore().welcome = false;
  }
}

/** Warm the account cache from disk at startup (Tauri only, never throws). */
export async function warmAccount(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { taAccount } = await import("../tinkeratlas/client");
    await taAccount();
  } catch {
    // cache stays signed-out; the welcome screen just shows "Sign in"
  }
}

/** True when the signed-in account row should offer publish etc. */
export function signedIn(): boolean {
  return currentAccount() !== null;
}
