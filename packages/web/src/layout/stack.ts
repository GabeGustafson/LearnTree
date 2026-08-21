import type { ResolvedNode } from '@learntree/core';

/**
 * Deterministic, measure-free sizing. Fixed widths and an estimated title
 * wrap avoid the render→measure→relayout loop entirely, which keeps elk's
 * input (and therefore the whole layout) a pure function of the tree.
 */
export const CARD_W = 264;
export const GROUP_PAD = 14;
export const GROUP_HEADER = 34;
export const STACK_GAP = 26;
const TITLE_CHARS_PER_LINE = 26;
const TITLE_LINE_H = 19;

export interface Sized {
  width: number;
  height: number;
}

export function cardHeight(node: ResolvedNode): number {
  const lines = Math.min(3, Math.max(1, Math.ceil(node.title.length / TITLE_CHARS_PER_LINE)));
  return 30 + lines * TITLE_LINE_H + 14; // padding + title + progress bar row
}

/** Size of a node as rendered inline (inside a group box). */
export function inlineSize(node: ResolvedNode): Sized {
  if (node.display === 'group') {
    let inner = 0;
    let maxW = CARD_W;
    node.children.forEach((child, i) => {
      const s = inlineSize(child);
      inner += (i > 0 ? STACK_GAP : 0) + s.height;
      maxW = Math.max(maxW, s.width);
    });
    return {
      width: maxW + 2 * GROUP_PAD,
      height: GROUP_HEADER + GROUP_PAD + inner + GROUP_PAD,
    };
  }
  let h = cardHeight(node);
  for (const child of node.children) h += STACK_GAP + inlineSize(child).height;
  return { width: CARD_W, height: h };
}

/** Size of a render-root box (a card root excludes its children — they are separate boxes). */
export function rootSize(node: ResolvedNode): Sized {
  if (node.display === 'group') return inlineSize(node);
  return { width: CARD_W, height: cardHeight(node) };
}
