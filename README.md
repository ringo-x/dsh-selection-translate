# 划词翻译（DSH 插件）

在 DSH 桌面窗口里选中文字，选区旁出现「翻译」按钮；点击后用 DSH 内置的 **Bing / Google 免费翻译接口** 翻译选中内容。不需要 API key，也没有构建步骤。

## 状态

- 版本：`0.1.0`（MVP）
- 已安装到 `desktop` profile，插件在 `shell.overlay` 中处于 active 状态
- 语法、清单、槽位、后端接口已验证；55 个单元测试通过；实际划词与视觉交互待人工确认（见“验证”）

## 功能

- 鼠标划选 / Shift+方向键选择后，在选区末端显示浮动按钮
- 翻译卡片：服务与目标语言、原文预览、译文、复制、重试、错误提示
- Esc、点击外部、滚动、窗口失焦自动关闭
- 默认跳过输入框、`textarea`、`contenteditable`，避免干扰编辑
- 主题 token 适配亮/暗色；中英文案走 `ctx.locale`
- 20 秒超时、请求取消、内存缓存、4000 字符上限检查

## 工作原理

```
选中文字
  → document mouseup / keyup
  → 校验选区（非空、长度、是否在输入框/插件卡片内）
  → shell.overlay 浮动按钮
  → 点击（mousedown preventDefault 保留选区）
  → ctx.remote.cotTranslation.translate(...)
  → Host translator → Bing / Google 免费匿名接口
  → 翻译卡片
```

- **Client**：`client.js`，纯 React（`React.createElement`），无第三方依赖。
- **Host**：`index.js` 为空，仅用于让 bundle 行存在；翻译在 Host 的 `translator` 服务里完成。
- **浮层**：注册到 `shell.overlay`，该层本身点击穿透，按钮/卡片用 `pointer-events: auto` 接收事件。
- **翻译链路**：`ctx.remote.cotTranslation` 由内置的「思考翻译」bundle 提供；目标语言/服务也跟随它的设置。

## 依赖

| 依赖 | 说明 |
|---|---|
| DSH Desktop `0.2.1-rc.2` | 插件运行在 Web Client / `shell.overlay` |
| `@deepseek-ai/dsh-experimental-cot-translation-bundle` | **必须启用**；提供 `translator` 服务与 `cotTranslation` Remote，默认 Bing + `auto` |
| Node.js（仅开发） | `node --check` 和 `scripts/check.ps1` 使用；插件运行时不依赖 Node API |

没有 npm 运行时依赖，也没有构建步骤。

## 使用

1. 在对话正文或侧栏中选中文字（输入框内默认不触发）。
2. 点击选区旁的「翻译」。
3. 卡片显示译文；支持复制、重试；Esc / 点击外部 / 滚动关闭。

修改目标语言或服务：

- 设置 → 插件 → 思考翻译
- 默认 `Bing` + `auto`（中文界面即简体中文）
- 可切换 `Google`，或填写 `zh`、`en`、`ja` 等语言代码
- 切到付费 `DeepSeek Flash` 时，划词翻译会提示切回 Bing/Google（当前版本不绑定 Session）

## 开发

```powershell
# 静态检查 + 单元测试（提交前必须全绿）
npm run check

# 只跑测试
npm test
# 等价于：powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test.ps1

# 安装或更新到当前 profile（由 agent 通过 plugin_manager 执行）
# target: D:\ai\translate-plugin
```

### 测试

测试用 Node 内置的 `node:test`，没有 npm 依赖，也不需要安装任何东西。`test/helpers/` 里的 fake DOM、fake React 和挂载器直接加载真实的 `client.js`，所以测的是实际发布的代码：

| 文件 | 覆盖 |
|---|---|
| `test/module.test.mjs` | 模块 id、`inject`、`apply` 的副作用、槽位注册、中英文案键、清单一致性 |
| `test/selection.test.mjs` | 选区校验、按钮出现与关闭时机（点击外部 / Esc / 滚动 / 失焦 / 缩放） |
| `test/translate.test.mjs` | 请求参数、目标语言、付费与不可用 provider、长度上限、缓存、超时、重试、取消 |
| `test/render.test.mjs` | 按钮与卡片结构、定位、错误文案、复制（含剪贴板降级）、关闭 |

**规则：任何修改后都必须先让 `npm run check` 通过。** 新增或修改行为、错误分支、文案键时，要同时补 `test/` 用例；不允许为了让测试通过而删除或放宽断言。这条规则对 agent 会话同样有效（见 `AGENTS.md`）。

- 本包通过符号链接安装到 profile，修改工作区文件即可被 DSH 读取；Client 插件通常由 HMR 应用，必要时刷新/重开窗口。
- 不要手动修改 profile 的 `package.json` / `cordis.patch.yml`；安装、启用、卸载走 `plugin_manager`。
- 不要直接修改 `app.asar` 内的 DSH 包；需要参考的实现先复制到工作区。

### 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 选区监听、浮层按钮、翻译卡片、Remote 调用 |
| `index.js` | Host 半，空 `apply` |
| `package.json` | bundle + `dsh.client` 声明 |
| `cordis.patch.yml` | 插入插件行 |
| `locale/*.json` | 插件管理页标题/描述 |
| `icon.svg` | 插件图标 |
| `test/` | `node:test` 单元测试与 fake DOM / fake React 辅助 |
| `AGENTS.md` | 后续 agent 会话的上下文与协作约定 |
| `CHANGELOG.md` | 版本记录 |
| `scripts/check.ps1` | 静态检查 + 测试入口 |

## 验证

已做：

- `node --check client.js` / `index.js`
- `package.json`、`locale/*.json`、`icon.svg` 解析
- `npm run check`：静态检查 + 55 个单元测试（模块/清单、选区、翻译流程、渲染、文案键）
- `shell.overlay` 中 `selection-translate` 已注册且 active
- 思考翻译 Client 插件 active，`cotTranslation` Remote 已挂载
- Bing / Google 端点本机实测 HTTP 200

待人工确认：

- 实际划词、按钮位置、卡片视觉、亮/暗色、窄窗口
- 当前会话没有浏览器控制能力，因此未做截图级验证

## 已知限制

- 选中文本会发送给 Bing / Google；卡片底部有隐私提示。
- 单次最多 4000 字符（内置翻译服务上限）。
- 依赖「思考翻译」bundle；禁用后划词翻译不可用。启用它会让展开的思考内容多出翻译工具栏（不会自动翻译）。
- 付费服务不支持划词（无 Session 绑定）。
- 只在 DSH 窗口内部生效，不是系统级划词工具。

## 下一步

- 人工验证并修正视觉/交互细节
- 可选：独立 Host 翻译服务，去掉对「思考翻译」bundle 的依赖
- 可选：输入框内划词、独立目标语言设置、快捷键触发

## Changelog

见 [CHANGELOG.md](CHANGELOG.md)。
