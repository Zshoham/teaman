// Slidev auto-loads this theme stylesheet entry. Order matters:
//   1. the core base layout positioning,
//   2. our colour tokens (vars.css — the build overwrites this in the staged
//      copy with the values from teaman.config.js; the committed file holds the
//      defaults so the theme is valid on its own),
//   3. the editorial treatment that reads those tokens.
import '@slidev/client/styles/layouts-base.css'
import './vars.css'
import './teaman.css'
