<script setup lang="ts">
// Welcome screen — opens at startup (unless turned off) and from the
// TinkerAtlas menu. Left column: local actions (New / Open / recent files) and
// the TinkerAtlas account row. Right pane: the remote
// tinkeratlas.com/sindricad/welcome page in an iframe — the ONLY remote content
// the webview embeds (CSP frame-src allows exactly that origin; connect-src
// stays localhost-only, so reachability is probed through Rust's ta_ping).

import { onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useDialogStore } from "../../stores/dialogs";
import { useModalGate } from "../../composables/useModalGate";
import { openExternal, welcomeOnStartup, setWelcomeOnStartup } from "../../ui/welcome";
import { forgetRecent, getRecentFiles, type RecentFile } from "../../io/recentFiles";
import ModalFrame from "./ModalFrame.vue";
import logoUrl from "../../../assets/brand/sindricad-lockup-app.svg";
import {
  TA_WELCOME_URL,
  onAccountChange,
  taAvatar,
  taPing,
  type TaUser,
} from "../../tinkeratlas/client";

const isTauri = () => "__TAURI_INTERNALS__" in window;

const dialogs = useDialogStore();
// Non-null whenever this component is rendered: App.vue gates it on the same
// field, because a welcome screen with no callbacks has nothing to do.
const cb = dialogs.welcomeCallbacks!;

const close = () => { dialogs.welcome = false; };

// pushModal/popModal, tied to mount rather than to open()/close(). See
// useModalGate — this is the one that must not be got wrong.
useModalGate();

// --- iframe → app link opening (cross-repo contract) -------------------------
// The embedded page can't open windows (the Tauri shell blocks new-window
// requests), so its links post {type:"open-url", url} to the parent. Trust
// gate: the message must come from the welcome page's own origin and the URL
// must lead back into that origin — anything else is dropped.
function onMessage(e: MessageEvent): void {
  const welcomeOrigin = new URL(TA_WELCOME_URL).origin;
  if (e.origin !== welcomeOrigin) return;
  const data = e.data as { type?: string; url?: string } | null;
  if (!data || data.type !== "open-url" || typeof data.url !== "string") return;
  if (data.url !== welcomeOrigin && !data.url.startsWith(`${welcomeOrigin}/`)) return;
  void openExternal(data.url);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  }
}

// --- recent files (paths only exist in the native app) ---
const recents = ref<RecentFile[]>(getRecentFiles());
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const dirName = (path: string) => path.split(/[\\/]/).slice(0, -1).join("/");

async function openRecent(path: string) {
  const outcome = await cb.onOpenPath(path);
  if (outcome === "ok") {
    close();
  } else if (outcome === "unreadable") {
    forgetRecent(path); // gone from disk — drop it so it stops teasing
    recents.value = recents.value.filter((r) => r.path !== path);
  }
  // "newerFormat": the file is fine, we're too old. Keep the row — it's how
  // the user finds the file again after updating.
}

// --- account row — kept live via the client's account cache ---
const user = shallowRef<TaUser | null>(null);
const avatar = ref<string | null>(null);
let unsubAccount: (() => void) | null = null;

// --- right pane: probe first, then commit to the frame ---
// A cross-origin iframe never reports load failures, so reachability is probed
// natively (Rust) before the frame is created at all.
const remote = ref<"probing" | "frame" | "offline">(isTauri() ? "probing" : "frame");
async function probe() {
  remote.value = "probing";
  remote.value = (await taPing()) ? "frame" : "offline";
}

// --- footer ---
const showOnStartup = ref(welcomeOnStartup());
watch(showOnStartup, setWelcomeOnStartup);

onMounted(() => {
  window.addEventListener("message", onMessage);
  window.addEventListener("keydown", onKey, true);
  unsubAccount = onAccountChange((u) => {
    user.value = u;
    avatar.value = null;
    if (u && isTauri()) {
      void taAvatar().then((dataUrl) => {
        if (dataUrl) avatar.value = dataUrl;
      });
    }
  });
  if (isTauri()) void probe();
});

onUnmounted(() => {
  window.removeEventListener("message", onMessage);
  window.removeEventListener("keydown", onKey, true);
  unsubAccount?.();
  unsubAccount = null;
});
</script>

<template>
  <ModalFrame panel-class="welcome-panel" @close="close()">
    <template #title>
      <img :src="logoUrl" alt="SindriCAD" class="welcome-logo" />
    </template>

    <div class="modal-body welcome-body">
      <div class="welcome-left">
        <div class="welcome-actions">
          <button class="choice-btn choice-primary" @click="close(); cb.onNew()">
            <span>New Document</span>
          </button>
          <button class="choice-btn" @click="close(); cb.onOpen()">
            <span>Open…</span>
          </button>
        </div>

        <template v-if="recents.length">
          <div class="welcome-section">Recent</div>
          <div class="welcome-recents">
            <!-- no esc(): interpolation escapes, and a second pass would render
                 a file called "Bracket & Plate.sindri" as "Bracket &amp; Plate". -->
            <button
              v-for="r in recents"
              :key="r.path"
              class="welcome-recent"
              :title="r.path"
              @click="openRecent(r.path)"
            >
              <span class="welcome-recent-name">{{ baseName(r.path) }}</span>
              <span class="welcome-recent-dir">{{ dirName(r.path) }}</span>
            </button>
          </div>
        </template>

        <div class="welcome-account">
          <button v-if="!user" class="choice-btn" @click="cb.onSignIn()">
            <span>Sign in with TinkerAtlas</span>
          </button>
          <div v-else class="welcome-user">
            <img class="welcome-avatar" alt="" :src="avatar ?? undefined" />
            <span>{{ user.display_name || user.username }}</span>
            <button class="welcome-signout" @click="cb.onSignOut()">Sign out</button>
          </div>
        </div>
      </div>

      <div class="welcome-remote">
        <!-- The sandbox token list is a security boundary, not a style choice:
             the page runs with its own (cross-)origin; no popups, no
             top-navigation. Keep it exactly as it is. -->
        <iframe
          v-if="remote === 'frame'"
          class="welcome-frame"
          :src="TA_WELCOME_URL"
          sandbox="allow-scripts allow-same-origin allow-forms"
        ></iframe>
        <div v-else-if="remote === 'probing'" class="welcome-offline">
          <p>Connecting to TinkerAtlas…</p>
        </div>
        <div v-else class="welcome-offline">
          <p>TinkerAtlas is unreachable — you're offline or the service is down.</p>
          <button class="choice-btn" @click="probe()"><span>Retry</span></button>
        </div>
      </div>
    </div>

    <div class="welcome-foot">
      <label class="welcome-startup">
        <input v-model="showOnStartup" type="checkbox" />
        Show this screen on startup
      </label>
    </div>
  </ModalFrame>
</template>
