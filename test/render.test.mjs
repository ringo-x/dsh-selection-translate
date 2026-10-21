import test from 'node:test';
import assert from 'node:assert/strict';

import { deferred, flushMicrotasks, mountPlugin, settleWithin } from './helpers/fake-plugin.mjs';
import { byClass, className, find, textOf } from './helpers/tree.mjs';

function mount(t, options) {
  const instance = mountPlugin(options);
  t.after(() => instance.dispose());
  return instance;
}

function bodyText(tree) {
  const body = find(tree, (node) => className(node).split(/\s+/).includes('dst-body'));
  return body ? textOf(body) : null;
}

function actions(tree) {
  return byClass(tree, 'dst-action');
}

function stubClipboard(t, behavior) {
  const calls = [];
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      async writeText(text) {
        calls.push(text);
        if (behavior === 'reject') throw new Error('clipboard denied');
      },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis.navigator, 'clipboard', original);
    else delete globalThis.navigator.clipboard;
  });
  return calls;
}

test('renders nothing while hidden', (t) => {
  const instance = mount(t);
  assert.equal(instance.render().tree, null);
});

test('renders the floating trigger next to the selection', (t) => {
  const instance = mount(t);
  instance.select({ text: 'Hello world' });

  const tree = instance.render().tree;
  const trigger = find(tree, (node) => node.props && node.props['data-dst-root'] === 'trigger');

  assert.ok(trigger, 'trigger is rendered');
  assert.equal(trigger.type, 'button');
  assert.equal(trigger.props.className, 'dst-btn');
  assert.equal(trigger.props['aria-label'], '翻译选中文本');
  assert.equal(trigger.props.title, '翻译选中文本');
  assert.equal(textOf(trigger), '翻译');
  assert.deepEqual(trigger.props.style, { left: '82px', top: '128px' });
});

test('flips the trigger above the selection near the viewport bottom', (t) => {
  const instance = mount(t);
  instance.select({ rects: [{ left: 100, top: 760, width: 100, height: 20, right: 200, bottom: 780 }] });

  const trigger = find(instance.render().tree, (node) => node.props && node.props['data-dst-root'] === 'trigger');
  assert.equal(trigger.props.style.top, '726px');
  assert.equal(trigger.props.style.left, '82px');
});

test('clicking the trigger starts the translation', async (t) => {
  const instance = mount(t);
  instance.select();

  const trigger = find(instance.render().tree, (node) => node.props && node.props['data-dst-root'] === 'trigger');
  await trigger.props.onClick();

  assert.equal(instance.state().mode, 'result');
  assert.equal(instance.calls.translate.length, 1);
});

test('renders the loading state with spinner and privacy note', async (t) => {
  const gate = deferred();
  const instance = mount(t, { remote: { limits: () => gate.promise } });
  instance.select();

  const pending = instance.controller.translate();
  await flushMicrotasks();

  const tree = instance.render().tree;
  assert.equal(byClass(tree, 'dst-spinner').length, 1);
  assert.equal(byClass(tree, 'dst-loading').length, 1);
  assert.equal(bodyText(tree), '正在翻译…');
  assert.match(textOf(tree), /选中文本会发送给在线翻译服务/);

  gate.resolve({
    ok: true,
    value: { preferences: { provider: 'bing', targetLanguage: 'zh' } },
  });
  assert.equal(await settleWithin(pending), 'settled');
});

test('renders the translated result with copy action and meta', async (t) => {
  const instance = mount(t);
  instance.select();
  await instance.controller.translate();

  const tree = instance.render().tree;
  const popup = find(tree, (node) => node.props && node.props['data-dst-root'] === 'popup');

  assert.ok(popup);
  assert.equal(bodyText(tree), '译文');
  assert.equal(textOf(find(tree, (node) => className(node) === 'dst-meta')), 'Bing · 简体中文');
  assert.deepEqual(actions(tree).map(textOf), ['复制']);
  assert.deepEqual(popup.props.style, { width: '420px', maxHeight: '360px', left: '8px', top: '128px' });
  assert.match(textOf(tree), /选中文本会发送给在线翻译服务/);
});

test('renders a non-retryable error without a retry action', async (t) => {
  const instance = mount(t, {
    remote: { limits: () => ({ ok: true, value: { preferences: { provider: 'bing', targetLanguage: 'zh' }, maxTextChars: 10 } }) },
  });
  instance.select({ text: 'abcdefghijk' });
  await instance.controller.translate();

  const tree = instance.render().tree;
  assert.equal(bodyText(tree), '选中文本过长，最多 10 个字符。');
  assert.ok(find(tree, (node) => node.props && node.props.role === 'alert'), 'error is announced');
  assert.equal(actions(tree).length, 0);
});

test('renders a retryable error with a working retry action', async (t) => {
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = originalWarn;
  });

  let attempt = 0;
  const instance = mount(t, {
    remote: {
      translate: () => {
        attempt += 1;
        return attempt === 1 ? { ok: false, error: { message: 'boom' } } : { ok: true, value: '重试译文' };
      },
    },
  });
  instance.select();
  await instance.controller.translate();

  let tree = instance.render().tree;
  assert.equal(bodyText(tree), '翻译失败，请检查网络或稍后重试。');
  assert.deepEqual(actions(tree).map(textOf), ['重试']);

  const retry = actions(tree)[0];
  await retry.props.onClick();
  await flushMicrotasks();

  tree = instance.render().tree;
  assert.equal(bodyText(tree), '重试译文');
});

test('renders the remote failure detail outside the message body', async (t) => {
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = originalWarn;
  });

  const instance = mount(t, {
    remote: {
      translate: () => ({ ok: false, error: { code: 'cotTranslation/failed', message: 'Translation failed' } }),
    },
  });
  instance.select({ text: 'Check symlink target' });
  await instance.controller.translate();

  const tree = instance.render().tree;
  assert.equal(bodyText(tree), '翻译失败，请检查网络或稍后重试。');
  assert.equal(
    textOf(find(tree, (node) => className(node) === 'dst-detail')),
    '错误信息：cotTranslation/failed — Translation failed',
  );
  assert.equal(textOf(find(tree, (node) => className(node) === 'dst-meta')), 'Bing · 简体中文');
});

test('renders the paid provider hint without a retry action', async (t) => {
  const instance = mount(t, {
    remote: {
      limits: () => ({ ok: true, value: { preferences: { provider: 'deepseek-account', targetLanguage: 'auto' } } }),
    },
  });
  instance.select();
  await instance.controller.translate();

  const tree = instance.render().tree;
  assert.equal(bodyText(tree), '划词翻译仅支持 Bing/Google，请在「插件 → 思考翻译」中切换翻译服务。');
  assert.equal(textOf(find(tree, (node) => className(node) === 'dst-meta')), 'DeepSeek Flash · 账号（付费） · 简体中文');
  assert.equal(actions(tree).length, 0);
});

test('falls back to raw provider and known language labels', async (t) => {
  const instance = mount(t, {
    remote: {
      limits: () => ({ ok: true, value: { preferences: { provider: 'custom', targetLanguage: 'zh-Hant' } } }),
    },
  });
  instance.select();
  await instance.controller.translate();

  const meta = find(instance.render().tree, (node) => className(node) === 'dst-meta');
  assert.equal(textOf(meta), 'custom · 繁體中文');
});

test('uses English copy and layout when the locale is English', async (t) => {
  const instance = mount(t, { locale: 'en' });
  instance.select();

  let tree = instance.render().tree;
  let trigger = find(tree, (node) => node.props && node.props['data-dst-root'] === 'trigger');
  assert.equal(trigger.props['aria-label'], 'Translate selected text');
  assert.equal(textOf(trigger), 'Translate');

  await instance.controller.translate();
  tree = instance.render().tree;
  assert.equal(bodyText(tree), '译文');
  assert.match(textOf(tree), /Selected text is sent to the online translation service/);
});

test('clamps the card to a narrow viewport', async (t) => {
  const instance = mount(t, { viewport: { width: 300, height: 400 } });
  instance.select({ rects: [{ left: 50, top: 50, width: 100, height: 20, right: 150, bottom: 70 }] });
  await instance.controller.translate();

  const popup = find(instance.render().tree, (node) => node.props && node.props['data-dst-root'] === 'popup');
  assert.deepEqual(popup.props.style, { width: '284px', maxHeight: '314px', left: '8px', top: '78px' });
});

test('opens the card above when there is no room below', async (t) => {
  const instance = mount(t, { viewport: { width: 1200, height: 300 } });
  instance.select({ rects: [{ left: 100, top: 280, width: 100, height: 20, right: 200, bottom: 300 }] });
  await instance.controller.translate();

  const popup = find(instance.render().tree, (node) => node.props && node.props['data-dst-root'] === 'popup');
  assert.equal(popup.props.style.bottom, '28px');
  assert.equal(popup.props.style.maxHeight, '264px');
  assert.equal(popup.props.style.top, undefined);
});

test('copy falls back to execCommand and resets the label after 1.5s', async (t) => {
  const instance = mount(t);
  instance.select();
  await instance.controller.translate();

  let tree = instance.render().tree;
  const copy = actions(tree)[0];
  await copy.props.onClick();

  assert.deepEqual(instance.dom.document.execCommandCalls, ['copy']);
  assert.equal(instance.dom.document.body.childNodes.length, 0, 'temporary textarea is removed');

  tree = instance.render().tree;
  assert.deepEqual(actions(tree).map(textOf), ['已复制']);

  instance.dom.advance(1500);
  tree = instance.render().tree;
  assert.deepEqual(actions(tree).map(textOf), ['复制']);
});

test('copy prefers the clipboard API when available', async (t) => {
  const written = stubClipboard(t, 'resolve');
  const instance = mount(t);
  instance.select();
  await instance.controller.translate();

  await actions(instance.render().tree)[0].props.onClick();

  assert.deepEqual(written, ['译文']);
  assert.deepEqual(instance.dom.document.execCommandCalls, []);
});

test('copy falls back when the clipboard API rejects', async (t) => {
  stubClipboard(t, 'reject');
  const instance = mount(t);
  instance.select();
  await instance.controller.translate();

  await actions(instance.render().tree)[0].props.onClick();

  assert.deepEqual(instance.dom.document.execCommandCalls, ['copy']);
  assert.deepEqual(actions(instance.render().tree).map(textOf), ['已复制']);
});

test('the close action dismisses the card', async (t) => {
  const instance = mount(t);
  instance.select();
  await instance.controller.translate();

  const close = byClass(instance.render().tree, 'dst-icon')[0];
  close.props.onClick();

  assert.equal(instance.state().mode, 'hidden');
});
