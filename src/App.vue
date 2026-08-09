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
import PropertiesPanel from "./components/overlays/PropertiesPanel.vue";
import InterferencePanel from "./components/overlays/InterferencePanel.vue";
import OverhangPanel from "./components/overlays/OverhangPanel.vue";
import CameraPanel from "./components/overlays/CameraPanel.vue";
import ParamsDialog from "./components/overlays/ParamsDialog.vue";
</script>

<template>
  <!-- The application shell, formerly the static markup inside <div id="app">
       in index.html. Element ids and class names are unchanged: every layout
       rule in src/styles/_layout.scss is id-scoped to these, and the e2e suite
       selects on them.

       The empty <div>s are mount points for the panels that are still
       imperative classes (ui/browserTree.ts, ui/timeline.ts,
       ui/menu.ts). app/engine.ts's
       mountUi() runs immediately after app.mount() and constructs them into
       these nodes by id, exactly as main.ts used to. Each one disappears from
       here as its component is converted. -->
  <TitleBar />
  <RibbonBar />
  <div id="main">
    <aside id="browser"></aside>
    <ViewportPane />
    <InspectorPane />
  </div>
  <footer id="timeline"></footer>

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
</template>
