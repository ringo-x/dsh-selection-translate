# AGENTS.md

面向接手本仓库的 agent 会话。先读 [README.md](README.md)。

## 项目定位

DSH Desktop 的 Web Client 插件：划词 → 浮动按钮 → 翻译卡片。纯 JavaScript + React，无构建、无 npm 运行时依赖。

## 关键约束

- 不要手动修改 profile 的 `package.json` / `cordis.patch.yml`；用 `plugin_manager` 安装/启用/卸载。
- 不要直接改 `app.asar` 内的 DSH 包；参考实现先复制到工作区。
- Client 只用 `require('react')`；不要 import `@deepseek-ai/dsh-client-ui-primitives` 或其他 Harness Client 包。
- 样式只用 `--dsw-alias-*` 主题 token；不要写死颜色（阴影/图标除外）。
- 可见文案走 `ctx.locale`；`locale/*.json` 只放插件管理页的 `meta.title` / `meta.description`。
- 浮层资源在 `apply` 中用 `ctx.effect` 注册并清理；不要 append 到 `document.body`（剪贴板降级除外）。
- 选区默认跳过输入框/编辑器；不要读其他插件的 DOM/样式来定位。

## 测试规则（强制，每次修改后）

**任何修改都必须在测试通过后才算完成。** 没有例外，也不接受“这次只改了文案 / 清单 / 样式”的理由。

- 提交或汇报前运行 `npm run check`（等价于 `scripts/check.ps1`）：先做语法/清单静态检查，再跑 `test/*.test.mjs`。全绿才算完成。
- 新增或修改行为、错误分支、关闭时机、文案键时，必须同时在 `test/` 里增加或更新用例；修 bug 先补能复现的回归用例。
- 不得为了让测试通过而删除用例、放宽断言或跳过测试；如果行为确实变了，同步更新断言并在提交信息 / `CHANGELOG.md` 里写明原因。
- 测试无法运行（如环境缺 Node.js）时，必须明确说“未验证”，不得声称通过。
- 测试是开发期资产：不要把它们加进 `package.json` 的 `files`，也不要引入 npm 依赖。

## 运行机制

- `shell.overlay` 是全窗口、点击穿透的浮层；按钮/卡片需 `pointer-events: auto`。
- 翻译：`const face = ctx.get('remote.cotTranslation')`，然后 `face.limits(signal)` + `face.translate({ text, targetLanguage, provider }, signal)`，返回 `RemoteResult`（`{ ok, value }` / `{ ok, error }`）。不要写成 `ctx.remote.cotTranslation`（见「已知坑」）。
- `targetLanguage` 为 `auto` 时用 `ctx.locale.getSnapshot().active`；provider 必须等于 `limits().preferences.provider`。
- 付费 provider（`deepseek-*`）没有当前 Session，当前版本直接提示切换；不要尝试伪造 sessionId。
- 依赖 `@deepseek-ai/dsh-experimental-cot-translation-bundle` 启用；它负责 Host `translator` 与 Client Remote 的挂载。

## 当前环境状态（2026-10-21）

- 工作区：`D:\ai\translate-plugin`
- Profile：`desktop`
- 本包已通过 `plugin_manager install_bundle` 安装并启用；profile 中是符号链接
- 思考翻译 bundle 已启用（Bing/Google 后端）
- 静态检查、槽位注册、后端端点已验证；单元测试（63 例）通过；**实际划词和视觉尚未验证**

## 开发与验证

```powershell
# 静态检查 + 单元测试（必须全绿）
npm run check

# 只跑测试
npm test
# 等价于：powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test.ps1
```

测试用 Node 内置 `node:test`，没有 npm 依赖：

| 文件 | 覆盖 |
|---|---|
| `test/module.test.mjs` | 模块 id、`inject`、`apply` 的副作用、槽位注册、中英文案键完整性、清单一致性 |
| `test/selection.test.mjs` | 选区校验（空/超长/输入框/插件 UI）、按钮出现与关闭时机 |
| `test/translate.test.mjs` | 请求参数、目标语言解析、付费/不可用 provider、长度上限、缓存、超时、重试、取消 |
| `test/render.test.mjs` | 按钮与卡片的 DOM 结构、定位、错误文案、复制降级、关闭 |

`test/helpers/` 提供 fake DOM、fake React 和挂载器，直接加载真实的 `client.js`，因此测试覆盖实际发布的代码而不是复制品。`scripts/test.ps1` 会在 Node 支持时加上 `--experimental-test-isolation=none`（沙箱环境禁止子进程管道，单进程更稳），否则回退到默认的 `node --test`。

安装/更新（agent）：

```
plugin_manager install_bundle target=D:\ai\translate-plugin
```

验证：

1. `npm run check`（静态检查 + 测试）通过。
2. `cordis_inspect_query`（client, Slots）root `shell.overlay` → occupant `selection-translate` active。
3. 同一 provider root `conversation.chat.reasoning.body` → 思考翻译 occupant active（证明 Remote 已挂载）。
4. 人工在桌面窗口划词试用；不要启动独立浏览器、搜索认证 token、或用 DOM 模拟替代（遵循 DSH 验证规范）。
5. 如果改了 Client 代码但页面没更新，刷新/重开窗口。

## 已知坑

- 桌面页面 origin 是 `dsh-app://app/`，通过 IPC 走 Remote；不要假设能直接 fetch `http://127.0.0.1:6477`。
- **`remote.cotTranslation` 是嵌套服务**：直接读 `ctx.remote.cotTranslation` 会被 Cordis 拒绝（`cannot get property "remote.cotTranslation" without inject`），必须用可选的 `ctx.get('remote.cotTranslation')`（或先 `ctx.inject(['remote.cotTranslation'])`）。这个异常发生在 `limits()` 之前，表现为「翻译失败，请检查网络」且卡片没有 provider 元信息——0.1.0 的真实故障原因，2026-10-21 已修。
- 翻译服务稳定依赖思考翻译 bundle；禁用后弹窗会提示 `serviceUnavailable`。
- 免费接口可能限流/不可达；Bing 默认更稳，Google 在部分地区不可用。
- `shell.overlay` 可能被更高层模态遮挡；当前 `order: 50`，如遇遮挡再调。
- 剪贴板 API 在自定义协议下可能不可用，代码已有 `execCommand` 降级。

## 协作约定

- **先确认范围再动手**：0.1.0 是在用户只要求“先探讨”时直接实现的，后续不要重复。
- 修改行为、增加依赖、启用/禁用其他 bundle 之前，先说明影响并取得确认。
- 提交信息用 Conventional Commits；版本变更同步 `package.json`、`CHANGELOG.md`、git tag。
- 不要提交 `node_modules`、日志、profile 文件或任何密钥。

## 下一步候选

- 人工验证后的视觉/交互修正
- 独立 Host 翻译服务（去掉思考翻译 bundle 依赖）
- 输入框内划词、独立目标语言、快捷键触发
