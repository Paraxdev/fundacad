import { defineStore } from "pinia";
import { ref } from "vue";

/** The viewport instruction banner (#prompt).
 *
 *  ~25 call sites across src/features/**, src/sketch/** and viewport.ts push
 *  into this through `setPrompt(text | null)` in ui/prompt.ts, which is now a
 *  two-line facade over this store. None of those call sites changed. */
export const usePromptStore = defineStore("prompt", () => {
  const text = ref<string | null>(null);
  return { text };
});
