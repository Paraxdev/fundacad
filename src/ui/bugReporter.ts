// In-app bug reporter: a floating bug button (bottom-right) opening a small
// report dialog. Sends description + auto-collected diagnostics through the
// native ta_bug_report command (webview never dials out; redaction happens in
// Rust before anything leaves the machine). Works with the sidecar DEAD and
// signed out — that's the primary use case. On ANY failed submit (network,
// rejection, endpoint not deployed yet) the report is offered to the
// clipboard so it is never lost.
//
// The button is components/overlays/BugReportButton.vue and the dialog is
// BugReportDialog.vue. What stays here is everything that is NOT markup: what a
// report contains, how it is assembled, and the clipboard fallback. The
// component owns the form fields and calls submitBugReport().

import type { DocumentStore } from "../document/store";
import type { GeometryBackend } from "../geometry/client";
import { toast } from "./toast";
import { breadcrumbs } from "../diagnostics/breadcrumbs";
import { taBugReport, asTaError } from "../tinkeratlas/client";
import { useDialogStore } from "../stores/dialogs";
import type { Viewport } from "../viewport/viewport";
import type { SketchMode } from "../sketch/sketchMode";
import type { Feature } from "../types";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export interface BugReportDeps {
  store: DocumentStore;
  geometry: GeometryBackend;
  viewport: Viewport;
  sketch: SketchMode;
}

/** What the dialog is willing to send, as the user has ticked it. */
export interface BugReportForm {
  description: string;
  includeLog: boolean;
  includeDocument: boolean;
  version: string;
  /** Both snapshotted when the dialog opened — the crumbs so that filling the
   *  form in doesn't push the interesting events off the end of the list, and
   *  `connected` so the report says what the sidecar was doing when the user
   *  decided something was wrong, not when they finished typing. */
  connected: boolean;
  crumbs: string[];
}

/** Registers the reporter's engine handles. The floating button renders once
 *  these exist; app/engine.ts's mountUi() call site is unchanged. */
export function createBugReporter(deps: BugReportDeps): void {
  useDialogStore().bindBugReporter(deps);
}

/** The context line collected at OPEN time.
 *
 *  Scene stats come FIRST: they answer the questions a performance report
 *  always raises (how many triangles, how big the canvas, what frame rate), and
 *  leading the list keeps them inside the server's breadcrumb cap. */
export function bugContext(deps: BugReportDeps): { connected: boolean; crumbs: string[] } {
  return {
    connected: deps.geometry.connected,
    crumbs: [...deps.viewport.sceneStats(), ...breadcrumbs()],
  };
}

/** The document as the user sees it, including a sketch still being drawn.
 *  `store.toJSON()` alone is the COMMITTED document: an open sketch has not
 *  reached it yet, so a report filed from inside the sketcher carried a stale
 *  sketch, or none at all when it was the first. */
function documentWithOpenSketch(store: DocumentStore, live: Feature | null): string {
  if (!live) return store.toJSON();
  const doc = JSON.parse(store.toJSON());
  const i = doc.features.findIndex((f: Feature) => f.id === live.id);
  if (i >= 0) doc.features[i] = live;
  else doc.features.push(live);
  return JSON.stringify(doc);
}

/** Says the report came from inside the sketcher. Worth recording even when
 *  the document is NOT attached: it tells the triager the repro starts by
 *  opening a sketch, which no other field carries. */
function openSketchCrumb(store: DocumentStore, live: Feature | null): string | null {
  if (!live) return null;
  const isEdit = JSON.parse(store.toJSON()).features.some((f: Feature) => f.id === live.id);
  const ents = live.type === "sketch" ? live.entities.length : 0;
  const cons = live.type === "sketch" ? (live.constraints?.length ?? 0) : 0;
  return `sketch OPEN when reported (${isEdit ? `editing ${live.id}` : "new, uncommitted"}): ` +
    `${ents} entities, ${cons} constraints`;
}

async function copyFallback(
  description: string,
  version: string,
  connected: boolean,
  crumbs: string[],
): Promise<boolean> {
  const text = [
    `SindriCAD bug report`,
    `version: ${version} · ${navigator.userAgent.slice(0, 80)}`,
    `geometry engine connected: ${connected}`,
    ``,
    description,
    ``,
    `recent events:`,
    ...crumbs.map((c) => `  ${c}`),
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Send the report (or copy it, outside Tauri). Resolves true when the dialog
 *  should close.
 *
 *  A FAILED submit deliberately leaves the dialog open: the clipboard copy is a
 *  fallback, not a substitute, and the user may want to retry or edit. */
export async function submitBugReport(deps: BugReportDeps, form: BugReportForm): Promise<boolean> {
  const { store, sketch } = deps;
  const live = sketch.snapshotFeature();
  const sketchCrumb = openSketchCrumb(store, live);
  // prepended, not appended: the server caps the breadcrumb list, and the
  // same reasoning that puts scene stats first applies here. Used by the
  // clipboard fallback too, so an offline report keeps the context.
  const crumbList = sketchCrumb ? [sketchCrumb, ...form.crumbs] : form.crumbs;
  const connected = form.connected;
  const payload = {
    description: form.description,
    appVersion: form.version,
    sidecarConnected: connected,
    includeLog: form.includeLog,
    breadcrumbs: crumbList,
    ...(form.includeDocument ? { documentJson: documentWithOpenSketch(store, live) } : {}),
  };
  if (!isTauri()) {
    await copyFallback(form.description, form.version, connected, crumbList);
    return true;
  }
  try {
    const res = await taBugReport(payload);
    toast(
      res.deduplicated
        ? "Thanks — this matches a known report; the existing one was updated."
        : "Bug report sent. Thank you!",
      { kind: "info" },
    );
    return true;
  } catch (e) {
    // ANY failure (unreachable, rejected, endpoint missing): never lose
    // the report — offer the clipboard path.
    const te = asTaError(e);
    const copied = await copyFallback(form.description, form.version, connected, crumbList);
    toast(
      `Couldn't send the report${te ? `: ${te.message}` : ""}.` +
        (copied ? " A copy is on your clipboard — paste it in the SindriCAD Discord." : ""),
      { kind: "error", timeout: 10000 },
    );
    return false;
  }
}
