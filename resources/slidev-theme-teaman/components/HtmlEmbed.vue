<!-- A `![[page.html]]` embed on a slide (rewritten to this component by
     setup/transformers.ts). The deck side of the frame protocol in
     src/lib/html-embeds.mjs: the embed is told the deck's light/dark mode when
     it loads, when it says it is ready, and whenever the mode flips. Resize
     requests are ignored — a slide is a fixed canvas, so the frame keeps the
     height the author gave (`![[page.html|420]]`) or the default. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  src: string
  title?: string
  width?: number
  height?: number
}>(), { title: 'Interactive embed', height: 360 })

const frame = ref<HTMLIFrameElement>()

function postTheme() {
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  // The sandboxed frame has an opaque origin; no narrower target can match.
  frame.value?.contentWindow?.postMessage({ type: 'teaman:theme', theme }, '*')
}

function onMessage(event: MessageEvent) {
  if (event.source === frame.value?.contentWindow && event.data?.type === 'teaman:ready')
    postTheme()
}

let observer: MutationObserver | undefined
onMounted(() => {
  window.addEventListener('message', onMessage)
  observer = new MutationObserver(postTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  observer?.disconnect()
})
</script>

<template>
  <iframe
    ref="frame"
    class="teaman-html-embed"
    :src="props.src"
    :title="props.title"
    :style="{ height: `${props.height}px`, width: props.width ? `${props.width}px` : '100%' }"
    sandbox="allow-scripts allow-popups"
    allow="fullscreen"
    @load="postTheme"
  />
</template>

<style>
.teaman-html-embed {
  display: block;
  max-width: 100%;
  margin: 0.75rem auto 0;
  border: 1px solid var(--teaman-slide-border);
  border-radius: 0.5rem;
}
</style>
