# 贡献指南

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

欢迎贡献插件、MCP、测试和文档。开始前请阅读 [README](README.zh-CN.md) 及相关包文档。
Issue 和 PR 描述可使用中文或英文，源码注释使用英文。

## 开始前

- 搜索已有 Issue 和 PR，避免重复工作。
- 小修复、文档改进可直接提 PR。
- 新插件或 MCP、大型重构、有广泛影响的新依赖、不兼容变更，请先开 Issue 讨论。
- 一个 PR 解决一个问题，不混入无关清理或格式化。

## 贡献流程

1. Fork 仓库，从最新 `main` 创建分支，例如 `fix/hpmsdkctl-config` 或 `docs/install-guide`。
2. 实现讨论范围内的改动，补充测试和文档。
3. 执行适用检查，记录结果与验证限制。
4. 使用 PR 模板向 `main` 提交 PR；未完成的工作使用 Draft。
5. 处理审核意见，与审核者确认并解决讨论。
6. 由维护者审核、合并，按需单独安排发布。

PR 标题应明确，例如 `fix(hpmsdkctl): validate OpenOCD path`、
`feat(hpm-sdk-helper): improve build guidance` 或 `docs: clarify installation`。
不强制自动校验每条 commit 的命名。优先使用 Squash merge；这是流程建议，不代表已设置 GitHub 强制规则。

普通贡献 PR 不修改发布版本、不创建发布标签、不发布包；这些由维护者统一处理。
依赖变更仍应同步锁文件。如果维护者明确要求修改版本，请在 PR 中说明。

## 验证要求

修改 hpmsdkctl 代码时，在包目录执行：

```sh
cd mcp-servers/hpmsdkctl
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

Bug 修复应尽可能添加覆盖真实问题的回归测试；无法添加时说明原因。
不要提交生成的 `dist`、`node_modules`、`.test-bin`、本地配置、凭据或构建产物。

| 改动        | 所需验证说明                                                 |
| ----------- | ------------------------------------------------------------ |
| 文档        | 链接和示例有效，中英文内容同步                               |
| 插件、技能  | JSON 有效，manifest 和资源路径正确，说明验证过的客户端及版本 |
| CLI、MCP    | 上述检查通过，覆盖变更行为的测试，更新公开契约               |
| 烧录、调试  | SDK 和工具版本、适用时的开发板信息、实际验证范围             |
| 新插件、MCP | 事先讨论，独立依赖、文档、测试及 CI / 发布方案               |

不要求所有贡献者都具备硬件、完整 SDK 或参考实现。请区分 mock / 单元测试与真实 SDK、
硬件验证，说明跳过的测试和缺失设备。不要宣称执行过未运行的检查，也不要仅为了勾选清单而烧录硬件。

## 代码与兼容性

- 遵循相关项目的格式化、lint 和架构规范。
- 内部使用明确的 camelCase 名称；导出函数、类及不明显的契约使用英文 JSDoc，函数之间留空行。
- 保持现有 CLI flag、MCP snake_case 字段和配置格式；不兼容变更需提前讨论并记录。
- CLI / MCP 适配层与业务逻辑分离，不把某个适配层的输出或错误文案耦合进公共逻辑。
- 同步受影响文档的中英文版本，确保可执行示例和协议 schema 与实现一致。
- 各 MCP 独立维护依赖，未经讨论不引入根 npm workspace。
- 许可变更时同步适用的 LICENSE 副本和元数据。

## 审核与 CI

PR 应说明动机、关联 Issue、改动概要、实际验证结果、兼容性影响和文档更新。
不适用的检查请注明原因，不要勾选成“已通过”。

外部 PR 应经过维护者批准后合并，适用 CI 必须通过，审核讨论必须解决。
维护者可能要求拆分 PR、补充测试或调整方案。这些是贡献流程约定，GitHub 分支保护由管理员另行设置。

目前 hpmsdkctl CI 使用路径过滤，仅在包或 CI workflow 改动时运行。
只改插件或文档的 PR 可能没有 CI，这不代表已验证。目前尚无统一 PR gate；
处理跳过检查的问题之前，不应把这份带过滤的 workflow 设为所有 PR 的必需检查。

Fork workflow 可能需要维护者批准，尤其是首次贡献。不要给 PR 验证增加 secrets、
提权或发布步骤；workflow 改动需要维护者重点审核。
PR 合并不会自动发布 npm，发布使用维护者管理的版本标签。

## 许可与沟通

除非另有约定，贡献按仓库的 [MIT 许可证](LICENSE) 提交。
仅提交你有权贡献的内容，保留第三方许可及版权声明；不要求额外签署 CLA。
外部 SDK 与依赖仍适用各自许可证。

请尊重其他贡献者，就技术取舍建设性沟通；Issue、示例、日志和截图中不要包含隐私信息。
