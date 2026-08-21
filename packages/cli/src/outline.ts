import type { ProgressState, ResolvedForest, ResolvedNode } from '@learntree/core';

/**
 * Browser-free structural preview: lets an authoring agent sanity-check
 * shape, module reuse, and equivalence wiring without rendering the UI.
 */
export function renderOutline(forest: ResolvedForest, progress?: ProgressState): string {
  const lines: string[] = [];
  const moduleCount = forest.registry.size;
  lines.push(
    `forest "${forest.name}" — ${forest.trees.length} tree(s), ${moduleCount} module(s), ` +
      `${forest.equivalences.length} equivalence(s) [countSatisfied: ${forest.settings.countSatisfied}]`,
  );

  const renderNode = (node: ResolvedNode, indent: string): void => {
    const dep = node.dependsOn.length > 0 ? ` (dependsOn: ${node.dependsOn.join(', ')})` : '';
    lines.push(`${indent}${node.display} ${node.id} "${node.title}"${dep}`);
    for (const cat of node.categories) {
      const mods = cat.moduleIds
        .map((id) => {
          const def = forest.registry.get(id)?.def;
          const w = def !== undefined && def.weight !== 1 ? `(w${def.weight})` : '';
          const reused = (forest.registry.get(id)?.occurrences.length ?? 0) > 1 ? '*' : '';
          return `${id}${w}${reused}`;
        })
        .join(', ');
      lines.push(`${indent}  ${cat.name}: ${mods === '' ? '(empty)' : mods}`);
    }
    for (const child of node.children) renderNode(child, `${indent}  `);
  };

  for (const tree of forest.trees) {
    lines.push('');
    lines.push(`tree ${tree.id} "${tree.title}" — ${tree.moduleIds.length} module(s) [${tree.file}]`);
    for (const node of tree.nodes) renderNode(node, '  ');
  }

  if (forest.equivalences.length > 0) {
    lines.push('');
    lines.push('equivalences:  (* = module appears in more than one place)');
    for (const eq of forest.equivalences) {
      lines.push(`  ${eq.id}: [${eq.sufficient.join(', ')}] => [${eq.satisfies.join(', ')}]`);
    }
  }

  if (progress !== undefined && progress.entries.size > 0) {
    const done = [...progress.entries.values()].filter((e) => e.state === 'done').length;
    lines.push('');
    lines.push(`progress: ${done} module(s) done (${progress.entries.size} entries incl. tombstones)`);
  }

  return `${lines.join('\n')}\n`;
}
