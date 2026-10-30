/** Isolated from jsdom globals installed by the reference PDF renderers. */
import { D2 } from '@d2lang/d2';

const source = await Bun.stdin.text();
if (!source.trim()) throw new Error('D2 diagram source is empty');
const d2 = new D2();
try {
  // Defaults the source's own vars.d2-config can override: TALA layout, and a
  // small pad, since a page-palette diagram has no canvas to frame.
  const result = await d2.compile(`vars: { d2-config: { layout-engine: tala; pad: 16 } }\n${source}`);
  const options = { ...result.renderOptions, noXMLTag: true };
  // A diagram that picks no palette takes the page's: it renders in the
  // default theme, marked so themeD2Svg re-inks it from the site's tokens.
  // One that picks a theme keeps D2's palettes, with a dark one by default.
  const pagePalette = !options.themeID && options.darkThemeID == null
    && !options.themeOverrides && !options.darkThemeOverrides;
  if (!pagePalette) options.darkThemeID ??= 200;
  const svg = await d2.render(result.diagram, options);
  process.stdout.write(pagePalette ? svg.replace(/^<svg\b/, '<svg data-teaman-palette="page"') : svg);
} catch (error) {
  process.stderr.write(String(error?.message ?? error));
  process.exitCode = 1;
} finally {
  await d2.dispose();
}
