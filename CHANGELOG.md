# Changelog

## [Unreleased]

### Fixed

- 发布说明修正：`git push` 需要 `-c http.proxy=http://127.0.0.1:10808`，而 `registry.npmjs.org` 读公开元数据可直连，发布用账号 token；此前文档把「npm 也要走代理」写成了通则
- 补记市场收录机制：目录候选只来自 `SEED_QUERIES` 全文检索与 `topic:dsh-plugin`，新包在检索索引收录前搜不到

## [0.1.1] - 2026-10-21

只更新文档与发布元数据：`client.js` 与 `index.js` 逐字节未变，`0.1.0` 安装后的运行时行为完全一致。之所以发版，是因为 npm 页面上的 README 是 `bcfdab5` 时的快照，缺「发布到插件市场」一节，而 README 只在发布时更新。

### Fixed

- README 调用链改为 `ctx.get('remote.cotTranslation')`。旧写法 `ctx.remote.cotTranslation` 正是 0.1.0 的真实故障（Cordis 拒绝未注入的嵌套服务）
- 测试数从过期的 63 改为 68（`README.md`、`AGENTS.md`）
- `v0.1.0` tag 改指到与 npm 发布物一致的提交（`3ad46ae`：`client.js` 换回工作副本 id 后逐字节相同，`LICENSE` 哈希也一致）。此前指向首个提交 `5d918b1`，checkout 该 tag 会得到「必定翻译失败」的版本
- 本文件结构修正：合并两个重复的 `### Added`；把 `ctx.get` 修复归入 `[0.1.0]`，因为 npm 上的 0.1.0 确实包含它
- 补充「发布后市场何时收录」的说明：市场目录取 `SEED_QUERIES` 的全文检索候选与 `topic:dsh-plugin` 仓库，新包要等 npm 检索索引收录，或靠 GitHub topic 即时进入

### Changed

- GitHub 仓库补上 topics（`dsh-plugin`、`deepseek-harness`、`dsh`、`cordis`、`translation`、`selection`），社区市场 `dsh-compat-market` 的 GitHub 来源按 `topic:dsh-plugin` 抓取

## [0.1.0] - 2026-10-21

已发布到 npm：`@ringo-x/dsh-selection-translate@0.1.0`（MIT，public）。tarball 的 `shasum` 与本地 `npm run pack:publish` 产物一致（`6cc9666a…`），`client.js` 换回工作副本的 id 后逐字节相同。

### Fixed

- 划词翻译必定失败并显示「翻译失败，请检查网络或稍后重试」：`remote.cotTranslation` 是嵌套服务，未注入时按属性读取会被 Cordis 拒绝（`cannot get property "remote.cotTranslation" without inject`），异常发生在读取翻译偏好阶段。现在改用可选的 `ctx.get('remote.cotTranslation')` 解析（回退到属性读取），并补了对应回归用例
- `limits()` 失败/返回异常快照时不再直接放弃翻译：省略 provider、沿用界面语言继续请求，只有翻译本身失败才报错
- 翻译失败时保留 provider / 目标语言元信息，并在卡片下方显示底层错误码与信息，便于定位（不再只有一句网络提示）

### Added

- 选区浮动「翻译」按钮，注册在 `shell.overlay`
- 翻译卡片：加载 / 结果 / 错误、复制、重试、关闭
- 通过思考翻译 bundle 的 `cotTranslation` Remote 使用 Bing / Google 免费接口
- 主题 token、中英文案、插件图标与 bundle 清单
- `test/` 测试套件：用 Node 内置 `node:test` 直接加载真实的 `client.js`，覆盖模块与清单契约、选区校验、关闭时机、翻译流程、错误分支、缓存、超时、渲染与复制降级（68 例）
- `test/helpers/`：极简 fake DOM、fake React 与插件挂载器，无第三方依赖
- `npm test` 脚本与 `scripts/test.ps1`；`scripts/check.ps1` 在静态检查后追加运行测试，失败即退出
- `publish.json` + `scripts/publish.mjs` + `npm run pack:publish`：构建可发布到 npm 的产物（`dist/publish` → `dist/<name>-<version>.tgz`）。工作副本保持 `@local` + `private` 不动（profile 的 `link:` 依赖依赖它），公开发布名由构建阶段替换 `client.js` 的模块 `id` 与 `cordis.patch.yml` 的行名
- `LICENSE`（MIT）
- `test/publish.test.mjs`：断言公开身份可发布、改名是发布物与工作副本的**唯一**差异、发布物仍能被模块加载器挂载、校验器能拒绝标识符漂移
- 校验器在检测到社区市场 `dsh-compat-market` 时调用其 `evaluateCompatibility`，在发布前给出与安装期一致的兼容性结论

### Changed

- 开发规则：任何修改后必须让 `npm run check` 全绿；新增或修改行为、错误分支、文案键时同步补测试（记录在 `AGENTS.md` 与 `README.md`）

### Notes

- 依赖 `@deepseek-ai/dsh-experimental-cot-translation-bundle`（已在 desktop profile 启用）
- 实际划词与视觉交互待人工验证
- 工作副本仍是 `@local/dsh-selection-translate`，与发布物是同一份代码（仅模块标识符不同）；发布产物由 `npm run pack:publish` 生成
