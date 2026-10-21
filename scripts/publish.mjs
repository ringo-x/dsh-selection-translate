/**
 * Builds the npm-publishable artifact for this plugin.
 *
 * Why a build step exists at all: the working copy is installed into a DSH
 * profile as a `link:` dependency under the placeholder name
 * `@local/dsh-selection-translate`, which npm refuses to publish (`@local` is
 * not a scope we own, and the package is marked `private`). Cordis resolves a
 * bundle row by module id, so the published name has to appear in three places
 * at once — `package.json.name`, the `id` inside `client.js`, and `name` in
 * `cordis.patch.yml`. Renaming the working copy would break the live profile
 * link, which must be changed through `plugin_manager` rather than by hand, so
 * the rename is applied to a staged copy instead.
 *
 * Everything except that single identifier is copied byte for byte, and
 * `test/publish.test.mjs` asserts the id is the only difference. What ships is
 * therefore what the test suite exercised, not a parallel rebuild.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const rootDir = fileURLToPath(new URL('../', import.meta.url));

/** Fields copied from `package.json` verbatim; publish-only fields come from `publish.json`. */
const INHERITED_FIELDS = ['version', 'description', 'type', 'exports', 'files', 'dsh'];

/** Fields that must never reach the registry. */
const DEV_ONLY_FIELDS = ['private', 'scripts', 'devDependencies', 'dependencies', 'main', 'types'];

/** Extra files npm does not resolve from `files` but a listing needs. */
const EXTRA_FILES = ['README.md', 'LICENSE'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Reject an overlay that would publish under the working (unpublishable) identity. */
function assertPublishable(source, overlay) {
  const problems = [];
  if (typeof overlay.name !== 'string' || !overlay.name.includes('/')) {
    problems.push('publish.json must declare a scoped name, e.g. "@owner/dsh-selection-translate"');
  }
  if (overlay.name === source.name) {
    problems.push(`publish.json name equals the working name (${source.name}); it must be the public identity`);
  }
  if (overlay.name.startsWith('@local/')) {
    problems.push('"@local/" is a placeholder scope npm will reject');
  }
  if (source.private !== true) {
    problems.push('package.json should stay "private": true so the working copy cannot be published by accident');
  }
  if (overlay.license === undefined) problems.push('publish.json must declare "license"');
  if (!Array.isArray(overlay.keywords) || !overlay.keywords.includes('dsh-plugin')) {
    problems.push('publish.json keywords must include "dsh-plugin" — the plugin market discovers packages by it');
  }
  if (problems.length > 0) throw new Error(`publish manifest is not publishable:\n- ${problems.join('\n- ')}`);
}

/** Expand a `files` entry (`locale/*.json`) into concrete relative paths. */
function expandEntry(root, entry) {
  if (!entry.includes('*')) {
    if (!existsSync(join(root, entry))) throw new Error(`missing published file: ${entry}`);
    return [entry];
  }
  const slash = entry.lastIndexOf('/');
  const dir = slash === -1 ? '.' : entry.slice(0, slash);
  const pattern = entry.slice(slash + 1);
  const match = /^\*([^.]*)(\..*)?$/.exec(pattern);
  if (!match) throw new Error(`unsupported glob in files: ${entry}`);
  const suffix = match[2] ?? '';
  const names = readdirSync(join(root, dir)).filter((name) => name.endsWith(suffix));
  if (names.length === 0) throw new Error(`files entry matched nothing: ${entry}`);
  return names.map((name) => (dir === '.' ? name : `${dir}/${name}`));
}

/** Replace exactly one occurrence so a drifting source fails loudly instead of publishing half a rename. */
function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`expected exactly one occurrence of ${label} (${from}), found ${count}`);
  return text.split(from).join(to);
}

/**
 * Stage the publishable package.
 * @param {{rootDir?: string, outDir?: string}} [options]
 * @returns {{outDir: string, manifest: Record<string, any>, source: Record<string, any>, files: string[], rewritten: string[]}}
 */
export function buildPublishPackage({ rootDir: root = rootDir, outDir = join(root, 'dist', 'publish') } = {}) {
  const source = readJson(join(root, 'package.json'));
  const overlay = readJson(join(root, 'publish.json'));
  assertPublishable(source, overlay);

  const manifest = {};
  for (const field of INHERITED_FIELDS) {
    if (source[field] !== undefined) manifest[field] = source[field];
  }
  for (const [field, value] of Object.entries(overlay)) manifest[field] = value;
  for (const field of DEV_ONLY_FIELDS) delete manifest[field];

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const files = [];
  const rewritten = [];
  for (const entry of source.files ?? []) {
    for (const relPath of expandEntry(root, entry)) {
      const from = join(root, relPath);
      const to = join(outDir, relPath);
      mkdirSync(join(to, '..'), { recursive: true });

      let text = null;
      if (relPath === 'client.js') {
        text = replaceOnce(readFileSync(from, 'utf8'), `id: '${source.name}'`, `id: '${manifest.name}'`, 'client module id');
        rewritten.push(relPath);
      } else if (relPath === source.dsh?.bundle?.patch?.replace(/^\.\//, '')) {
        text = replaceOnce(readFileSync(from, 'utf8'), `name: '${source.name}'`, `name: '${manifest.name}'`, 'bundle row name');
        rewritten.push(relPath);
      }

      if (text === null) cpSync(from, to);
      else writeFileSync(to, text);
      files.push(relPath);
    }
  }

  for (const name of EXTRA_FILES) {
    if (!existsSync(join(root, name))) throw new Error(`missing published file: ${name}`);
    cpSync(join(root, name), join(outDir, name));
    files.push(name);
  }

  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  files.push('package.json');

  return { outDir, manifest, source, files: files.sort(), rewritten: rewritten.sort() };
}

/**
 * Post-build checks: the staged tree must be loadable, self-consistent, and
 * acceptable to the DSH plugin market's compatibility gate (when the market is
 * installed locally).
 * @param {string} outDir staged package directory
 * @param {{runtimeVersion?: string, marketCompatPath?: string}} [options]
 * @returns {Promise<{ok: boolean, failures: string[], notes: string[], manifest: Record<string, any>}>}
 */
export async function verifyPublishArtifact(outDir, { runtimeVersion = '0.2.1-rc.2', marketCompatPath } = {}) {
  const failures = [];
  const notes = [];
  const manifest = readJson(join(outDir, 'package.json'));

  const expect = (label, ok) => {
    if (ok) notes.push(`ok   ${label}`);
    else failures.push(label);
  };

  expect('manifest is not private', manifest.private === undefined);
  expect('manifest declares an access-public publishConfig', manifest.publishConfig?.access === 'public');
  expect('manifest keeps the dsh bundle patch', Boolean(manifest.dsh?.bundle?.patch));
  expect('manifest keeps the dsh web client half', manifest.dsh?.client?.platform === 'web');

  for (const entry of manifest.files ?? []) {
    for (const relPath of expandEntry(outDir, entry)) {
      expect(`${relPath} ships`, existsSync(join(outDir, relPath)) && statSync(join(outDir, relPath)).size > 0);
    }
  }
  for (const name of ['README.md', 'LICENSE']) expect(`${name} ships`, existsSync(join(outDir, name)));

  const patchRel = (manifest.dsh?.bundle?.patch ?? '').replace(/^\.\//, '');
  expect(`${patchRel} row names the published package`, readFileSync(join(outDir, patchRel), 'utf8').includes(`name: '${manifest.name}'`));

  const clientSource = readFileSync(join(outDir, 'client.js'), 'utf8');
  expect('client.js registers the published module id', clientSource.includes(`id: '${manifest.name}'`));
  const requiredIds = [...clientSource.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  expect('client.js only requires react', requiredIds.length > 0 && requiredIds.every((id) => id === 'react'));

  // `client.js` is a classic script for the DSH module loader, so compiling it
  // is enough to prove it parses; a syntax error would break every session.
  try {
    new Function(clientSource);
    notes.push('ok   client.js parses');
  } catch (error) {
    failures.push(`client.js does not parse: ${error.message}`);
  }

  try {
    const host = await import(pathToFileURL(join(outDir, 'index.js')).href);
    expect('index.js exports apply()', typeof host.apply === 'function');
  } catch (error) {
    failures.push(`index.js cannot be imported: ${error.message}`);
  }

  const compatPath = marketCompatPath ?? join(
    process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '', '.dsh'),
    'profiles',
    'desktop',
    'node_modules',
    'dsh-compat-market',
    'lib',
    'host',
    'compat.js',
  );

  if (existsSync(compatPath)) {
    try {
      const { evaluateCompatibility } = await import(pathToFileURL(compatPath).href);
      const result = evaluateCompatibility(manifest, runtimeVersion);
      if (result.verdict === 'compatible') {
        notes.push(`ok   market compatibility gate: compatible (DSH ${runtimeVersion}, ${result.checked} peer(s) checked)`);
      } else {
        failures.push(`market compatibility gate: ${result.verdict} ${JSON.stringify(result.incompatible)}`);
      }
    } catch (error) {
      notes.push(`skip market compatibility gate (${error.message})`);
    }
  } else {
    notes.push('skip market compatibility gate (dsh-compat-market not installed locally)');
  }

  return { ok: failures.length === 0, failures, notes, manifest };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** CLI: build, verify, pack. Used by `npm run pack:publish`. */
async function main() {
  const { outDir, manifest, files, rewritten } = buildPublishPackage();
  console.log(`staged ${manifest.name}@${manifest.version} -> ${relative(process.cwd(), outDir)}`);
  console.log(`files: ${files.join(', ')}`);
  console.log(`rewritten identifiers: ${rewritten.join(', ')}`);

  const report = await verifyPublishArtifact(outDir);
  for (const line of report.notes) console.log(line);
  if (!report.ok) {
    for (const failure of report.failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
    return;
  }

  const dest = join(rootDir, 'dist');
  const packed = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--pack-destination', dest],
    { cwd: outDir, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (packed.status !== 0) {
    console.error(packed.stderr || packed.stdout);
    process.exitCode = packed.status ?? 1;
    return;
  }

  const tarball = join(dest, packed.stdout.trim().split(/\r?\n/).pop());
  console.log(`tarball: ${tarball}`);
  console.log(`size: ${statSync(tarball).size} bytes`);
  console.log(`sha256: ${sha256(tarball)}`);
  console.log('');
  console.log('publish with:');
  console.log(`  npm publish ${tarball} --access public --registry https://registry.npmjs.org`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
