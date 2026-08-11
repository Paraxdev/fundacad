import { defineStore } from "pinia";
import { markRaw, ref, shallowRef } from "vue";
import type { WelcomeCallbacks } from "../ui/welcome";
import type { BugReportDeps } from "../ui/bugReporter";
import type { PublishMeta } from "../tinkeratlas/publish";
import type { TaUser } from "../tinkeratlas/client";
import type { LogicalSlot, MappingResult } from "../print/printDialog";
import type { ToolheadFilament } from "../print/printerClient";

/** Open/closed state for the app-level dialogs that used to build their own
 *  DOM. Each exported opener in ui/ and tinkeratlas/ is now a facade over a field
 *  here; the markup lives in components/overlays/*.vue.
 *
 *  Independent fields rather than one `activeDialog` discriminant, because they
 *  legitimately stack: the welcome screen opens sign-in on top of itself, and
 *  publish opens sign-in before its own form.
 *
 *  Dialogs that gate global shortcuts do it in their component's onMounted/
 *  onUnmounted (composables/useModalGate.ts), NOT here — a store field can be
 *  written from anywhere, including twice, while a mount happens exactly once and
 *  its unmount cannot be forgotten.
 *
 *  markRaw everywhere a value lands here: every request holds a `resolve` closure,
 *  and welcomeCallbacks / bugDeps close over the whole engine graph. None of it may
 *  become a Proxy. */

export interface SignInReq {
  resolve: (user: TaUser | null) => void;
}

export interface PublishReq {
  defaultTitle: string;
  resolve: (meta: PublishMeta | null) => void;
}

export interface FilamentReq {
  slots: LogicalSlot[];
  toolheads: ToolheadFilament[];
  resolve: (result: MappingResult | null) => void;
}

export const useDialogStore = defineStore("dialogs", () => {
  const welcome = ref(false);
  const spaceMouse = ref(false);
  const bugReport = ref(false);
  const preferences = ref(false);

  const signIn = shallowRef<SignInReq | null>(null);
  const publish = shallowRef<PublishReq | null>(null);
  const filament = shallowRef<FilamentReq | null>(null);

  /** Supplied once by app/engine.ts's mountUi(). Until they arrive the welcome
   *  screen has nothing to call and the bug button has nothing to report on, so
   *  both components stay unrendered. */
  const welcomeCallbacks = shallowRef<WelcomeCallbacks | null>(null);
  const bugDeps = shallowRef<BugReportDeps | null>(null);

  let signInPending: Promise<TaUser | null> | null = null;

  /** Sign-in has two callers that can genuinely race — the menubar/welcome
   *  button and the publish flow's "you need an account first" step, plus the
   *  "sign-in expired" toast action. The imperative version stacked a second
   *  backdrop with a second capture-phase key trap over the first, and only the
   *  top one was dismissible. Share the in-flight promise instead: both callers
   *  get the one answer the user actually gives. */
  function openSignIn(): Promise<TaUser | null> {
    if (signInPending) return signInPending;
    signInPending = new Promise<TaUser | null>((resolve) => {
      signIn.value = markRaw<SignInReq>({
        resolve: (user) => {
          signIn.value = null;
          signInPending = null;
          resolve(user);
        },
      });
    });
    return signInPending;
  }

  function openPublishForm(defaultTitle: string): Promise<PublishMeta | null> {
    return new Promise<PublishMeta | null>((resolve) => {
      publish.value = markRaw<PublishReq>({
        defaultTitle,
        resolve: (meta) => {
          publish.value = null;
          resolve(meta);
        },
      });
    });
  }

  function openFilamentMapping(
    slots: LogicalSlot[],
    toolheads: ToolheadFilament[],
  ): Promise<MappingResult | null> {
    return new Promise<MappingResult | null>((resolve) => {
      filament.value = markRaw<FilamentReq>({
        slots,
        toolheads,
        resolve: (result) => {
          filament.value = null;
          resolve(result);
        },
      });
    });
  }

  return {
    welcome,
    spaceMouse,
    bugReport,
    preferences,
    signIn,
    publish,
    filament,
    welcomeCallbacks,
    bugDeps,
    openSignIn,
    openPublishForm,
    openFilamentMapping,
    bindWelcome: (cb: WelcomeCallbacks) => { welcomeCallbacks.value = markRaw(cb); },
    bindBugReporter: (deps: BugReportDeps) => { bugDeps.value = markRaw(deps); },
  };
});
