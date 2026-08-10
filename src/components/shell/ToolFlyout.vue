<script setup lang="ts">
// The variant list a rail button opens: every way of starting the same tool,
// with the current default marked.
//
// It runs nothing itself. The rows are targets, not handlers — the parent owns
// one window-level pointerup and reads whichever row the pointer came up over
// (that is what the data-rail-* attributes are for), because the gesture that
// picks a variant STARTS on the button and ENDS here, and a per-row click
// handler would only ever see the second half of it.
//
// Teleported to body and fixed-positioned for the same reason RibbonPopup is:
// the rail is a scrolling grid column, so anything drawn inside it is clipped.
// The placement maths stays imperative on a measured rect — happy-dom reports
// all zeros for getBoundingClientRect, so it is e2e/manual territory.

import { onMounted, useTemplateRef } from "vue";
import Icon from "./Icon.vue";
import type { RailGroup } from "../../ui/toolRail";

const props = defineProps<{
  group: RailGroup;
  /** The rail button this hangs off. */
  anchor: HTMLElement;
  /** Action of the tool currently on the button face, marked in the list. */
  current: string;
}>();

const el = useTemplateRef<HTMLElement>("el");

function place() {
  const pop = el.value;
  if (!pop) return;
  const r = props.anchor.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.left = `${r.right + 6}px`;
  // Top-aligned with the button, then pulled up only as far as it must be to
  // stay on screen: a flyout that opened centred would move the row under the
  // pointer with the length of the list, so the same hold would land on a
  // different variant depending on how many there are.
  const h = pop.offsetHeight || props.group.items.length * 32 + 28;
  pop.style.top = `${Math.max(4, Math.min(r.top, window.innerHeight - h - 4))}px`;
}

onMounted(place);
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="rail-flyout" role="menu" :aria-label="group.label">
      <div class="rail-flyout-label">{{ group.label }}</div>
      <button
        v-for="it in group.items"
        :key="it.action"
        type="button"
        class="rail-flyout-item"
        :class="{ current: it.action === current }"
        :data-rail-group="group.id"
        :data-rail-action="it.action"
        role="menuitemradio"
        :aria-checked="it.action === current"
        tabindex="-1"
      >
        <Icon :name="it.iconName" :size="18" />
        <span>{{ it.label }}</span>
        <Icon v-if="it.action === current" class="rail-flyout-check" name="check" :size="13" />
      </button>
    </div>
  </Teleport>
</template>
