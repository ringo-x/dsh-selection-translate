import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NS, clientPath, mountPlugin, rootDir } from './helpers/fake-plugin.mjs';

const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const clientSource = readFileSync(clientPath, 'utf8');

/** Collect every translation key the client asks for. */
function referencedKeys() {
  const keys = new Set();
  for (const match of clientSource.matchAll(/\bt\('([^']+)'/g)) keys.add(match[1]);
  for (const match of clientSource.matchAll(/errorState\('([^']+)'/g)) keys.add(match[1]);
  return [...keys].sort();
}

test('client module id matches the package name', (t) => {
  const mount = mountPlugin();
  t.after(() => mount.dispose());

  assert.equal(mount.loaded.id, packageJson.name);
  assert.equal(typeof mount.loaded.module.apply, 'function');
  assert.deepEqual(mount.loaded.module.inject, ['remote', 'slots', 'locale']);
  assert.deepEqual(mount.loaded.required, ['react']);
});

test('apply registers the overlay slot exactly once', (t) => {
  const mount = mountPlugin();
  t.after(() => mount.dispose());

  assert.equal(mount.ctx.registrations.length, 1);
  assert.deepEqual(mount.slot.descriptor, {
    name: 'shell.overlay',
    id: 'selection-translate',
    order: 50,
  });
  assert.equal(typeof mount.slot.component, 'function');
});

test('apply registers matching en and zh dictionaries for every used key', (t) => {
  const mount = mountPlugin();
  t.after(() => mount.dispose());

  const en = mount.locale.dictionary(NS, 'en');
  const zh = mount.locale.dictionary(NS, 'zh');
  assert.ok(en, 'en dictionary is registered');
  assert.ok(zh, 'zh dictionary is registered');

  const keys = referencedKeys();
  assert.ok(keys.length > 10, `expected the client to reference many keys, got ${keys.length}`);
  for (const key of keys) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `en is missing "${key}"`);
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `zh is missing "${key}"`);
  }

  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
});

test('apply registers three effects with stable labels', (t) => {
  const mount = mountPlugin();
  t.after(() => mount.dispose());

  assert.deepEqual(
    mount.ctx.effects.map((effect) => effect.label),
    [
      'selection-translate: locale',
      'selection-translate: selection listeners',
      'selection-translate: cache invalidation',
    ],
  );
});

test('listeners are attached on apply and removed on dispose', (t) => {
  const mount = mountPlugin();
  t.after(() => mount.dispose());

  assert.deepEqual(mount.dom.document.listenerTypes(), [
    'keydown',
    'keyup',
    'mousedown',
    'mouseup',
    'selectionchange',
  ]);
  assert.deepEqual(mount.dom.window.listenerTypes(), ['blur', 'resize', 'scroll']);

  mount.dispose();

  assert.equal(mount.dom.document.listenerCount(), 0);
  assert.equal(mount.dom.window.listenerCount(), 0);
  assert.equal(mount.dom.pendingTimers(), 0);
});

test('apply tolerates a remote without $on and a ctx without on', (t) => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  let mount;
  try {
    mount = mountPlugin({ remote: { settingsEvent: false }, connectionEvent: false });
  } finally {
    console.warn = originalWarn;
  }
  t.after(() => mount.dispose());

  const ours = warnings.filter((args) => String(args[0]).includes('[dsh-selection-translate]'));
  assert.equal(ours.length, 2, 'both unavailable subscriptions are reported, not thrown');
  assert.match(String(ours[0][0]), /settings subscription unavailable/);
  assert.match(String(ours[1][0]), /connection subscription unavailable/);
});

test('manifest keeps the plugin wiring consistent', () => {
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(packageJson.dsh.client.platform, 'web');
  assert.equal(packageJson.dsh.client.immediately, true);
  assert.deepEqual(packageJson.dsh.client.inject, [
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-locale',
  ]);

  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg']) {
    assert.ok(packageJson.files.includes(file), `${file} must ship`);
  }
  assert.ok(
    !packageJson.files.some((file) => file.startsWith('test')),
    'tests are development-only and must not ship',
  );

  const patch = readFileSync(join(rootDir, packageJson.dsh.bundle.patch), 'utf8');
  assert.match(patch, /id: selection-translate/);
  assert.ok(patch.includes(packageJson.name), 'cordis patch inserts the package by name');
});
