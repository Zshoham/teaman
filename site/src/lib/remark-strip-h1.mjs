/** Strips the leading H1 from markdown. Authors keep `# Title` for Obsidian
 *  previews; page layouts already render the title from frontmatter. */
export function remarkStripLeadingH1() {
  return (tree) => {
    const i = tree.children.findIndex(c => c.type !== 'yaml' && c.type !== 'toml');
    if (i !== -1 && tree.children[i].type === 'heading' && tree.children[i].depth === 1) {
      tree.children.splice(i, 1);
    }
  };
}
