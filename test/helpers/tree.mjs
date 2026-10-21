/** Helpers for asserting on the plain tree produced by `fake-react.mjs`. */

export function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (Object.prototype.hasOwnProperty.call(node, 'children')) walk(node.children, visit);
}

export function findAll(node, predicate) {
  const matches = [];
  walk(node, (current) => {
    if (predicate(current)) matches.push(current);
  });
  return matches;
}

export function find(node, predicate) {
  return findAll(node, predicate)[0] ?? null;
}

export function textOf(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node || typeof node !== 'object') return '';
  return textOf(node.children);
}

export function className(node) {
  return String((node.props && node.props.className) || '');
}

export function byClass(node, name) {
  return findAll(node, (current) => className(current).split(/\s+/).includes(name));
}
