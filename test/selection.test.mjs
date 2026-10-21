import test from 'node:test';
import assert from 'node:assert/strict';

import { mountPlugin, flushMicrotasks, deferred, settleWithin } from './helpers/fake-plugin.mjs';
import { createSelection, rect, textNode } from './helpers/fake-dom.mjs';

function mount(t, options) {
  const instance = mountPlugin(options);
  t.after(() => instance.dispose());
  return instance;
}

function element(mount, tagName, attributes = {}) {
  const element = mount.dom.document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  mount.dom.document.body.appendChild(element);
  return element;
}

function setSelection(mount, { text = 'Hello world', anchorEl, rects } = {}) {
  const anchor = anchorEl ?? mount.dom.document.body;
  mount.dom.window.selection = createSelection({
    text,
    anchorNode: textNode(anchor, text),
    focusNode: textNode(anchor, text),
    rects: rects ?? [rect(100, 100, 100, 20)],
  });
}

test('shows the floating button for a valid selection', (t) => {
  const instance = mount(t);
  const state = instance.select({ text: 'Hello world' });

  assert.equal(state.mode, 'button');
  assert.equal(state.text, 'Hello world');
  assert.deepEqual(state.anchor, { left: 100, top: 100, right: 200, bottom: 120 });
});

test('anchors on the last client rect of a wrapped selection', (t) => {
  const instance = mount(t);
  const state = instance.select({
    rects: [rect(0, 0, 50, 10), rect(300, 200, 40, 20)],
  });

  assert.deepEqual(state.anchor, { left: 300, top: 200, right: 340, bottom: 220 });
});

test('ignores collapsed, blank and oversized selections', (t) => {
  const instance = mount(t);

  assert.equal(instance.select().mode, 'button', 'starts from a visible button');
  assert.equal(instance.select({ text: '   \n\t ' }).mode, 'hidden');
  assert.equal(instance.select().mode, 'button');
  assert.equal(instance.select({ text: 'x'.repeat(20001) }).mode, 'hidden');
  assert.equal(instance.select({ text: 'x'.repeat(20000) }).mode, 'button', '20000 chars still allowed');
  assert.equal(instance.select({ collapsed: true }).mode, 'hidden');
});

test('ignores selections without a measurable rect', (t) => {
  const instance = mount(t);

  assert.equal(instance.select().mode, 'button');
  assert.equal(instance.select({ rects: [rect(10, 10, 0, 0)] }).mode, 'hidden');
});

test('skips selections inside editable controls', async (t) => {
  const cases = [
    ['input', {}],
    ['textarea', {}],
    ['select', {}],
    ['div', { contenteditable: '' }],
    ['div', { role: 'textbox' }],
  ];

  for (const [tagName, attributes] of cases) {
    const instance = mount(t);
    const editable = element(instance, tagName, attributes);
    const state = instance.select({ anchorEl: editable });
    assert.equal(state.mode, 'hidden', `${tagName} ${JSON.stringify(attributes)} must be skipped`);
  }

  const instance = mount(t);
  const editable = element(instance, 'div', { contenteditable: '' });
  const nested = element(instance, 'span');
  editable.appendChild(nested);
  assert.equal(instance.select({ anchorEl: nested }).mode, 'hidden', 'nested editable content is skipped');
});

test('allows selections in contenteditable="false" subtrees', (t) => {
  const instance = mount(t);
  const readOnly = element(instance, 'div', { contenteditable: 'false' });
  assert.equal(instance.select({ anchorEl: readOnly }).mode, 'button');
});

test('ignores selections that start or end inside the plugin UI', (t) => {
  const instance = mount(t);
  const ui = element(instance, 'div', { 'data-dst-root': 'popup' });
  const inside = element(instance, 'span');
  ui.appendChild(inside);

  assert.equal(instance.select({ anchorEl: inside }).mode, 'hidden');
  assert.equal(instance.select({ focusEl: inside }).mode, 'hidden');
});

test('dismisses on a left mousedown outside the UI but not inside it', (t) => {
  const instance = mount(t);
  const ui = element(instance, 'div', { 'data-dst-root': 'trigger' });

  instance.select();
  instance.dom.document.dispatch('mousedown', { button: 0, target: ui });
  assert.equal(instance.state().mode, 'button', 'clicking the floating UI keeps it');

  instance.dom.document.dispatch('mousedown', { button: 0, target: instance.dom.document.body });
  assert.equal(instance.state().mode, 'hidden');
});

test('shows the button after a modified keyup only', (t) => {
  const instance = mount(t);
  setSelection(instance);
  instance.dom.document.dispatch('keyup', { shiftKey: true });
  instance.dom.runDue();
  assert.equal(instance.state().mode, 'button');

  instance.controller.dismiss();
  setSelection(instance);
  instance.dom.document.dispatch('keyup', { key: 'a' });
  instance.dom.runDue();
  assert.equal(instance.state().mode, 'hidden');
});

test('hides the button when the selection collapses', (t) => {
  const instance = mount(t);
  instance.select();
  assert.equal(instance.state().mode, 'button');

  instance.dom.window.selection = createSelection({
    text: '',
    anchorNode: instance.dom.document.body,
    focusNode: instance.dom.document.body,
    collapsed: true,
  });
  instance.dom.document.dispatch('selectionchange');

  assert.equal(instance.state().mode, 'hidden');
});

test('dismisses on scroll, Escape, blur and resize', (t) => {
  const instance = mount(t);
  const ui = element(instance, 'div', { 'data-dst-root': 'popup' });

  instance.select();
  instance.dom.window.dispatch('scroll', { target: ui });
  assert.equal(instance.state().mode, 'button', 'scrolling inside the popup keeps it');

  instance.dom.window.dispatch('scroll', { target: instance.dom.document.body });
  assert.equal(instance.state().mode, 'hidden');

  instance.select();
  instance.dom.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(instance.state().mode, 'hidden');

  instance.select();
  instance.dom.window.dispatch('blur');
  assert.equal(instance.state().mode, 'hidden');

  instance.select();
  instance.dom.window.dispatch('resize');
  assert.equal(instance.state().mode, 'hidden');
});

test('ignores non-primary mouse buttons', (t) => {
  const instance = mount(t);
  setSelection(instance);

  instance.dom.document.dispatch('mouseup', { button: 2, target: instance.dom.document.body });
  instance.dom.runDue();

  assert.equal(instance.state().mode, 'hidden');
});

test('does not reopen the button while a request is in flight', async (t) => {
  const gate = deferred();
  const instance = mount(t, { remote: { limits: () => gate.promise } });

  instance.select();
  const pending = instance.controller.translate();
  await flushMicrotasks();
  assert.equal(instance.state().mode, 'loading');

  instance.select({ text: 'Another selection' });
  assert.equal(instance.state().mode, 'loading');

  gate.resolve({ ok: true, value: { preferences: { provider: 'bing', targetLanguage: 'zh' } } });
  assert.equal(await settleWithin(pending), 'settled');
});
