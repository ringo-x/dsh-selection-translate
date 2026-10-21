/**
 * Loads the real `client.js` against fakes and mounts it like the DSH client
 * would: register locale dictionaries, attach listeners, register the
 * `shell.overlay` slot, then render the registered component once.
 *
 * `apply(ctx)` never exposes its controller, so the tests take it from the
 * props of the rendered `SelectionView` — the same object the overlay uses.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDom, createSelection, rect, textNode } from './fake-dom.mjs';
import { createReact } from './fake-react.mjs';

export const rootDir = fileURLToPath(new URL('../../', import.meta.url));
export const clientPath = fileURLToPath(new URL('../../client.js', import.meta.url));

export const NS = 'selectionTranslate';

export const DEFAULT_LIMITS = Object.freeze({
  preferences: Object.freeze({ provider: 'bing', targetLanguage: 'auto' }),
  availableProviders: Object.freeze(['bing', 'google', 'deepseek-account', 'deepseek-official']),
  maxTextChars: 4000,
});

export function flushMicrotasks(count = 25) {
  let chain = Promise.resolve();
  for (let index = 0; index < count; index += 1) chain = chain.then(() => undefined);
  return chain;
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Resolve to `'settled'` when `promise` settles, or `'timeout'` after
 * `timeoutMs`. Guards tests against hanging forever if the behaviour under
 * test stops settling (a real Node timer, not the fake one).
 */
export function settleWithin(promise, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (state) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(state);
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    promise.then(() => finish('settled'), () => finish('rejected'));
  });
}

export function loadClient(react) {
  const source = readFileSync(clientPath, 'utf8');
  let definition = null;

  globalThis.window.__ModuleLoader__ = {
    load(spec) {
      definition = spec;
    },
  };

  try {
    // `client.js` is a script for the DSH module loader, not an ES module.
    new Function('window', source)(globalThis.window);
  } finally {
    delete globalThis.window.__ModuleLoader__;
  }

  if (!definition) throw new Error('client.js did not call window.__ModuleLoader__.load');

  const required = [];
  const module = definition.factory((id) => {
    required.push(id);
    if (id === 'react') return react;
    throw new Error(`unexpected require("${id}")`);
  });

  return { id: definition.id, module, required, source };
}

export function createLocale({ active = 'zh' } = {}) {
  const dictionaries = new Map();
  const listeners = new Set();
  let revision = 0;

  const entryKey = (namespace, language) => `${namespace}\u0000${language}`;
  const notify = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  return {
    register(namespace, language, dictionary) {
      dictionaries.set(entryKey(namespace, language), dictionary);
      notify();
      return () => {
        if (dictionaries.delete(entryKey(namespace, language))) notify();
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return { active, revision };
    },
    setActive(language) {
      active = language;
      notify();
    },
    bind(namespace) {
      return (key, params) => {
        const dictionary = dictionaries.get(entryKey(namespace, active)) ?? {};
        let text = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : key;
        if (params) {
          for (const [name, value] of Object.entries(params)) {
            text = text.split(`{${name}}`).join(String(value));
          }
        }
        return text;
      };
    },
    dictionary(namespace, language) {
      return dictionaries.get(entryKey(namespace, language));
    },
    get size() {
      return dictionaries.size;
    },
  };
}

export function createRemote({ limits, translate, settingsEvent = true, nestedAccess = 'allow' } = {}) {
  const calls = { limits: [], translate: [], settings: 0 };
  const settingsHandlers = new Set();

  const cotTranslation = {
    async limits(signal) {
      calls.limits.push({ signal });
      if (typeof limits === 'function') return limits(signal);
      return { ok: true, value: DEFAULT_LIMITS };
    },
    async translate(request, signal) {
      calls.translate.push({ request, signal });
      if (typeof translate === 'function') return translate(request, signal);
      return { ok: true, value: '译文' };
    },
  };

  const remote = { cotTranslation };

  if (nestedAccess === 'throw') {
    // Cordis refuses a nested service read that was not injected: the property
    // access throws, while `ctx.get('remote.cotTranslation')` still resolves it.
    Object.defineProperty(remote, 'cotTranslation', {
      configurable: true,
      get() {
        throw new Error('cannot get property "remote.cotTranslation" without inject');
      },
    });
  }

  if (settingsEvent) {
    remote.$on = (event, handler) => {
      if (event !== 'settings/document-updated') return () => {};
      settingsHandlers.add(handler);
      return () => settingsHandlers.delete(handler);
    };
  }

  calls.emitSettings = () => {
    calls.settings += 1;
    for (const handler of settingsHandlers) handler();
  };

  return { remote, calls, face: cotTranslation };
}

export function createCtx({ locale, remote, face, connectionEvent = true }) {
  const effects = [];
  const registrations = [];
  const handlers = new Map();
  let disposed = false;

  const ctx = {
    locale,
    remote,
    get(name) {
      if (name === 'remote.cotTranslation') return face ?? (remote && remote.cotTranslation);
      return ctx[name];
    },
    effect(fn, label) {
      const cleanup = fn();
      effects.push({ label, cleanup });
      return cleanup;
    },
    slots: {
      inject(_name, factory) {
        return factory();
      },
      register(descriptor, component) {
        const entry = { descriptor, component };
        registrations.push(entry);
        return () => {
          const index = registrations.indexOf(entry);
          if (index >= 0) registrations.splice(index, 1);
        };
      },
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      return () => handlers.get(event)?.delete(handler);
    },
    emit(event, payload) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { cleanup } of [...effects].reverse()) {
        try {
          if (typeof cleanup === 'function') cleanup();
        } catch {
          /* disposal must not mask the original failure */
        }
      }
      registrations.length = 0;
      handlers.clear();
    },
    get disposed() {
      return disposed;
    },
  };

  if (!connectionEvent) delete ctx.on;

  return Object.assign(ctx, { effects, registrations });
}

export function mountPlugin({
  viewport,
  locale: activeLocale = 'zh',
  remote: remoteOptions = {},
  connectionEvent = true,
  service = true,
} = {}) {
  const dom = createDom(viewport);
  const react = createReact();
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.document;
  globalThis.Element = dom.Element;

  const loaded = loadClient(react);
  const locale = createLocale({ active: activeLocale });
  const created = service
    ? createRemote(remoteOptions)
    : { remote: {}, calls: { limits: [], translate: [], settings: 0, emitSettings() {} }, face: null };
  const ctx = createCtx({ locale, remote: created.remote, face: created.face, connectionEvent });

  loaded.module.apply(ctx);

  const slot = ctx.registrations.find((entry) => entry.descriptor.name === 'shell.overlay');
  if (!slot) throw new Error('plugin did not register the shell.overlay slot');

  const mount = {
    dom,
    react,
    locale,
    remote: created.remote,
    calls: created.calls,
    ctx,
    slot,
    loaded,
    controller: null,
    render: () => react.render(react.createElement(slot.component)),
    state: () => mount.controller.getSnapshot(),
    /**
     * Simulate a text selection plus the `mouseup` that follows it.
     * `anchorEl` / `focusEl` are real fake-DOM elements; a text node inside
     * the element is what a browser would report as `anchorNode`.
     */
    select({
      text = 'Hello world',
      anchorEl = dom.document.body,
      focusEl = anchorEl,
      rects,
      collapsed = false,
    } = {}) {
      dom.window.selection = createSelection({
        text,
        anchorNode: textNode(anchorEl, text),
        focusNode: textNode(focusEl, text),
        rects: rects ?? [rect(100, 100, 100, 20)],
        collapsed,
      });
      dom.document.dispatch('mouseup', { button: 0, target: dom.document.body });
      dom.runDue();
      return mount.controller.getSnapshot();
    },
    dispose() {
      ctx.dispose();
      dom.clearSelection();
      dom.clearTimers();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.Element = previous.Element;
    },
  };

  const first = mount.render();
  const view = first.components.find(
    (component) => component.props.controller && component.props.locale,
  );
  if (!view) throw new Error('could not find the SelectionView component');
  mount.controller = view.props.controller;

  return mount;
}
