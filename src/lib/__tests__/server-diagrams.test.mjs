import { describe, expect, it } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';

import { renderMermaidSvg, renderPlantumlSvg } from '../server-diagrams.mjs';

function compileSvg(svg) {
  const source = `#image.decode(bytes(${JSON.stringify(svg)}), format: "svg", width: 90%)`;
  return NodeCompiler.create().pdf({ mainFileContent: source });
}

describe('server diagram SVG rendering', () => {
  it('renders Mermaid to SVG that the bundled Typst compiler accepts', async () => {
    const svg = await renderMermaidSvg('flowchart LR\nInput --> Build --> PDF');
    expect(svg).toContain('<svg');
    expect(svg).toContain('flowchart');
    const viewBox = /viewBox="[^"]*?\s([\d.]+)\s([\d.]+)"/.exec(svg);
    expect(Number(viewBox?.[1])).toBeGreaterThan(250);
    expect(compileSvg(svg).subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('keeps path-based Mermaid diagrams inside a useful viewport', async () => {
    const svg = await renderMermaidSvg('pie title Content\n"Notes": 70\n"References": 30');
    const viewBox = /viewBox="[^"]*?\s([\d.]+)\s([\d.]+)"/.exec(svg);
    expect(Number(viewBox?.[1])).toBeGreaterThan(200);
    expect(Number(viewBox?.[2])).toBeGreaterThan(200);
    expect(compileSvg(svg).subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('renders PlantUML to SVG that the bundled Typst compiler accepts', async () => {
    const svg = await renderPlantumlSvg('@startuml\nAlice -> Bob: Build\n@enduml');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Alice');
    expect(compileSvg(svg).subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
