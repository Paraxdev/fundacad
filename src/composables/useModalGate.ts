import { onMounted, onUnmounted } from "vue";
import { popModal, pushModal } from "../ui/choice";

/** Count this component's lifetime in the app-wide modal-depth gate.
 *
 *  `depth` (stores/modals.ts) is what toolBusy() reads through isChoiceOpen(),
 *  so a global shortcut — "e" for Extrude, say — cannot fire underneath an open
 *  dialog. The imperative dialogs called pushModal() in open() and popModal() on
 *  every dismissal path by hand, which is a leak waiting to happen: MISS one
 *  path and depth never returns to zero, toolBusy() stays true forever, and
 *  every tool in the app is silently dead with no error message.
 *
 *  Mounting is the one path that cannot be missed. The dialog components are
 *  rendered with v-if from App.vue, so mount == open and unmount == closed,
 *  once each, whatever route the user took to get there (button, Escape,
 *  backdrop click, or a resolve() from inside an async flow).
 *
 *  Deliberately NOT baked into the shared modal chrome: two of the converted
 *  dialogs (3D-mouse settings, filament mapping) never gated shortcuts, and
 *  changing that is behaviour, not layout. Opting in is one line and is visible
 *  in the component that owns the decision. */
export function useModalGate(): void {
  onMounted(pushModal);
  onUnmounted(popModal);
}
