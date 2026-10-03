/** Isolated from jsdom globals installed by the reference PDF renderers. */
import { D2 } from '@d2lang/d2';

const source = await Bun.stdin.text();
if (!source.trim()) throw new Error('D2 diagram source is empty');
const d2 = new D2();
try {
  // Leave layout selection in the source so vars.d2-config can override it.
  const result = await d2.compile(`vars: { d2-config: { layout-engine: tala } }\n${source}`);
  const svg = await d2.render(result.diagram, { ...result.renderOptions, noXMLTag: true });
  process.stdout.write(svg);
} catch (error) {
  process.stderr.write(String(error?.message ?? error));
  process.exitCode = 1;
} finally {
  await d2.dispose();
}
