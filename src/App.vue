<script setup lang="ts">
import TitleBar from "./components/shell/TitleBar.vue";
import ViewportPane from "./components/shell/ViewportPane.vue";
</script>

<template>
  <!-- The application shell, formerly the static markup inside <div id="app">
       in index.html. Element ids and class names are unchanged: every layout
       rule in src/styles/_layout.scss is id-scoped to these, and the e2e suite
       selects on them.

       The empty <div>s are mount points for the panels that are still
       imperative classes (ui/ribbon.ts, ui/browserTree.ts, ui/inspector.ts,
       ui/timeline.ts, ui/menu.ts, ui/sketchPalette.ts). app/engine.ts's
       mountUi() runs immediately after app.mount() and constructs them into
       these nodes by id, exactly as main.ts used to. Each one disappears from
       here as its component is converted. -->
  <TitleBar />
  <div id="ribbon"></div>
  <div id="main">
    <aside id="browser"></aside>
    <ViewportPane />
    <aside id="inspector"></aside>
  </div>
  <footer id="timeline"></footer>
</template>
