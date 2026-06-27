// The slide logo filename (or null) and whether the footer strip renders. The
// build (build-slides.mjs) overwrites this in the staged theme copy from
// teaman.config.js `slides.logo`/`slides.footer` (staging the logo asset into
// the deck's public/). Committed defaults: no logo, footer enabled — so nothing
// shows unless a vault configures a logo.
export const logoFile: string | null = null
export const showFooter: boolean = true
