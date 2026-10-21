window.__ModuleLoader__.load({
  id: '@local/dsh-selection-translate',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'selectionTranslate';
    const MAX_HARD_CHARS = 20000;
    const REQUEST_TIMEOUT_MS = 20000;
    const LIMITS_TTL_MS = 60000;
    const CACHE_LIMIT = 40;
    const FALLBACK_MAX_CHARS = 4000;

    const LANG_LABELS = {
      zh: '简体中文',
      'zh-Hans': '简体中文',
      'zh-CN': '简体中文',
      'zh-SG': '简体中文',
      'zh-Hant': '繁體中文',
      'zh-TW': '繁體中文',
      'zh-HK': '繁體中文',
      'zh-MO': '繁體中文',
      en: 'English',
      ja: '日本語',
      ko: '한국어',
      fr: 'Français',
      de: 'Deutsch',
      es: 'Español',
      ru: 'Русский',
    };

    const en = {
      title: 'Translate',
      translate: 'Translate',
      translateSelection: 'Translate selected text',
      translating: 'Translating…',
      copy: 'Copy',
      copied: 'Copied',
      retry: 'Retry',
      close: 'Close',
      privacy: 'Selected text is sent to the online translation service (Bing/Google).',
      failed: 'Translation failed. Check your network or try again later.',
      detail: 'Error: {detail}',
      timeout: 'Translation timed out. Try again.',
      tooLong: 'The selection is too long (max {max} characters).',
      serviceUnavailable:
        'Translation service unavailable. Enable the reasoning translation plugin (Bing/Google) and try again.',
      providerUnavailable:
        'The selected translation service is unavailable. Choose Bing or Google in Plugins → Reasoning translation.',
      providerPaid:
        'Selection translation supports Bing/Google only. Change the service in Plugins → Reasoning translation.',
      deepseekAccount: 'DeepSeek Flash — Account (paid)',
      deepseekOfficial: 'DeepSeek Flash — Official API (paid)',
    };

    const zh = {
      title: '翻译',
      translate: '翻译',
      translateSelection: '翻译选中文本',
      translating: '正在翻译…',
      copy: '复制',
      copied: '已复制',
      retry: '重试',
      close: '关闭',
      privacy: '选中文本会发送给在线翻译服务（Bing/Google），请注意隐私。',
      failed: '翻译失败，请检查网络或稍后重试。',
      detail: '错误信息：{detail}',
      timeout: '翻译超时，请重试。',
      tooLong: '选中文本过长，最多 {max} 个字符。',
      serviceUnavailable: '翻译服务不可用，请启用「思考翻译」插件（Bing/Google）后重试。',
      providerUnavailable: '当前翻译服务不可用，请在「插件 → 思考翻译」中切换到 Bing 或 Google。',
      providerPaid: '划词翻译仅支持 Bing/Google，请在「插件 → 思考翻译」中切换翻译服务。',
      deepseekAccount: 'DeepSeek Flash · 账号（付费）',
      deepseekOfficial: 'DeepSeek Flash · 官方 API（付费）',
    };

    const CSS = `
.dst-btn{position:fixed;z-index:2147483200;display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 4px 14px rgb(0 0 0 / .18);font:inherit;font-size:12px;line-height:1;cursor:pointer;pointer-events:auto}
.dst-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.dst-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dst-pop{position:fixed;z-index:2147483200;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 12px 36px rgb(0 0 0 / .24);pointer-events:auto;overflow:hidden;font:inherit;font-size:13px;line-height:1.6}
.dst-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dst-title{flex:0 0 auto;font-weight:600}
.dst-meta{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dst-icon{flex:0 0 auto;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:18px;line-height:1;padding:0}
.dst-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dst-icon:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dst-source{padding:8px 12px 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dst-body{flex:1 1 auto;min-height:0;overflow:auto;padding:9px 12px;white-space:pre-wrap;word-break:break-word;user-select:text}
.dst-loading{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dst-spinner{flex:0 0 auto;width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dst-spin 1s linear infinite}
.dst-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dst-detail{padding:2px 12px 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;word-break:break-word;user-select:text}
.dst-foot{display:flex;align-items:center;gap:6px;padding:8px 12px 0}
.dst-action{display:inline-flex;align-items:center;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dst-action:hover{border-color:var(--dsw-alias-border-l2)}
.dst-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dst-note{padding:8px 12px 10px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
@keyframes dst-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dst-spinner{animation:none}}
`;

    function providerLabel(provider, t) {
      switch (provider) {
        case 'bing':
          return 'Bing';
        case 'google':
          return 'Google';
        case 'deepseek-account':
          return t('deepseekAccount');
        case 'deepseek-official':
          return t('deepseekOfficial');
        default:
          return provider || '';
      }
    }

    function languageLabel(code) {
      if (!code) return '';
      const value = String(code);
      return LANG_LABELS[value] || LANG_LABELS[value.split('-')[0]] || value;
    }

    function errorState(key, params, retryable, detail) {
      return { key, params, retryable: retryable !== false, detail: detail || '' };
    }

    function describeError(value) {
      if (!value) return '';
      const code = typeof value.code === 'string' ? value.code : '';
      const message = value.message ? String(value.message) : typeof value === 'string' ? value : '';
      return (code ? code + (message ? ' — ' + message : '') : message).trim().slice(0, 240);
    }

    /**
     * Turn any thrown value into an error state, keeping the Remote/gateway code
     * and message visible so a failed call can be reported instead of only
     * showing the generic network hint.
     */
    function failureState(error) {
      if (error && error.key) {
        const detail = error.detail || (error.cause ? describeError(error.cause) : '');
        return errorState(error.key, error.params, error.retryable, detail);
      }
      return errorState('failed', undefined, true, describeError(error));
    }

    function textLimitOf(value) {
      const limit = Number(value && value.maxTextChars);
      return Number.isFinite(limit) && limit >= 2 ? limit : FALLBACK_MAX_CHARS;
    }

    function createController(ctx) {
      let state = { mode: 'hidden' };
      const listeners = new Set();
      const cache = new Map();
      let active = null;
      let limitsCache = null;

      const emit = (next) => {
        state = next;
        for (const listener of listeners) listener();
      };
      const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
      const getSnapshot = () => state;

      function isInsideUi(target) {
        return target instanceof Element && target.closest('[data-dst-root]') !== null;
      }

      function selectionInfo() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
        const text = selection.toString();
        if (!text.trim() || text.length > MAX_HARD_CHARS) return null;

        const anchorNode = selection.anchorNode;
        const focusNode = selection.focusNode;
        const anchorEl = anchorNode && (anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement);
        const focusEl = focusNode && (focusNode.nodeType === 1 ? focusNode : focusNode.parentElement);
        if (anchorEl && anchorEl.closest('[data-dst-root]')) return null;
        if (focusEl && focusEl.closest('[data-dst-root]')) return null;

        const editableSelector =
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
        if (anchorEl && anchorEl.closest(editableSelector)) return null;
        if (focusEl && focusEl.closest(editableSelector)) return null;

        const range = selection.getRangeAt(selection.rangeCount - 1);
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
        const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) return null;

        return {
          text,
          anchor: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        };
      }

      function showButton() {
        if (state.mode === 'loading' || state.mode === 'result') return;
        const info = selectionInfo();
        if (!info) {
          if (state.mode === 'button') emit({ mode: 'hidden' });
          return;
        }
        emit({ mode: 'button', text: info.text, anchor: info.anchor });
      }

      function dismiss() {
        if (active) {
          active.controller.abort();
          active = null;
        }
        if (state.mode !== 'hidden') emit({ mode: 'hidden' });
      }

      function invalidateLimits() {
        limitsCache = null;
      }

      function remoteFace() {
        // `remote.cotTranslation` is a nested service: Cordis only resolves it
        // through injection or the optional `ctx.get` lookup. Reading it as a
        // plain property throws "cannot get property ... without inject", so the
        // optional lookup has to come first.
        if (typeof ctx.get === 'function') {
          try {
            const face = ctx.get('remote.cotTranslation');
            if (face) return face;
          } catch {
            /* fall through to the property lookup */
          }
        }
        try {
          return (ctx.remote && ctx.remote.cotTranslation) || null;
        } catch {
          return null;
        }
      }

      function localeLanguage() {
        const snapshot = ctx.locale.getSnapshot();
        return (snapshot && snapshot.active) || 'en';
      }

      function languageOf(preferences) {
        if (!preferences) return undefined;
        return preferences.targetLanguage === 'auto' ? localeLanguage() : preferences.targetLanguage;
      }

      /**
       * Read provider, language and request limit out of one `limits()` snapshot.
       * `auto` stays unresolved so a language switch applies to the cached
       * snapshot; a missing or malformed snapshot returns `null`.
       */
      function preferencesFrom(value) {
        const preferences = value && value.preferences;
        if (!preferences || typeof preferences !== 'object') return null;
        const provider = typeof preferences.provider === 'string' ? preferences.provider : undefined;
        const targetLanguage =
          typeof preferences.targetLanguage === 'string' ? preferences.targetLanguage : 'auto';
        return {
          provider,
          targetLanguage,
          maxTextChars: textLimitOf(value),
          availableProviders: Array.isArray(value.availableProviders) ? value.availableProviders : undefined,
        };
      }

      async function readLimits(signal) {
        if (limitsCache && Date.now() - limitsCache.at < LIMITS_TTL_MS) return limitsCache.value;
        const face = remoteFace();
        if (!face || typeof face.limits !== 'function') {
          const error = new Error('translation service unavailable');
          error.key = 'serviceUnavailable';
          throw error;
        }
        const result = await face.limits(signal);
        if (signal.aborted) throw signal.reason;
        const value = result && result.ok ? preferencesFrom(result.value) : null;
        if (!value) {
          // The call answered but the snapshot is unusable: translate anyway with
          // the configured provider omitted and the UI language as target.
          const error = new Error('translation limits unavailable');
          error.code = 'limitsUnavailable';
          throw error;
        }
        limitsCache = { value, at: Date.now() };
        return value;
      }

      async function translate() {
        const snapshot = state;
        if (snapshot.mode !== 'button' && snapshot.mode !== 'error') return;
        const { text, anchor } = snapshot;
        if (!text) return;

        if (active) active.controller.abort();
        const local = { controller: new AbortController(), timer: 0, timedOut: false };
        active = local;
        local.timer = window.setTimeout(() => {
          local.timedOut = true;
          local.controller.abort();
        }, REQUEST_TIMEOUT_MS);
        emit({ mode: 'loading', text, anchor });

        let preferences = null;
        try {
          try {
            preferences = await readLimits(local.controller.signal);
          } catch (limitsError) {
            if (active !== local) return;
            if (local.controller.signal.aborted) throw limitsError;
            if (limitsError && limitsError.key === 'serviceUnavailable') throw limitsError;
            // Preferences are only metadata: keep translating through the
            // provider the service chose itself instead of failing the card.
            preferences = {
              provider: undefined,
              targetLanguage: 'auto',
              maxTextChars: FALLBACK_MAX_CHARS,
            };
          }
          if (active !== local) return;

          const provider = preferences.provider;
          const targetLanguage = languageOf(preferences);
          const maxTextChars = preferences.maxTextChars;

          if (provider === 'deepseek-account' || provider === 'deepseek-official') {
            emit({
              mode: 'error',
              text,
              anchor,
              provider,
              targetLanguage,
              error: errorState('providerPaid', undefined, false),
            });
            return;
          }
          if (
            Array.isArray(preferences.availableProviders) &&
            provider &&
            !preferences.availableProviders.includes(provider)
          ) {
            emit({
              mode: 'error',
              text,
              anchor,
              provider,
              targetLanguage,
              error: errorState('providerUnavailable', undefined, true),
            });
            return;
          }
          if (text.length > maxTextChars) {
            emit({
              mode: 'error',
              text,
              anchor,
              provider,
              targetLanguage,
              error: errorState('tooLong', { max: maxTextChars }, false),
            });
            return;
          }

          const cacheKey = provider + '\u0000' + targetLanguage + '\u0000' + text;
          if (cache.has(cacheKey)) {
            emit({
              mode: 'result',
              text,
              anchor,
              provider,
              targetLanguage,
              translation: cache.get(cacheKey),
            });
            return;
          }

          emit({ mode: 'loading', text, anchor, provider, targetLanguage });
          const face = remoteFace();
          if (!face || typeof face.translate !== 'function') {
            const error = new Error('translation service unavailable');
            error.key = 'serviceUnavailable';
            throw error;
          }
          const request = { text, targetLanguage };
          if (provider) request.provider = provider;
          const result = await face.translate(request, local.controller.signal);
          if (active !== local) return;
          if (!result || !result.ok) {
            const error = new Error('translation failed');
            error.key = 'failed';
            error.cause = result && result.error;
            throw error;
          }

          const translation = result.value;
          cache.set(cacheKey, translation);
          if (cache.size > CACHE_LIMIT) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          emit({ mode: 'result', text, anchor, provider, targetLanguage, translation });
        } catch (error) {
          if (active !== local) return;
          if (local.timedOut) {
            emit({
              mode: 'error',
              text,
              anchor,
              provider: preferences && preferences.provider,
              targetLanguage: languageOf(preferences),
              error: errorState('timeout', undefined, true),
            });
            return;
          }
          if (local.controller.signal.aborted) return;
          const failure = failureState(error);
          if (failure.key === 'failed' || failure.detail) {
            console.warn('[dsh-selection-translate]', error && error.cause ? error.cause : error);
          }
          emit({
            mode: 'error',
            text,
            anchor,
            provider: preferences && preferences.provider,
            targetLanguage: languageOf(preferences),
            error: failure,
          });
        } finally {
          window.clearTimeout(local.timer);
          if (active === local) active = null;
        }
      }

      function retry() {
        limitsCache = null;
        return translate();
      }

      function onMouseDown(event) {
        if (event.button !== 0) return;
        if (isInsideUi(event.target)) return;
        dismiss();
      }

      function onMouseUp(event) {
        if (event.button !== 0) return;
        if (isInsideUi(event.target)) return;
        window.setTimeout(showButton, 0);
      }

      function onKeyUp(event) {
        if (!(event.shiftKey || event.ctrlKey || event.metaKey)) return;
        window.setTimeout(showButton, 0);
      }

      function onSelectionChange() {
        if (state.mode !== 'button') return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) emit({ mode: 'hidden' });
      }

      function onScroll(event) {
        if (isInsideUi(event.target)) return;
        dismiss();
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') dismiss();
      }

      function onBlur() {
        dismiss();
      }

      function attach() {
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('mouseup', onMouseUp, true);
        document.addEventListener('keyup', onKeyUp, true);
        document.addEventListener('selectionchange', onSelectionChange);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', dismiss);
        window.addEventListener('blur', onBlur);
        return () => {
          document.removeEventListener('mousedown', onMouseDown, true);
          document.removeEventListener('mouseup', onMouseUp, true);
          document.removeEventListener('keyup', onKeyUp, true);
          document.removeEventListener('selectionchange', onSelectionChange);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('scroll', onScroll, true);
          window.removeEventListener('resize', dismiss);
          window.removeEventListener('blur', onBlur);
        };
      }

      function dispose() {
        dismiss();
        listeners.clear();
      }

      return {
        subscribe,
        getSnapshot,
        attach,
        dispose,
        translate,
        retry,
        dismiss,
        invalidateLimits,
      };
    }

    function Icon() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('path', {
          d: 'M4 5h8M8 3v2c0 4-2 7-5 9M6 9c1.5 3 3.5 5 6 6',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M14 20l3-8 3 8M15 17h4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function Trigger(props) {
      const { state, t, controller } = props;
      const anchor = state.anchor;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxLeft = Math.max(8, viewportWidth - 126);
      const left = Math.min(Math.max(8, anchor.right - 118), maxLeft);
      const below = anchor.bottom + 8;
      const top = below + 34 <= viewportHeight ? below : Math.max(8, anchor.top - 34);

      return h(
        'button',
        {
          type: 'button',
          'data-dst-root': 'trigger',
          className: 'dst-btn',
          style: { left: left + 'px', top: top + 'px' },
          onMouseDown: (event) => {
            event.preventDefault();
          },
          onClick: () => controller.translate(),
          'aria-label': t('translateSelection'),
          title: t('translateSelection'),
        },
        h(Icon),
        h('span', null, t('translate')),
      );
    }

    function copyText(text) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(
          () => true,
          () => copyFallback(text),
        );
      }
      return Promise.resolve(copyFallback(text));
    }

    function copyFallback(text) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      area.remove();
      return copied;
    }

    function Popup(props) {
      const { state, t, controller } = props;
      const [copied, setCopied] = React.useState(false);
      const copiedTimer = React.useRef(0);

      React.useEffect(() => {
        setCopied(false);
      }, [state.mode, state.translation]);

      React.useEffect(
        () => () => {
          if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        },
        [],
      );

      const anchor = state.anchor;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.max(240, Math.min(420, viewportWidth - 16));
      const maxLeft = Math.max(8, viewportWidth - width - 8);
      const left = Math.min(Math.max(8, anchor.right - width), maxLeft);
      const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - 16);
      const spaceAbove = Math.max(0, anchor.top - 16);
      const openBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, Math.min(360, openBelow ? spaceBelow : spaceAbove));
      const position = openBelow
        ? { left: left + 'px', top: anchor.bottom + 8 + 'px' }
        : { left: left + 'px', bottom: viewportHeight - anchor.top + 8 + 'px' };

      const language = languageLabel(state.targetLanguage);
      const meta = state.provider
        ? providerLabel(state.provider, t) + ' · ' + language
        : language;
      const preview = state.text.length > 280 ? state.text.slice(0, 280) + '…' : state.text;
      const errorText = state.error
        ? state.error.params
          ? t(state.error.key, state.error.params)
          : t(state.error.key)
        : '';

      const onCopy = async () => {
        if (!state.translation) return;
        const ok = await copyText(state.translation);
        if (!ok) return;
        setCopied(true);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
      };

      let body;
      if (state.mode === 'loading') {
        body = h(
          'div',
          { className: 'dst-body dst-loading', role: 'status', 'aria-live': 'polite' },
          h('span', { className: 'dst-spinner' }),
          h('span', null, t('translating')),
        );
      } else if (state.mode === 'result') {
        body = h(
          'div',
          { className: 'dst-body', role: 'status', 'aria-live': 'polite' },
          state.translation,
        );
      } else {
        body = h(
          'div',
          { className: 'dst-body' },
          h('div', { className: 'dst-error', role: 'alert' }, errorText),
        );
      }

      return h(
        'div',
        {
          'data-dst-root': 'popup',
          className: 'dst-pop',
          style: Object.assign({ width: width + 'px', maxHeight: maxHeight + 'px' }, position),
          role: 'dialog',
          'aria-label': t('title'),
        },
        h(
          'div',
          { className: 'dst-head' },
          h('span', { className: 'dst-title' }, t('title')),
          meta ? h('span', { className: 'dst-meta' }, meta) : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dst-icon',
              onClick: () => controller.dismiss(),
              'aria-label': t('close'),
              title: t('close'),
            },
            h('span', { 'aria-hidden': true }, '×'),
          ),
        ),
        h('div', { className: 'dst-source', title: preview }, preview),
        body,
        state.mode === 'error' && state.error && state.error.detail
          ? h('div', { className: 'dst-detail' }, t('detail', { detail: state.error.detail }))
          : null,
        state.mode === 'result' || (state.mode === 'error' && state.error && state.error.retryable)
          ? h(
              'div',
              { className: 'dst-foot' },
              state.mode === 'result'
                ? h(
                    'button',
                    { type: 'button', className: 'dst-action', onClick: onCopy },
                    copied ? t('copied') : t('copy'),
                  )
                : null,
              state.mode === 'error'
                ? h(
                    'button',
                    { type: 'button', className: 'dst-action', onClick: () => controller.retry() },
                    t('retry'),
                  )
                : null,
            )
          : null,
        h('div', { className: 'dst-note' }, t('privacy')),
      );
    }

    function SelectionView(props) {
      const { controller, locale } = props;
      const [state, setState] = React.useState(controller.getSnapshot());
      const [, setLocaleRevision] = React.useState(0);

      React.useEffect(() => controller.subscribe(() => setState(controller.getSnapshot())), [controller]);
      React.useEffect(
        () => locale.subscribe(() => setLocaleRevision((value) => value + 1)),
        [locale],
      );

      const t = locale.bind(NS);
      if (state.mode === 'hidden') return null;
      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        state.mode === 'button'
          ? h(Trigger, { state, t, controller })
          : h(Popup, { state, t, controller }),
      );
    }

    return {
      inject: ['remote', 'slots', 'locale'],
      apply(ctx) {
        const controller = createController(ctx);
        const View = () => h(SelectionView, { controller, locale: ctx.locale });

        ctx.effect(
          () => {
            const disposeEn = ctx.locale.register(NS, 'en', en);
            const disposeZh = ctx.locale.register(NS, 'zh', zh);
            return () => {
              disposeEn();
              disposeZh();
            };
          },
          'selection-translate: locale',
        );

        ctx.effect(
          () => {
            const detach = controller.attach();
            return () => {
              detach();
              controller.dispose();
            };
          },
          'selection-translate: selection listeners',
        );

        ctx.effect(
          () => {
            const disposers = [];
            try {
              disposers.push(ctx.remote.$on('settings/document-updated', controller.invalidateLimits));
            } catch (error) {
              console.warn('[dsh-selection-translate] settings subscription unavailable', error);
            }
            try {
              disposers.push(ctx.on('connection/reset', controller.invalidateLimits));
            } catch (error) {
              console.warn('[dsh-selection-translate] connection subscription unavailable', error);
            }
            return () => {
              for (const dispose of disposers) {
                try {
                  dispose();
                } catch {
                  /* ignore */
                }
              }
            };
          },
          'selection-translate: cache invalidation',
        );

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'selection-translate',
              order: 50,
            },
            View,
          ),
        );
      },
    };
  },
});
