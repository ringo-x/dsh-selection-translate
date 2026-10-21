import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LIMITS,
  deferred,
  flushMicrotasks,
  mountPlugin,
  settleWithin,
} from './helpers/fake-plugin.mjs';

function mount(t, options) {
  const instance = mountPlugin(options);
  t.after(() => instance.dispose());
  return instance;
}

function limitsWith(patch) {
  return {
    ...DEFAULT_LIMITS,
    ...patch,
    preferences: { ...DEFAULT_LIMITS.preferences, ...(patch.preferences ?? {}) },
  };
}

function captureWarnings(t) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  t.after(() => {
    console.warn = original;
  });
  return warnings;
}

/** Keep expected failure-path warnings out of the test output. */
function silenceWarnings(t) {
  const original = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = original;
  });
}

async function translateText(instance, options = {}) {
  instance.select(options);
  await instance.controller.translate();
  return instance.state();
}

test('requests translation with the selected text, provider and language', async (t) => {
  const instance = mount(t);
  const state = await translateText(instance, { text: 'Hello world' });

  assert.equal(state.mode, 'result');
  assert.equal(state.translation, '译文');
  assert.equal(state.provider, 'bing');
  assert.equal(state.targetLanguage, 'zh');
  assert.equal(instance.calls.translate.length, 1);
  assert.deepEqual(instance.calls.translate[0].request, {
    text: 'Hello world',
    targetLanguage: 'zh',
    provider: 'bing',
  });
  assert.ok(instance.calls.translate[0].signal instanceof AbortSignal);
  assert.equal(instance.dom.pendingTimers(), 0, 'the timeout timer is cleared');
});

test('resolves "auto" to the active locale and keeps explicit languages', async (t) => {
  const automatic = mount(t, { locale: 'zh-Hant' });
  await translateText(automatic, { text: 'hello' });
  assert.equal(automatic.calls.translate[0].request.targetLanguage, 'zh-Hant');

  const explicit = mount(t, {
    remote: { limits: () => ({ ok: true, value: limitsWith({ preferences: { targetLanguage: 'ja' } }) }) },
  });
  await translateText(explicit, { text: 'hello' });
  assert.equal(explicit.calls.translate[0].request.targetLanguage, 'ja');
});

test('rejects paid providers without calling translate', async (t) => {
  for (const provider of ['deepseek-account', 'deepseek-official']) {
    const instance = mount(t, {
      remote: { limits: () => ({ ok: true, value: limitsWith({ preferences: { provider } }) }) },
    });
    const state = await translateText(instance);

    assert.equal(state.mode, 'error');
    assert.equal(state.error.key, 'providerPaid');
    assert.equal(state.error.retryable, false);
    assert.equal(state.provider, provider);
    assert.equal(instance.calls.translate.length, 0);
  }
});

test('rejects providers the service does not offer', async (t) => {
  const instance = mount(t, {
    remote: {
      limits: () => ({
        ok: true,
        value: limitsWith({ availableProviders: ['bing'], preferences: { provider: 'google' } }),
      }),
    },
  });
  const state = await translateText(instance);

  assert.equal(state.error.key, 'providerUnavailable');
  assert.equal(state.error.retryable, true);
  assert.equal(instance.calls.translate.length, 0);
});

test('rejects text longer than the service limit', async (t) => {
  const instance = mount(t, {
    remote: { limits: () => ({ ok: true, value: limitsWith({ maxTextChars: 5 }) }) },
  });
  const state = await translateText(instance, { text: 'abcdefg' });

  assert.equal(state.error.key, 'tooLong');
  assert.deepEqual(state.error.params, { max: 5 });
  assert.equal(state.error.retryable, false);
  assert.equal(instance.calls.translate.length, 0);
});

test('falls back to the built-in 4000 character limit', async (t) => {
  const instance = mount(t, {
    remote: {
      limits: () => ({ ok: true, value: { preferences: { provider: 'bing', targetLanguage: 'auto' } } }),
    },
  });
  const state = await translateText(instance, { text: 'x'.repeat(4001) });

  assert.equal(state.error.key, 'tooLong');
  assert.deepEqual(state.error.params, { max: 4000 });
});

test('caches identical results and separates cache keys by language', async (t) => {
  const instance = mount(t);
  await translateText(instance, { text: 'Hello world' });
  assert.equal(instance.calls.translate.length, 1);

  instance.controller.dismiss();
  await translateText(instance, { text: 'Hello world' });
  assert.equal(instance.calls.translate.length, 1, 'cached translation is reused');
  assert.equal(instance.state().translation, '译文');

  instance.controller.dismiss();
  instance.locale.setActive('en');
  await translateText(instance, { text: 'Hello world' });
  assert.equal(instance.calls.translate.length, 2, 'another language is a different cache entry');
  assert.equal(instance.calls.translate[1].request.targetLanguage, 'en');
});

test('evicts the oldest entry once the cache is full', async (t) => {
  const instance = mount(t);
  for (let index = 0; index < 41; index += 1) {
    instance.controller.dismiss();
    await translateText(instance, { text: `text ${index}` });
  }
  assert.equal(instance.calls.translate.length, 41);

  instance.controller.dismiss();
  await translateText(instance, { text: 'text 0' });
  assert.equal(instance.calls.translate.length, 42, 'the first entry was evicted');
});

test('surfaces a failed translation and logs the cause', async (t) => {
  const warnings = captureWarnings(t);
  const instance = mount(t, {
    remote: {
      translate: () => ({ ok: false, error: { message: 'upstream 500' } }),
    },
  });
  const state = await translateText(instance);

  assert.equal(state.mode, 'error');
  assert.equal(state.error.key, 'failed');
  assert.equal(state.error.retryable, true);
  const ours = warnings.filter((args) => String(args[0]).includes('[dsh-selection-translate]'));
  assert.equal(ours.length, 1);
  assert.deepEqual(ours[0][1], { message: 'upstream 500' });
});

test('reports serviceUnavailable when the remote face is missing', async (t) => {
  silenceWarnings(t);
  const instance = mount(t, { service: false });
  const state = await translateText(instance);

  assert.equal(state.error.key, 'serviceUnavailable');
  assert.equal(state.error.retryable, true);
});

test('resolves the nested remote face through ctx.get', async (t) => {
  // Regression: `ctx.remote.cotTranslation` throws in Cordis unless the nested
  // service is injected, so the plugin must use the optional ctx.get lookup.
  const instance = mount(t, { remote: { nestedAccess: 'throw' } });
  const state = await translateText(instance, { text: 'Hello world' });

  assert.equal(state.mode, 'result');
  assert.equal(state.translation, '译文');
  assert.equal(state.provider, 'bing');
  assert.equal(instance.calls.translate.length, 1);
});

test('falls back to the property read when ctx.get is unavailable', async (t) => {
  const instance = mount(t);
  delete instance.ctx.get;

  const state = await translateText(instance, { text: 'Hello world' });

  assert.equal(state.mode, 'result');
  assert.equal(state.translation, '译文');
});

test('translates without preferences when limits report a failure', async (t) => {
  const instance = mount(t, { remote: { limits: () => ({ ok: false, error: { message: 'offline' } }) } });
  const state = await translateText(instance, { text: 'Hello world' });

  assert.equal(state.mode, 'result');
  assert.equal(state.translation, '译文');
  assert.deepEqual(
    instance.calls.translate[0].request,
    { text: 'Hello world', targetLanguage: 'zh' },
    'provider is omitted so the service falls back to its configured one',
  );
  assert.equal(state.provider, undefined);
});

test('translates without preferences when limits reject', async (t) => {
  silenceWarnings(t);
  const instance = mount(t, {
    remote: {
      limits: () => {
        throw new TypeError('cannot read properties of undefined');
      },
    },
  });
  const state = await translateText(instance, { text: 'Hello world' });

  assert.equal(state.mode, 'result');
  assert.deepEqual(instance.calls.translate[0].request, {
    text: 'Hello world',
    targetLanguage: 'zh',
  });
});

test('translates without preferences when the snapshot is malformed', async (t) => {
  silenceWarnings(t);
  const instance = mount(t, { remote: { limits: () => ({ ok: true, value: {} }) } });
  const state = await translateText(instance, { text: 'Hello world' });

  assert.equal(state.mode, 'result');
  assert.deepEqual(instance.calls.translate[0].request, {
    text: 'Hello world',
    targetLanguage: 'zh',
  });
});

test('does not cache a limits snapshot that failed to load', async (t) => {
  silenceWarnings(t);
  const instance = mount(t, { remote: { limits: () => ({ ok: false, error: { message: 'offline' } }) } });

  await translateText(instance, { text: 'first' });
  instance.controller.dismiss();
  await translateText(instance, { text: 'second' });

  assert.equal(instance.calls.limits.length, 2, 'a degraded read is retried instead of cached');
  assert.equal(instance.calls.translate.length, 2);
});

test('keeps provider and language when only the translation fails', async (t) => {
  silenceWarnings(t);
  const instance = mount(t, {
    remote: {
      translate: () => ({ ok: false, error: { code: 'cotTranslation/failed', message: 'Translation failed' } }),
    },
  });
  const state = await translateText(instance);

  assert.equal(state.error.key, 'failed');
  assert.equal(state.provider, 'bing');
  assert.equal(state.targetLanguage, 'zh');
  assert.equal(state.error.detail, 'cotTranslation/failed — Translation failed');
});

test('reports an unexpected exception in the error detail', async (t) => {
  const warnings = captureWarnings(t);
  const instance = mount(t, {
    remote: {
      translate: () => {
        throw new TypeError('boom');
      },
    },
  });
  const state = await translateText(instance);

  assert.equal(state.error.key, 'failed');
  assert.equal(state.error.detail, 'boom');
  const ours = warnings.filter((args) => String(args[0]).includes('[dsh-selection-translate]'));
  assert.equal(ours.length, 1);
});

test('reports serviceUnavailable when translate is not exposed', async (t) => {
  const instance = mount(t);
  delete instance.remote.cotTranslation.translate;

  const state = await translateText(instance);

  assert.equal(state.error.key, 'serviceUnavailable');
  assert.equal(instance.calls.translate.length, 0);
});

test('caches limits and refreshes them only when invalidated', async (t) => {
  const instance = mount(t);

  await translateText(instance, { text: 'first' });
  instance.controller.dismiss();
  await translateText(instance, { text: 'second' });
  assert.equal(instance.calls.limits.length, 1, 'limits are cached');

  instance.calls.emitSettings();
  instance.controller.dismiss();
  await translateText(instance, { text: 'third' });
  assert.equal(instance.calls.limits.length, 2, 'settings changes invalidate limits');

  instance.ctx.emit('connection/reset');
  instance.controller.dismiss();
  await translateText(instance, { text: 'fourth' });
  assert.equal(instance.calls.limits.length, 3, 'connection resets invalidate limits');
});

test('refreshes limits once the cache TTL expires', async (t) => {
  let fakeNow = Date.now();
  const realNow = Date.now;
  Date.now = () => fakeNow;
  t.after(() => {
    Date.now = realNow;
  });

  const instance = mount(t);
  await translateText(instance, { text: 'first' });
  assert.equal(instance.calls.limits.length, 1);

  fakeNow += 61000;
  instance.controller.dismiss();
  await translateText(instance, { text: 'second' });
  assert.equal(instance.calls.limits.length, 2);
});

test('times out after 20 seconds and offers a retry', async (t) => {
  let signal = null;
  const instance = mount(t, {
    remote: {
      translate: (_request, requestSignal) => {
        signal = requestSignal;
        return new Promise((_resolve, reject) => {
          requestSignal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    },
  });

  instance.select();
  const pending = instance.controller.translate();
  await flushMicrotasks();
  assert.equal(instance.state().mode, 'loading');

  instance.dom.advance(20000);
  assert.equal(await settleWithin(pending), 'settled', 'the request settles after the timeout');
  const state = instance.state();

  assert.equal(state.mode, 'error');
  assert.equal(state.error.key, 'timeout');
  assert.equal(state.error.retryable, true);
  assert.equal(signal.aborted, true);
  assert.equal(instance.dom.pendingTimers(), 0);
});

test('retry invalidates limits and runs the request again', async (t) => {
  silenceWarnings(t);
  let attempt = 0;
  const instance = mount(t, {
    remote: {
      translate: () => {
        attempt += 1;
        return attempt === 1 ? { ok: false, error: { message: 'boom' } } : { ok: true, value: '重试译文' };
      },
    },
  });

  const failed = await translateText(instance);
  assert.equal(failed.error.key, 'failed');
  assert.equal(instance.calls.limits.length, 1);

  await instance.controller.retry();
  const state = instance.state();
  assert.equal(state.mode, 'result');
  assert.equal(state.translation, '重试译文');
  assert.equal(instance.calls.limits.length, 2);
  assert.equal(instance.calls.translate.length, 2);
});

test('dismiss aborts an in-flight request and stays closed', async (t) => {
  const gate = deferred();
  const instance = mount(t, { remote: { limits: () => gate.promise } });

  instance.select();
  const pending = instance.controller.translate();
  await flushMicrotasks();
  assert.equal(instance.calls.limits.length, 1);

  const { signal } = instance.calls.limits[0];
  instance.controller.dismiss();
  assert.equal(signal.aborted, true);
  assert.equal(instance.state().mode, 'hidden');

  gate.resolve({ ok: true, value: DEFAULT_LIMITS });
  assert.equal(await settleWithin(pending), 'settled');
  assert.equal(instance.state().mode, 'hidden', 'the aborted request cannot reopen the card');
});

test('translate is a no-op while hidden', async (t) => {
  const instance = mount(t);
  await instance.controller.translate();

  assert.equal(instance.calls.limits.length, 0);
  assert.equal(instance.calls.translate.length, 0);
});
