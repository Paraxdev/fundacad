<script setup lang="ts">
// TinkerAtlas sign-in. Primary flow: "Sign in" / "Create account" open the
// system browser at tinkeratlas.com's own login or signup (Google login and
// all), and the app completes automatically when the user clicks Authorize
// (loopback callback — see tinkeratlas.rs). No tokens are shown to the user;
// pasting a desktop token remains a tucked-away fallback for machines where the
// browser handoff can't work.

import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import type { SignInReq } from "../../stores/dialogs";
import { useModalGate } from "../../composables/useModalGate";
import { toast } from "../../ui/toast";
import {
  asTaError,
  taAccount,
  taBrowserSignIn,
  taSignIn,
  type TaUser,
} from "../../tinkeratlas/client";

const props = defineProps<{ req: SignInReq }>();

useModalGate();

/** True from the moment the browser round-trip starts until it finishes or the
 *  user cancels. Cancelling clears it so a late resolve/reject is ignored. */
const waiting = ref(false);
const error = ref("");
const tokenOpen = ref(false);
const token = ref("");
const tokenBusy = ref(false);

const signInBtn = useTemplateRef<HTMLButtonElement>("signInBtn");
const tokenInput = useTemplateRef<HTMLInputElement>("tokenInput");

function showError(e: unknown) {
  const ta = asTaError(e);
  error.value =
    ta?.code === "Unauthorized"
      ? "TinkerAtlas didn't accept the sign-in — try again."
      : ta?.code === "Unreachable"
        ? "Can't reach TinkerAtlas — check your connection and retry."
        : `Sign-in failed: ${ta?.message ?? String(e)}`;
}

/** Resolving clears the store slot, which unmounts this component — and that
 *  unmount is what pops the modal-depth gate. */
function done(user: TaUser | null) {
  const wasWaiting = waiting.value;
  waiting.value = false;
  props.req.resolve(user);
  if (user) {
    toast(`Signed in as ${user.display_name || user.username}`, { kind: "info" });
  } else if (wasWaiting) {
    // the browser round-trip may still complete after cancel — pick the
    // account up from disk so the UI stays truthful either way.
    setTimeout(() => void taAccount().catch(() => {}), 2000);
  }
}

async function browserFlow(signup: boolean) {
  error.value = "";
  waiting.value = true;
  try {
    const user = await taBrowserSignIn(signup);
    if (waiting.value) done(user);
  } catch (e) {
    if (!waiting.value) return; // dialog already cancelled — ignore the timeout
    waiting.value = false;
    showError(e);
  }
}

async function tokenFlow() {
  const t = token.value.trim();
  if (!t) {
    error.value = "Paste the token first.";
    return;
  }
  tokenBusy.value = true;
  error.value = "";
  try {
    done(await taSignIn(t));
  } catch (e) {
    showError(e);
    tokenBusy.value = false;
  }
}

async function toggleToken() {
  tokenOpen.value = !tokenOpen.value;
  if (!tokenOpen.value) return;
  await nextTick(); // v-show flips display before the field can take focus
  tokenInput.value?.focus();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    done(null);
    return;
  }
  if (e.key === "Enter" && tokenOpen.value && document.activeElement === tokenInput.value) {
    e.preventDefault();
    e.stopImmediatePropagation();
    void tokenFlow();
    return;
  }
  // typing reaches the input; global shortcuts stay gated by useModalGate.
  e.stopPropagation();
}

onMounted(() => {
  window.addEventListener("keydown", onKey, true);
  signInBtn.value?.focus();
});
onUnmounted(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <Teleport to="body">
    <div class="choice-backdrop" @pointerdown.self="done(null)">
      <div class="choice-card ta-signin">
        <div class="choice-title">Connect to TinkerAtlas</div>
        <p class="ta-signin-hint">
          Publish your designs straight from SindriCAD with your TinkerAtlas account.
        </p>

        <!-- main view: two big actions + hidden token fallback -->
        <div v-show="!waiting">
          <button ref="signInBtn" class="choice-btn choice-primary" @click="browserFlow(false)">
            <span>Sign in with TinkerAtlas</span>
          </button>
          <button class="choice-btn" @click="browserFlow(true)">
            <span>Create a free account</span>
          </button>

          <div class="ta-signin-error">{{ error }}</div>

          <!-- token fallback, folded away behind a small link.
               v-show, not the `hidden` property the class used: .ta-signin-
               tokenrow sets display:flex, and an author declaration beats the
               UA's [hidden] rule, so the row this was meant to fold away was
               in fact always on screen. -->
          <button class="ta-signin-alt" @click="toggleToken()">
            Have a desktop token? Paste it instead
          </button>
          <div v-show="tokenOpen" class="ta-signin-tokenrow">
            <input
              ref="tokenInput"
              v-model="token"
              class="ta-signin-input"
              type="password"
              placeholder="ta_scad_…"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="choice-btn" :disabled="tokenBusy" @click="tokenFlow()">
              <span>Use token</span>
            </button>
          </div>
        </div>

        <!-- waiting view: shown while the browser round-trip is in flight -->
        <div v-show="waiting" class="ta-signin-waiting">
          <p>Finish signing in in your <strong>browser</strong>.</p>
          <p class="ta-signin-hint">
            This dialog completes automatically when you click
            <em>Authorize SindriCAD</em>. Creating an account first? Take your time —
            if this times out, just press Sign in again afterwards.
          </p>
        </div>

        <div class="choice-row">
          <button class="choice-btn" @click="done(null)"><span>Cancel</span></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
