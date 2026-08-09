// Modify → Parameters. The dialog itself is
// components/overlays/ParamsDialog.vue; this is the one-line facade its callers
// (app/actions.ts, the menubar) still go through.

import { usePanelsStore } from "../stores/panels";

export function openParamsDialog(): void {
  usePanelsStore().params = true;
}
