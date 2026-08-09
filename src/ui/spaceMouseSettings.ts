// 3D-Mouse settings modal.
//
// Facade over stores/dialogs.ts, rendered by
// components/overlays/SpaceMouseModal.vue. The class survives so app/engine.ts's
// `new SpaceMouseSettings()` and app/menubarDef.ts's `.open()` are untouched.
//
// Everything that made this file 345 lines — the imperative DOM build, the live
// axis bars and the embedded THREE.WebGLRenderer test cube — is in the
// component. The readout half is still imperative there, for the same reason it
// was here: it runs at device report rate and at 60 fps.

import { useDialogStore } from "../stores/dialogs";

export class SpaceMouseSettings {
  open(): void {
    useDialogStore().spaceMouse = true;
  }

  close(): void {
    useDialogStore().spaceMouse = false;
  }
}
