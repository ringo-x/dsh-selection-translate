/**
 * Minimal DOM for the plugin tests.
 *
 * `client.js` only touches a small surface: event listeners, `Element.closest`
 * / `matches`, a Range-like object, `document.createElement` / `body` /
 * `execCommand`, `window.getSelection` / `innerWidth` / `innerHeight` and
 * timers. Everything else is deliberately absent so the fake fails loudly
 * instead of silently accepting behaviour the real DOM would not.
 */

const ZERO_RECT = Object.freeze({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });

export function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function textNode(parentElement, data = '') {
  return { nodeType: 3, data, parentElement };
}

const selectorCache = new Map();

function splitSelectors(selector) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseCompound(text) {
  let rest = text.trim();
  const compound = { tag: null, attributes: [], classes: [], not: [] };

  const tag = /^([a-zA-Z][\w-]*|\*)/.exec(rest);
  if (tag) {
    compound.tag = tag[1].toLowerCase();
    rest = rest.slice(tag[0].length);
  }

  while (rest.length > 0) {
    const attribute = /^\[\s*([\w:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]]*?))\s*)?\]/.exec(rest);
    if (attribute) {
      compound.attributes.push({
        name: attribute[1],
        value: attribute[2] ?? attribute[3] ?? attribute[4] ?? null,
      });
      rest = rest.slice(attribute[0].length);
      continue;
    }

    const not = /^:not\(\s*([^)]*?)\s*\)/.exec(rest);
    if (not) {
      compound.not.push(parseCompound(not[1]));
      rest = rest.slice(not[0].length);
      continue;
    }

    const className = /^\.([\w-]+)/.exec(rest);
    if (className) {
      compound.classes.push(className[1]);
      rest = rest.slice(className[0].length);
      continue;
    }

    throw new Error(`fake-dom: unsupported selector "${text}"`);
  }

  return compound;
}

function selectorsFor(selector) {
  let compiled = selectorCache.get(selector);
  if (!compiled) {
    compiled = splitSelectors(selector).map(parseCompound);
    selectorCache.set(selector, compiled);
  }
  return compiled;
}

function matchesCompound(element, compound) {
  if (compound.tag && compound.tag !== '*' && element.localName !== compound.tag) return false;

  for (const attribute of compound.attributes) {
    const value = element.getAttribute(attribute.name);
    if (value === null) return false;
    if (attribute.value !== null && value !== attribute.value) return false;
  }

  if (compound.classes.length > 0) {
    const classes = (element.getAttribute('class') ?? '').split(/\s+/);
    if (!compound.classes.every((name) => classes.includes(name))) return false;
  }

  for (const inner of compound.not) {
    if (matchesCompound(element, inner)) return false;
  }

  return true;
}

export class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.localName = this.tagName.toLowerCase();
    this.nodeType = 1;
    this.parentElement = null;
    this.childNodes = [];
    this.attributes = new Map();
    this.style = {};
    this.value = '';
    this.selected = false;
    this.rects = [rect(10, 20, 100, 20)];
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    const key = String(name);
    return this.attributes.has(key) ? this.attributes.get(key) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(String(name));
  }

  appendChild(child) {
    if (child.parentElement) child.remove();
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }

  closest(selector) {
    const compounds = selectorsFor(selector);
    for (let node = this; node; node = node.parentElement) {
      if (node.nodeType !== 1) continue;
      if (compounds.some((compound) => matchesCompound(node, compound))) return node;
    }
    return null;
  }

  matches(selector) {
    return selectorsFor(selector).some((compound) => matchesCompound(this, compound));
  }

  select() {
    this.selected = true;
  }

  focus() {}

  getClientRects() {
    return this.rects;
  }

  getBoundingClientRect() {
    return this.rects.length > 0 ? this.rects[this.rects.length - 1] : ZERO_RECT;
  }
}

function normalizeCapture(options) {
  if (typeof options === 'boolean') return options;
  return Boolean(options && options.capture);
}

class ListenerTarget {
  constructor() {
    this.listeners = [];
  }

  addEventListener(type, handler, options) {
    this.listeners.push({ type, handler, capture: normalizeCapture(options) });
  }

  removeEventListener(type, handler) {
    const index = this.listeners.findIndex(
      (listener) => listener.type === type && listener.handler === handler,
    );
    if (index >= 0) this.listeners.splice(index, 1);
  }

  dispatch(type, event = {}) {
    const matched = this.listeners.filter((listener) => listener.type === type);
    for (const listener of matched) listener.handler(event);
    return matched.length;
  }

  listenerCount(type) {
    if (type === undefined) return this.listeners.length;
    return this.listeners.filter((listener) => listener.type === type).length;
  }

  listenerTypes() {
    return this.listeners.map((listener) => listener.type).sort();
  }
}

class FakeDocument extends ListenerTarget {
  constructor() {
    super();
    this.nodeType = 9;
    this.body = new Element('body');
    this.execCommandCalls = [];
    this.execCommandResult = true;
  }

  createElement(tagName) {
    return new Element(tagName);
  }

  execCommand(command) {
    this.execCommandCalls.push(command);
    return this.execCommandResult;
  }
}

class FakeWindow extends ListenerTarget {
  constructor(width, height) {
    super();
    this.innerWidth = width;
    this.innerHeight = height;
    this.selection = null;
  }

  getSelection() {
    return this.selection;
  }
}

export function createSelection({
  text = 'Hello world',
  anchorNode,
  focusNode,
  rects = [rect(100, 100, 100, 20)],
  collapsed = false,
} = {}) {
  const range = {
    getClientRects: () => rects,
    getBoundingClientRect: () => (rects.length > 0 ? rects[rects.length - 1] : ZERO_RECT),
  };

  return {
    isCollapsed: collapsed,
    rangeCount: collapsed ? 0 : 1,
    anchorNode,
    focusNode,
    toString: () => text,
    getRangeAt: () => range,
  };
}

export function createDom({ width = 1200, height = 800 } = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow(width, height);
  window.document = document;

  let clock = 0;
  let timerSeq = 0;
  const timers = new Map();

  window.setTimeout = (callback, delay = 0) => {
    const id = ++timerSeq;
    const wait = Number(delay) || 0;
    timers.set(id, { callback, due: clock + wait });
    return id;
  };

  window.clearTimeout = (id) => {
    timers.delete(id);
  };

  const runDue = () => {
    for (let guard = 0; ; guard += 1) {
      if (guard > 500) throw new Error('fake-dom: timer runaway');
      let picked = null;
      for (const [id, timer] of timers) {
        if (timer.due > clock) continue;
        if (!picked || timer.due < picked.timer.due || (timer.due === picked.timer.due && id < picked.id)) {
          picked = { id, timer };
        }
      }
      if (!picked) return;
      timers.delete(picked.id);
      picked.timer.callback();
    }
  };

  return {
    window,
    document,
    Element,
    rect,
    textNode,
    createSelection,
    setSelection(selection) {
      window.selection = selection;
    },
    clearSelection() {
      window.selection = null;
    },
    createElement(tagName) {
      return document.createElement(tagName);
    },
    /** Run timers already due at the current fake clock (0 by default). */
    runDue,
    /** Advance the fake clock, then run every timer that became due. */
    advance(ms) {
      clock += Number(ms);
      runDue();
    },
    get clock() {
      return clock;
    },
    pendingTimers() {
      return timers.size;
    },
    clearTimers() {
      timers.clear();
    },
  };
}
