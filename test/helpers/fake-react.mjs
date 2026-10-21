/**
 * Tiny React stand-in used by the render tests.
 *
 * It supports exactly what `client.js` uses: `createElement`, `Fragment`,
 * `useState`, `useRef` and `useEffect`. Rendering resolves function components
 * into a plain tree of `{ type, props, children }` host nodes, which keeps the
 * assertions readable without pulling in a real renderer or a DOM library.
 */

export function createReact() {
  const Fragment = Symbol.for('test.fragment');
  const stores = new Map();
  const pendingEffects = [];
  let current = null;

  function createElement(type, props, ...children) {
    const merged = Object.assign({}, props);
    if (children.length === 1) merged.children = children[0];
    else if (children.length > 1) merged.children = children;
    return { type, props: merged };
  }

  function storeFor(component) {
    if (!stores.has(component)) stores.set(component, []);
    return stores.get(component);
  }

  function useState(initial) {
    const store = storeFor(current.component);
    const index = current.index++;
    if (!(index in store)) {
      store[index] = typeof initial === 'function' ? initial() : initial;
    }
    const set = (next) => {
      store[index] = typeof next === 'function' ? next(store[index]) : next;
    };
    return [store[index], set];
  }

  function useRef(initial) {
    const store = storeFor(current.component);
    const index = current.index++;
    if (!(index in store)) store[index] = { current: initial };
    return store[index];
  }

  function sameDeps(previous, next) {
    if (!previous || !next || previous.length !== next.length) return false;
    return previous.every((value, index) => Object.is(value, next[index]));
  }

  function useEffect(effect, deps) {
    const store = storeFor(current.component);
    const index = current.index++;
    const previous = store[index];
    if (previous) {
      if (deps !== undefined && previous.deps !== undefined && sameDeps(previous.deps, deps)) {
        return;
      }
      if (typeof previous.cleanup === 'function') previous.cleanup();
    }
    const entry = { deps };
    store[index] = entry;
    pendingEffects.push({ store, index, run: effect });
  }

  function renderNode(node, components) {
    if (node === null || node === undefined || typeof node === 'boolean') return null;
    if (typeof node === 'string' || typeof node === 'number') return node;
    if (Array.isArray(node)) return node.map((child) => renderNode(child, components));

    if (node.type === Fragment) return renderNode(node.props && node.props.children, components);

    if (typeof node.type === 'function') {
      components.push({ type: node.type, name: node.type.name, props: node.props ?? {} });
      const parent = current;
      current = { component: node.type, index: 0 };
      try {
        return renderNode(node.type(node.props ?? {}), components);
      } finally {
        current = parent;
      }
    }

    const children =
      node.props && Object.prototype.hasOwnProperty.call(node.props, 'children')
        ? renderNode(node.props.children, components)
        : null;
    return { type: node.type, props: node.props ?? {}, children };
  }

  return {
    Fragment,
    createElement,
    useState,
    useRef,
    useEffect,
    /** Render a virtual element; returns `{ tree, components, effects }`. */
    render(element) {
      const components = [];
      const pending = [];
      pendingEffects.length = 0;
      const tree = renderNode(element, components);
      pending.push(...pendingEffects);
      pendingEffects.length = 0;
      for (const entry of pending) {
        const cleanup = entry.run();
        entry.store[entry.index].cleanup = cleanup;
      }
      return { tree, components, effects: pending };
    },
    reset() {
      stores.clear();
    },
  };
}
