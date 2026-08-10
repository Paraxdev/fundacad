// Publish the current design to TinkerAtlas as a 3D model (+ feed post when
// public). Pipeline: metadata form → sidecar exports into the Rust-owned
// staging dir (app_data/publish/) → viewport screenshot as the cover →
// Rust uploads everything to /api/desktop/publish with the desktop token.

import type { DocumentStore } from "../document/store";
import type { GeometryBackend } from "../geometry/client";
import type { Viewport } from "../viewport/viewport";
import { choose, listModal } from "../ui/choice";
import { useDialogStore } from "../stores/dialogs";
import { toast } from "../ui/toast";
import { openExternal } from "../ui/welcome";
import { openSignInDialog } from "./account";
import { currentAccount, taStagingPath, taPublish, asTaError } from "./client";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export interface PublishMeta {
  title: string;
  description: string;
  publish: boolean;
}

/** The metadata form. Facade over stores/dialogs.ts, rendered by
 *  components/overlays/PublishDialog.vue — the 88 lines of imperative DOM this
 *  replaces are in there, minus the esc() around the button label — that would
 *  double-escape now the label is an interpolation. */
function publishForm(defaultTitle: string): Promise<PublishMeta | null> {
  return useDialogStore().openPublishForm(defaultTitle);
}

export async function publishToTinkerAtlas(
  store: DocumentStore,
  geometry: GeometryBackend,
  viewport: Viewport,
): Promise<void> {
  if (!isTauri()) {
    toast("Publishing needs the native app", { kind: "error" });
    return;
  }
  const bodies = store.buildState.result?.bodies ?? [];
  if (!bodies.length) {
    toast("Nothing to publish yet — build a body first", { kind: "error" });
    return;
  }
  // publish requires an account; sign-in stays optional everywhere else.
  if (!currentAccount() && !(await openSignInDialog())) return;

  const fmt = await choose<"3mf" | "stl">("Publish — model format?", [
    { value: "3mf", label: "3MF", hint: "recommended" },
    { value: "stl", label: "STL" },
  ]);
  if (!fmt) return;

  const defaultTitle = store.fileName.replace(/\.sindri$/i, "") || "Untitled design";
  const meta = await publishForm(defaultTitle);
  if (!meta) return;

  toast("Publishing to TinkerAtlas…", { kind: "info" });
  try {
    const path = await taStagingPath(defaultTitle, fmt);
    const res = await geometry.export(store.document, fmt, path, {});
    if (!res.ok) {
      toast(`Export failed: ${res.message ?? "unknown error"}`, { kind: "error" });
      return;
    }
    if (res.warnings?.length) {
      // export-what-built: failed features are missing from the upload — say so
      // BEFORE it goes public, so the user can back out.
      const lines = res.warnings.map(
        (w) => `Warning: ${w.feature_id ?? "feature"} failed — its result is NOT in the upload: ${w.message}`,
      );
      await listModal("Publishing with warnings", lines);
    }

    const cover = viewport.screenshotPNG().replace(/^data:image\/png;base64,/, "");
    const { url } = await taPublish({
      title: meta.title,
      description: meta.description,
      publish: meta.publish,
      modelPath: res.path ?? path,
      coverPngBase64: cover,
    });
    toast(meta.publish ? "Published to TinkerAtlas" : "Saved to TinkerAtlas as a draft", {
      kind: "info",
      timeout: 10000,
      action: { label: "View on TinkerAtlas", onClick: () => void openExternal(url) },
    });
  } catch (e) {
    const ta = asTaError(e);
    if (ta?.code === "Unauthorized") {
      toast("TinkerAtlas sign-in expired or was revoked", {
        kind: "error",
        action: { label: "Sign in…", onClick: () => void openSignInDialog() },
      });
    } else if (ta?.code === "Unreachable") {
      toast("Can't reach TinkerAtlas — check your connection", { kind: "error" });
    } else {
      toast(`Publish failed: ${ta?.message ?? String(e)}`, { kind: "error" });
    }
  }
}
