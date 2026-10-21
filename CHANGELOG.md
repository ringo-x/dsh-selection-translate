# Changelog

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
