<script setup lang="ts">
import TitleBar from "./components/shell/TitleBar.vue";
import ViewportPane from "./components/shell/ViewportPane.vue";
import ToastStack from "./components/overlays/ToastStack.vue";
import ModalHost from "./components/overlays/ModalHost.vue";
import PrintStatusPill from "./components/overlays/PrintStatusPill.vue";
import ShortcutHud from "./components/overlays/ShortcutHud.vue";
import ContextMenuHost from "./components/overlays/ContextMenuHost.vue";
import InspectorPane from "./components/shell/InspectorPane.vue";
import LeftToolbar from "./components/shell/LeftToolbar.vue";
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
import SketchDimLayer from "./components/overlays/SketchDimLayer.vue";
import SketchGlyphLayer from "./components/overlays/SketchGlyphLayer.vue";
import TextToolPanel from "./components/overlays/TextToolPanel.vue";
import ProjectFilterBar from "./components/overlays/ProjectFilterBar.vue";
import TextureToolPanel from "./components/overlays/TextureToolPanel.vue";
import MeasureReadout from "./components/overlays/MeasureReadout.vue";
import { useDialogStore } from "./stores/dialogs";
import { useToolPanelStore } from "./stores/toolPanels";

const dialogs = useDialogStore();
const toolPanels = useToolPanelStore();
</script>

<template>
  <!-- The application shell, formerly the static markup inside <div id="app">
       in index.html. Element ids and class names are unchanged: every layout
       rule in src/styles/_layout.scss is id-scoped to these, and the e2e suite
       selects on them. -->
  <TitleBar />
  <RibbonBar />
  <div id="main">
    <!-- The tool rail is a COLUMN of #main, not an overlay on the viewport: it
         must never cover geometry, and the viewport's bottom-left corner is
         already spoken for by the view-control pill. It is additive — the
         ribbon above still carries every tool, including the ones the rail
         folds into a hold-to-open flyout. -->
    <LeftToolbar />
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
  <MeasureReadout />

  <!-- In-canvas overlays, driven entirely by imperative tool code through the
       facades in sketch/ and features/. The two annotation LAYERS are always
       mounted (they render nothing until a sketch is open) because each owns a
       rAF reprojection loop it starts and stops itself; the three tool PANELS
       are v-if'd and keyed, so reopening a tool remounts one with fresh form
       state instead of needing a reset path. -->
  <SketchDimLayer />
  <SketchGlyphLayer />
  <TextToolPanel v-if="toolPanels.text" :key="toolPanels.text.id" :req="toolPanels.text" />
  <ProjectFilterBar v-if="toolPanels.projectAnchor" />
  <TextureToolPanel v-if="toolPanels.texture" :key="toolPanels.texture.id" :req="toolPanels.texture" />

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
