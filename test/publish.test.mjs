/**
 * The published artifact is a renamed copy of the working tree, so the tests
 * here pin three things that can silently drift apart:
 *
 *  1. the public identity (`publish.json`) stays a real, publishable name;
 *  2. the staged tree differs from the working tree by exactly one identifier
 *     per rewritten file — nothing else is "fixed up" on the way to the registry;
 *  3. the staged `client.js` still loads under the DSH module loader and
 *     registers the overlay slot, i.e. the rename did not break anything.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPublishPackage, verifyPublishArtifact } from '../scripts/publish.mjs';
import { clientPath, rootDir } from './helpers/fake-plugin.mjs';
import { createReact } from './helpers/fake-react.mjs';

const sourcePackage = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const publishOverlay = JSON.parse(readFileSync(join(rootDir, 'publish.json'), 'utf8'));

function build() {
  const outDir = mkdtempSync(join(tmpdir(), 'dsh-selection-translate-publish-'));
  const result = buildPublishPackage({ rootDir, outDir });
  return { ...result, dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

/** Load a `client.js` source the way the DSH client module loader does. */
function loadStagedClient(source) {
  const previousWindow = globalThis.window;
  let definition = null;
  globalThis.window = previousWindow ?? {};
  globalThis.window.__ModuleLoader__ = { load: (spec) => { definition = spec; } };
  try {
    new Function('window', source)(globalThis.window);
  } finally {
    delete globalThis.window.__ModuleLoader__;
    globalThis.window = previousWindow;
  }
  assert.ok(definition, 'staged client.js did not call window.__ModuleLoader__.load');
  return definition;
}

test('publish manifest uses a real public identity, not the local placeholder', () => {
  assert.notEqual(publishOverlay.name, sourcePackage.name);
  assert.ok(publishOverlay.name.startsWith('@'), 'a scoped name keeps the registry namespace explicit');
  assert.ok(!publishOverlay.name.startsWith('@local/'), '@local is npm-unpublishable');
  assert.equal(sourcePackage.private, true, 'the working copy must stay private');
  assert.equal(publishOverlay.license, 'MIT');
  assert.ok(publishOverlay.keywords.includes('dsh-plugin'), 'the market discovers packages by this keyword');
  assert.match(publishOverlay.repository.url, /^git\+https:\/\/github\.com\//);
});

test('build stages every shipped file and rewrites only the module identity', (t) => {
  const build1 = build();
  t.after(() => build1.dispose());

  const manifest = JSON.parse(readFileSync(join(build1.outDir, 'package.json'), 'utf8'));
  assert.equal(manifest.name, publishOverlay.name);
  assert.equal(manifest.private, undefined, 'private would block publishing');
  assert.equal(manifest.scripts, undefined, 'dev scripts must not ship');
  assert.equal(manifest.version, sourcePackage.version, 'the published version is the source version');
  assert.deepEqual(manifest.dsh, sourcePackage.dsh, 'the bundle wiring is inherited unchanged');
  assert.deepEqual(build1.rewritten, ['client.js', 'cordis.patch.yml']);

  for (const relPath of ['client.js', 'index.js', 'cordis.patch.yml', 'icon.svg', 'locale/zh.json', 'locale/en.json', 'README.md', 'LICENSE', 'package.json']) {
    assert.ok(existsSync(join(build1.outDir, relPath)), `${relPath} must be staged`);
  }
  for (const devOnly of ['test', 'scripts', 'publish.json', 'AGENTS.md']) {
    assert.ok(!existsSync(join(build1.outDir, devOnly)), `${devOnly} is development-only`);
  }

  // The rename is the only difference: replacing the id back must reproduce the
  // working file byte for byte. If this fails, the build started editing code.
  const stagedClient = readFileSync(join(build1.outDir, 'client.js'), 'utf8');
  const restoredClient = stagedClient.replaceAll(`id: '${publishOverlay.name}'`, `id: '${sourcePackage.name}'`);
  assert.equal(restoredClient, readFileSync(clientPath, 'utf8'));

  const stagedPatch = readFileSync(join(build1.outDir, 'cordis.patch.yml'), 'utf8');
  const sourcePatch = readFileSync(join(rootDir, 'cordis.patch.yml'), 'utf8');
  assert.equal(stagedPatch.replaceAll(`'${publishOverlay.name}'`, `'${sourcePackage.name}'`), sourcePatch);
});

test('staged client.js registers the published module id and mountable slot', (t) => {
  const build1 = build();
  t.after(() => build1.dispose());

  const definition = loadStagedClient(readFileSync(join(build1.outDir, 'client.js'), 'utf8'));
  assert.equal(definition.id, publishOverlay.name, 'the module id is what cordis resolves the bundle row by');
  assert.equal(typeof definition.factory, 'function');

  const required = [];
  const module = definition.factory((id) => {
    required.push(id);
    if (id === 'react') return createReact();
    throw new Error(`unexpected require("${id}")`);
  });
  assert.deepEqual(required, ['react']);
  assert.equal(typeof module.apply, 'function');
});

test('the staged manifest passes the market compatibility gate', async (t) => {
  const build1 = build();
  t.after(() => build1.dispose());

  const report = await verifyPublishArtifact(build1.outDir);
  assert.deepEqual(report.failures, [], `verification failed: ${report.failures.join('; ')}`);
  assert.ok(report.ok);
  assert.ok(
    report.notes.some((line) => line.includes('client.js parses')),
    'the classic-script half must parse',
  );
});

test('verify rejects a staged tree whose identity drifted', async (t) => {
  const build1 = build();
  t.after(() => build1.dispose());

  // Simulate the classic failure: someone edited client.js after the build, or
  // the publish manifest was changed without rebuilding.
  const clientFile = join(build1.outDir, 'client.js');
  const broken = readFileSync(clientFile, 'utf8').replace(`id: '${publishOverlay.name}'`, "id: '@local/renamed-guess'");
  rmSync(clientFile, { force: true });
  writeFileSync(clientFile, broken);

  const report = await verifyPublishArtifact(build1.outDir);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((line) => line.includes('client.js registers the published module id')));
});
