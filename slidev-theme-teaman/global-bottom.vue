<!-- Renders the optional project logo in the bottom-right corner of every
     slide. The file is injected by the build into logo.config.ts; the URL is
     resolved against the per-deck base via import.meta.env.BASE_URL so it stays
     correct under any --base. Hidden when the footer is disabled
     (slides.footer: false) or no logo is configured. -->
<script setup lang="ts">
import { logoFile, showFooter } from './logo.config'

const logoUrl = logoFile ? import.meta.env.BASE_URL + logoFile : null
</script>

<template>
  <img
    v-if="showFooter && logoUrl"
    :src="logoUrl"
    class="teaman-slide-logo"
    alt=""
    aria-hidden="true"
  />
</template>

<style>
.teaman-slide-logo {
  position: absolute;
  right: 1.6rem;
  bottom: 0.5rem;
  height: 1.5rem;
  width: auto;
  max-width: 8rem;
  object-fit: contain;
  z-index: 10;
  pointer-events: none;
}
</style>
