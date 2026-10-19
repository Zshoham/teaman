// The engine's deck embed scan, for setup/transformers.ts. This relative
// path holds in the engine itself; build-slides rewrites this file in the
// staged theme (which lives in a temp dir) to the engine's absolute path —
// see renderDeckEmbedsModule in scripts/slides-theme.mjs.
export { htmlEmbedEdits } from '../../src/lib/deck-embeds.mjs'
