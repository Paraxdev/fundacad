<script setup lang="ts">
import TitleBar from "./components/shell/TitleBar.vue";
import ViewportPane from "./components/shell/ViewportPane.vue";
import ToastStack from "./components/overlays/ToastStack.vue";
import ModalHost from "./components/overlays/ModalHost.vue";
import PrintStatusPill from "./components/overlays/PrintStatusPill.vue";
import ShortcutHud from "./components/overlays/ShortcutHud.vue";
import ContextMenuHost from "./components/overlays/ContextMenuHost.vue";
import InspectorPane from "./components/shell/InspectorPane.vue";
import CommandPalette from "./components/overlays/CommandPalette.vue";
import RibbonBar from "./components/shell/RibbonBar.vue";
import TimelineBar from "./components/shell/TimelineBar.vue";
import BrowserPane from "./components/shell/BrowserPane.vue";
import PropertiesPanel from "./components/overlays/PropertiesPanel.vue";
import InterferencePanel from "./components/overlays/InterferencePanel.vue";
import OverhangPanel from "./components/overlays/OverhangPanel.vue";
import CameraPanel from "./components/overlays/CameraPanel.vue";
import ParamsDialog from "./components/overlays/ParamsDialog.vue";
import WelcomeModal from "./components/overlays/WelcomeModal.vue";
import SpaceMouseModal from "./components/overlays/SpaceMouseModal.vue";
import SignInDialog from "./components/overlays/SignInDialog.vue";
import PublishDialog from "./components/overlays/PublishDialog.vue";
import BugReportButton from "./components/overlays/BugReportButton.vue";
import BugReportDialog from "./components/overlays/BugReportDialog.vue";
import FilamentMappingDialog from "./components/overlays/FilamentMappingDialog.vue";
import { useDialogStore } from "./stores/dialogs";

const dialogs = useDialogStore();
</script>

<template>
  <!-- The application shell, formerly the static markup inside <div id="app">
       in index.html. Element ids and class names are unchanged: every layout
       rule in src/styles/_layout.scss is id-scoped to these, and the e2e suite
       selects on them. -->
  <TitleBar />
  <RibbonBar />
  <div id="main">
    <BrowserPane />
    <ViewportPane />
    <InspectorPane />
  </div>
  <TimelineBar />

  <!-- Global overlays. Each Teleports to body, which is where the imperative
       versions appended themselves — they must not inherit a stacking context
       from #app's grid. -->
  <ToastStack />
  <ModalHost />
  <PrintStatusPill />
  <ShortcutHud />
  <ContextMenuHost />
  <CommandPalette />

  <!-- Floating "measure-panel" popups. Independent of one another: Properties
       and the Overhang settings are legitimately on screen together. -->
  <PropertiesPanel />
  <InterferencePanel />
  <OverhangPanel />
  <CameraPanel />
  <ParamsDialog />

  <!-- Modal dialogs. v-if rather than an `open` prop on purpose: mount IS open
       and unmount IS closed, which is what lets the ones that gate global
       shortcuts push/pop the modal depth in onMounted/onUnmounted and never
       leak a count (composables/useModalGate.ts). They are independent because
       they genuinely stack — the welcome screen opens sign-in over itself. -->
  <WelcomeModal v-if="dialogs.welcome && dialogs.welcomeCallbacks" />
  <SpaceMouseModal v-if="dialogs.spaceMouse" />
  <SignInDialog v-if="dialogs.signIn" :req="dialogs.signIn" />
  <PublishDialog v-if="dialogs.publish" :req="dialogs.publish" />
  <FilamentMappingDialog v-if="dialogs.filament" :req="dialogs.filament" />
  <BugReportButton />
  <BugReportDialog v-if="dialogs.bugReport && dialogs.bugDeps" />
</template>
