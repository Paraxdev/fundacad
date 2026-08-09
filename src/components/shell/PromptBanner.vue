<script setup lang="ts">
import { usePromptStore } from "../../stores/prompt";

const prompt = usePromptStore();
</script>

<template>
  <!-- `.hidden` rather than v-if: the element stays in the DOM so the CSS
       transition on .prompt still runs, exactly as when ui/prompt.ts toggled
       the class by hand. -->
  <div id="prompt" class="prompt" :class="{ hidden: !prompt.text }">{{ prompt.text }}</div>
</template>
