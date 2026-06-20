<!-- Renders the optional project logo on a footer strip across the bottom of
     every slide. The strip is painted with the secondary accent so the logo
     always sits on one fixed backdrop — authors style the logo for that single
     colour and never have to worry about the light/dark slide themes. The file
     is injected by the build into logo.config.ts; the URL is resolved against
     the per-deck base via import.meta.env.BASE_URL so it stays correct under
     any --base. Hidden when the footer is disabled (slides.footer: false) or no
     logo is configured. -->
<script setup lang="ts">
import { logoFile, showFooter } from './logo.config'

const logoUrl = logoFile ? import.meta.env.BASE_URL + logoFile : null
</script>

<template>
  <div v-if="showFooter && logoUrl" class="teaman-slide-footer" aria-hidden="true">
    <img :src="logoUrl" class="teaman-slide-logo" alt="" />
  </div>
</template>

<style>
.teaman-slide-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.5rem;
  background: var(--slidev-theme-secondary);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 1.6rem;
  z-index: 10;
  pointer-events: none;
}
.teaman-slide-logo {
  height: 1.5rem;
  width: auto;
  max-width: 8rem;
  object-fit: contain;
}
</style>
