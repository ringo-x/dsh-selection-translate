# Changelog

## [Unreleased]

### Fixed

- 划词翻译必定失败并显示「翻译失败，请检查网络或稍后重试」：`remote.cotTranslation` 是嵌套服务，未注入时按属性读取会被 Cordis 拒绝（`cannot get property "remote.cotTranslation" without inject`），异常发生在读取翻译偏好阶段。现在改用可选的 `ctx.get('remote.cotTranslation')` 解析（回退到属性读取），并补了对应回归用例
- `limits()` 失败/返回异常快照时不再直接放弃翻译：省略 provider、沿用界面语言继续请求，只有翻译本身失败才报错
- 翻译失败时保留 provider / 目标语言元信息，并在卡片下方显示底层错误码与信息，便于定位（不再只有一句网络提示）

### Added

- `test/` 测试套件：用 Node 内置 `node:test` 直接加载真实的 `client.js`，覆盖模块与清单契约、选区校验、关闭时机、翻译流程、错误分支、缓存、超时、渲染与复制降级（63 例）
- `test/helpers/`：极简 fake DOM、fake React 与插件挂载器，无第三方依赖
- `npm test` 脚本与 `scripts/test.ps1`；`scripts/check.ps1` 在静态检查后追加运行测试，失败即退出

### Changed

- 开发规则：任何修改后必须让 `npm run check` 全绿；新增或修改行为、错误分支、文案键时同步补测试（记录在 `AGENTS.md` 与 `README.md`）

## [0.1.0] - 2026-10-21

### Added

- 选区浮动「翻译」按钮，注册在 `shell.overlay`
- 翻译卡片：加载 / 结果 / 错误、复制、重试、关闭
- 通过 `ctx.remote.cotTranslation` 使用 Bing / Google 免费接口
- 主题 token、中英文案、插件图标与 bundle 清单
- `scripts/check.ps1` 静态检查脚本

### Notes

- 依赖 `@deepseek-ai/dsh-experimental-cot-translation-bundle`（已在 desktop profile 启用）
- 实际划词与视觉交互待人工验证
