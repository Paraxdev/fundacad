import { computed, type ComputedRef } from "vue";
import { useEngine } from "./engineKey";
import type { RebuildState } from "../document/store";
import type { CadDocument } from "../types";

/** Derive a value from the live document.
 *
 *  THIS IS THE ONLY SANCTIONED WAY FOR A COMPONENT TO READ store.document.
 *
 *  The shape is not incidental. `store.document` returns the same object
 *  identity across in-place mutate() — identity only changes on New/Open/undo/
 *  redo — and Vue 3.4+ computeds short-circuit propagation when a recomputed
 *  value is === the previous one. So a convenience wrapper like
 *
 *      const doc = computed(() => (bridge.docVersion.value, store.document));
 *
 *  would re-run on every edit and then REFUSE TO NOTIFY its dependents, because
 *  the document object it returns is unchanged. Panels derived from it would
 *  silently freeze on every in-place edit and only "wake up" on undo or load.
 *  That bug is invisible to a happy-path smoke test.
 *
 *  Reading the version ref inside each derived computed — before any early
 *  return — is what avoids it. This helper makes that structural.
 *
 *  Two more rules that follow from the same fact:
 *    * never cache store.document in setup() scope (identity DOES change on
 *      New/Open/undo/redo, so a cached reference goes stale with no error);
 *    * never write a Feature built out of reactive state back to the store.
 */
export function useDocValue<T>(fn: (doc: CadDocument) => T): ComputedRef<T> {
  const { store, bridge } = useEngine();
  return computed(() => {
    bridge.docVersion.value; // tracked dependency — read FIRST, unconditionally
    return fn(store.document); // the live, RAW object
  });
}

/** Same contract, against the latest rebuild result. */
export function useBuildValue<T>(fn: (b: RebuildState) => T): ComputedRef<T> {
  const { store, bridge } = useEngine();
  return computed(() => {
    bridge.buildVersion.value;
    return fn(store.buildState);
  });
}

/** Same contract, against file path / dirty state. */
export function useMetaValue<T>(fn: (s: { fileName: string; dirty: boolean }) => T): ComputedRef<T> {
  const { store, bridge } = useEngine();
  return computed(() => {
    bridge.metaVersion.value;
    return fn({ fileName: store.fileName, dirty: store.dirty });
  });
}
