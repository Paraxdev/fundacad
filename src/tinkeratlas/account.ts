// TinkerAtlas sign-in / sign-out.
//
// The sign-in dialog is components/overlays/SignInDialog.vue; this is the
// facade, and openSignInDialog()'s Promise<TaUser | null> contract is unchanged
// — app/menubarDef.ts, the welcome screen and publish.ts all still await it.
//
// signOutFlow() never built DOM of its own: it has always been a choose() plus
// two toasts, both of which became Vue in step 4.

import { choose } from "../ui/choice";
import { toast } from "../ui/toast";
import { useDialogStore } from "../stores/dialogs";
import { taSignOut, asTaError, currentAccount, type TaUser } from "./client";

export function openSignInDialog(): Promise<TaUser | null> {
  return useDialogStore().openSignIn();
}

export async function signOutFlow(): Promise<void> {
  const user = currentAccount();
  if (!user) return;
  const pick = await choose<"out" | "stay">(`Sign out of TinkerAtlas (${user.username})?`, [
    { value: "out", label: "Sign out" },
    { value: "stay", label: "Cancel" },
  ]);
  if (pick !== "out") return;
  try {
    await taSignOut();
    toast("Signed out of TinkerAtlas", { kind: "info" });
  } catch (e) {
    toast(`Sign-out failed: ${asTaError(e)?.message ?? String(e)}`, { kind: "error" });
  }
}
