/** Strips the leading H1 from markdown — the title heading (`entry-title.mjs`).
 *  Authors keep `# Title` for Obsidian previews; page layouts already render
 *  the title. Link reference definitions render nothing, so one before the
 *  heading does not stop it leading (and stays). */
const INVISIBLE = new Set(['yaml', 'toml', 'definition']);

export function remarkStripLeadingH1() {
  return (tree) => {
    const i = tree.children.findIndex(c => !INVISIBLE.has(c.type));
    if (i !== -1 && tree.children[i].type === 'heading' && tree.children[i].depth === 1) {
      tree.children.splice(i, 1);
    }
  };
}
