<script setup lang="ts">
// The metadata form step of "Publish to TinkerAtlas" — title, description and
// public-vs-draft. Everything around it (format choice, export, screenshot,
// upload, warnings) stays in tinkeratlas/publish.ts; this is only the form.

import { onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import type { PublishReq } from "../../stores/dialogs";
import { useModalGate } from "../../composables/useModalGate";

const props = defineProps<{ req: PublishReq }>();

useModalGate();

const title = ref(props.req.defaultTitle);
const description = ref("");
const publicPost = ref(true);
const error = ref("");

const titleInput = useTemplateRef<HTMLInputElement>("titleInput");
const descInput = useTemplateRef<HTMLTextAreaElement>("descInput");

function submit() {
  const t = title.value.trim();
  if (t.length < 3) {
    error.value = "Title needs at least 3 characters.";
    titleInput.value?.focus();
    return;
  }
  props.req.resolve({ title: t, description: description.value.trim(), publish: publicPost.value });
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    props.req.resolve(null);
    return;
  }
  // Enter commits, except inside the description — that field is multi-line.
  if (e.key === "Enter" && document.activeElement !== descInput.value) {
    e.preventDefault();
    e.stopImmediatePropagation();
    submit();
    return;
  }
  // typing reaches the fields; global shortcuts stay gated by useModalGate.
  e.stopPropagation();
}

onMounted(() => {
  window.addEventListener("keydown", onKey, true);
  titleInput.value?.focus();
  titleInput.value?.select();
});
onUnmounted(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <Teleport to="body">
    <div class="choice-backdrop" @pointerdown.self="req.resolve(null)">
      <div class="choice-card ta-publish">
        <div class="choice-title">Publish to TinkerAtlas</div>

        <input
          ref="titleInput"
          v-model="title"
          class="ta-signin-input"
          :maxlength="200"
          placeholder="Title"
        />
        <textarea
          ref="descInput"
          v-model="description"
          class="ta-signin-input ta-publish-desc"
          rows="4"
          placeholder="Description (optional)"
        ></textarea>

        <label class="ta-publish-public">
          <input v-model="publicPost" type="checkbox" />
          Post publicly (off = private draft)
        </label>

        <div class="ta-signin-error">{{ error }}</div>

        <div class="choice-row">
          <button class="choice-btn" @click="req.resolve(null)"><span>Cancel</span></button>
          <button class="choice-btn choice-primary" @click="submit()"><span>Publish</span></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
