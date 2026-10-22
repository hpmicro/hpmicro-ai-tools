# HPMicro AI Tools

[English](README.md) | [简体中文](README.zh-CN.md)

面向 HPMicro SDK 开发、镜像烧写、引脚/时钟配置及技术资料查询的 Agent 插件仓库。

| 插件 | 用途 |
| --- | --- |
| [hpm-sdk-helper](mcp-servers/hpmsdkctl/README.zh-CN.md) | 配置 SDK 环境、编译工程、烧录固件与调试。 |
| [hpm-mfgtool-helper](plugins/hpm-mfgtool-helper/README.zh-CN.md) | 连接设备、烧写镜像、读取和校验存储器，以及擦除操作。 |
| [hpm-knowledgebase](plugins/hpm-knowledgebase/README.zh-CN.md) | 查询 SDK 代码、芯片/开发板资料及知识库文章。 |
| [hpm-pintool-helper](plugins/hpm-pintool-helper/README.zh-CN.md) | 配置引脚、时钟和可编程逻辑，生成代码与图示，并管理工程。 |

## 前置条件

SDK 和镜像烧写插件需要 Node.js **22.15+**、Git，以及可通过 `PATH` 访问的 `npm`、`npx`。安装时需要访问 GitHub 与 npm 官方源。Agent 客户端应支持对应插件格式或 stdio MCP。

SDK 工具在本机运行。构建需要本地安装 HPM SDK、CMake、Ninja、Python 和 RISC-V 工具链，或准备好包含这些路径的 SDK Env 目录。烧录及 GDB Server 操作还需要 OpenOCD。烧录会写入目标硬件，批准执行前请核对开发板、固件与地址。

镜像烧写操作支持 Windows x64 和 Linux x86_64，需要单独安装 `hpm_manufacturing_cmd`，通过环境检查工作流配置路径并连接设备，不依赖 SDK 构建工具链。详见[插件使用说明](plugins/hpm-mfgtool-helper/README.zh-CN.md)。

## 安装插件

根据需要选择 SDK、镜像烧写、Pin Tool 或 Knowledgebase 插件，也可以组合安装。知识库插件用于查询 SDK 代码、芯片/开发板资料及知识库文章，连接地址为 `https://kb.hpmicro.com/llm/mcp`。启用插件后按提示登录即可，不需要本地 SDK 或构建工具，详见[插件使用说明](plugins/hpm-knowledgebase/README.zh-CN.md)。

Pin Tool 插件用于配置引脚、信号路由、时钟和可编程逻辑，生成代码与图示，并管理 `.hpmpc` 工程。连接地址为 `https://tools.hpmicro.com/api/mcp`，按提示登录即可，不需要本地 SDK 或构建工具。详见[工作流使用说明](plugins/hpm-pintool-helper/README.zh-CN.md)。

### Claude Code

在 Claude Code 会话中执行，按客户端提示完成安装和激活：

```text
/plugin marketplace add hpmicro/hpmicro-ai-tools
/plugin install hpm-sdk-helper@hpmicro-ai-tools
/plugin install hpm-mfgtool-helper@hpmicro-ai-tools
/plugin install hpm-knowledgebase@hpmicro-ai-tools
/plugin install hpm-pintool-helper@hpmicro-ai-tools
```

参考 [marketplace 官方文档](https://code.claude.com/docs/en/plugin-marketplaces)。

### Codex

在终端添加 marketplace：

```sh
codex plugin marketplace add https://github.com/hpmicro/hpmicro-ai-tools.git
```

在兼容客户端打开插件浏览器（Codex CLI 中使用 `/plugins`），安装并启用 `hpm-sdk-helper`、`hpm-mfgtool-helper`、`hpm-pintool-helper` 或 `hpm-knowledgebase`。不同客户端的支持情况可能不同，参考 [官方插件文档](https://learn.chatgpt.com/docs/plugins)。上述 marketplace 命令已通过本仓库使用的 CLI 帮助信息核对。

### VS Code / GitHub Copilot

使用支持 Agent 插件的 VS Code，在设置中添加：

```json
{
  "chat.plugins.enabled": true,
  "chat.plugins.marketplaces": ["hpmicro/hpmicro-ai-tools"]
}
```

在扩展视图搜索 `@agentPlugins`，选择需要的插件，确认技能与 MCP 工具已启用。参考 [Agent 插件官方文档](https://code.visualstudio.com/docs/agent-customization/agent-plugins)。

### Cursor

克隆仓库：

```sh
git clone https://github.com/hpmicro/hpmicro-ai-tools.git
```

按需将插件复制到对应的本地安装目录，保留其中的隐藏文件和目录：

| 源目录                       | 安装目录                                     |
| ---------------------------- | -------------------------------------------- |
| `plugins/hpm-sdk-helper`     | `~/.cursor/plugins/local/hpm-sdk-helper`     |
| `plugins/hpm-mfgtool-helper` | `~/.cursor/plugins/local/hpm-mfgtool-helper` |
| `plugins/hpm-knowledgebase`  | `~/.cursor/plugins/local/hpm-knowledgebase`  |
| `plugins/hpm-pintool-helper` | `~/.cursor/plugins/local/hpm-pintool-helper` |

重启 Cursor 或运行 `Developer: Reload Window`，然后打开 **Customize** 检查已安装的插件。客户端或组织策略必须允许本地插件导入。参考[官方插件文档](https://prod.cursor.com/docs/plugins)。

## 直接使用 hpmsdkctl

插件用户不需要自行编译源码。也可以单独安装命令行工具：

```sh
npm install -g hpmsdkctl --registry=https://registry.npmjs.org/
hpmsdkctl --help
hpmsdkctl --version
hpmsdkctl config init --sdk-env /path/to/sdk_env
hpmsdkctl config check
```

在支持 MCP 的客户端中，可以使用与插件一致的服务定义。最外层配置格式以客户端要求为准：

```json
{
  "mcpServers": {
    "hpm-sdk-ctl": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "--registry=https://registry.npmjs.org/", "hpmsdkctl", "mcp"]
    }
  }
}
```

如需固定 MCP 版本，将参数中的 `hpmsdkctl` 替换为 `hpmsdkctl@<version>`。

## 直接使用 hpmmfgctl

`hpmmfgctl` 提供 stdio MCP 服务，不提供 SDK CLI 子命令。按照 [包级中文文档](mcp-servers/hpmmfgctl/README.zh-CN.md) 完成本地构建，可以直接使用默认配置位置；如需隔离配置，通过 `HPMMFGCTL_CONFIG` 指定绝对配置文件路径：

```json
{
  "mcpServers": {
    "hpm-mfg-tool-ctl": {
      "command": "node",
      "args": ["/absolute/path/to/hpmmfgctl/dist/main.js", "mcp"],
      "env": { "HPMMFGCTL_CONFIG": "/absolute/path/to/hpmmfgctl/config.json" }
    }
  }
}
```

请根据操作系统调整路径。发布对应 npm 版本后，插件使用 `npx --yes --registry=https://registry.npmjs.org/ hpmmfgctl@0.1.0 mcp` 启动。先调用 `mfg.doctor` 检查环境，通过 `mfg.set` 配置 CMD，再发现设备并创建 Target，之后执行 ROM 操作。目前仅支持 stdio 传输。

## 使用示例

在请求中指定对应 skill；知识库查询直接指定插件即可。

```text
使用 hpm-config，检查我的 HPM SDK 配置，报告缺失的工具。
使用 hpm-build，构建 hello_world，先查询可用开发板和构建类型。
使用 hpm-flash-debug，查询 hpm6750evkmini 的 OpenOCD 配置并烧录这个 ELF 文件。
使用 hpm-mfgtool-setup，检查镜像烧写环境并连接选中的设备。
使用 hpm-image-flash，把这个已有镜像烧写到指定地址并校验。
使用 hpm-knowledgebase，查询与我的技术问题相关的资料，并提供出处。
使用 hpm-pinmux-config，选择外设引脚并生成初始化代码。
使用 hpm-clock-config，配置目标时钟频率并展示时钟路径。
使用 hpm-pla-config，根据我的逻辑需求生成初始化代码和流程图。
使用 hpm-hpmpc-project，读取我的 .hpmpc 工程并生成引脚和时钟源文件。
```

构建前请先初始化开发环境。所有命令、参数、配置键和 MCP 工具的完整说明，见 [包级中文文档](mcp-servers/hpmsdkctl/README.zh-CN.md)。镜像烧写工具及操作限制见 [hpmmfgctl 中文文档](mcp-servers/hpmmfgctl/README.zh-CN.md)。

## 仓库结构

```text
hpmicro-ai-tools/
├── .agents/plugins/marketplace.json    # Codex marketplace
├── .claude-plugin/marketplace.json     # Claude Code 与兼容客户端
├── .cursor-plugin/marketplace.json     # Cursor marketplace 元数据
├── plugins/
│   ├── hpm-sdk-helper/                 # SDK manifest、技能与 MCP 配置
│   ├── hpm-mfgtool-helper/             # 镜像烧写 manifest、技能与 MCP 配置
│   ├── hpm-knowledgebase/              # 知识库 manifest 与远程 MCP 配置
│   └── hpm-pintool-helper/             # Pin Tool manifest、技能、文档与远程 MCP 配置
├── mcp-servers/
│   ├── hpmsdkctl/                      # SDK CLI/MCP 源码与测试
│   └── hpmmfgctl/                      # 镜像烧写 MCP 源码与测试
└── .github/workflows/
    ├── hpmsdkctl-ci.yml
    ├── hpmsdkctl-publish.yml
    ├── hpmmfgctl-ci.yml
    └── hpmmfgctl-publish.yml
```

各 MCP 项目独立维护依赖、锁文件、测试和发布流程。根目录没有 `package.json`，也不使用 npm workspace。后续可以独立添加其他插件或 MCP，包括其他语言实现的服务。

## 本地开发

```sh
git clone https://github.com/hpmicro/hpmicro-ai-tools.git
cd hpmicro-ai-tools/mcp-servers/hpmsdkctl
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
node dist/main.js --help
```

架构和可选 SDK / 参考实现测试见包级 README。插件运行 npm 包，而不是本地构建。开发镜像烧写服务时，工作目录改为 `mcp-servers/hpmmfgctl`；安装依赖、 lint、格式检查、类型检查、构建和测试命令相同。测试本地 MCP 改动时，需要将客户端启动配置改为 `node`，参数使用 `dist/main.js` 的绝对路径及 `mcp`。

## 更新与发布

插件更新和 npm 发布是两条独立流程：

- 插件更新：调整相关 manifest 与 marketplace 的版本，用户通过客户端刷新并更新。 Cursor 本地安装需要重新复制文件。
- CLI 更新：执行 `npm install -g hpmsdkctl@latest --registry=https://registry.npmjs.org/`。
- MCP 更新：在客户端配置中选择需要的包版本，然后重启服务。固定版本不会自动升级。

`hpmsdkctl CI` 在匹配路径的分支推送和 PR 时触发，使用 Windows、macOS、Linux 与 Node.js 22 / 24 检查 lint、格式、类型、构建、测试和包内容，但不会发布。仅修改根 README 不会触发这份 CI。

`Publish hpmsdkctl` 仅在推送 `hpmsdkctl-v*` 标签时触发，要求正式版本与标签一致，执行 `prepublishOnly` 检查后发布到 npm 官方源；不会自动等待另一份多平台 CI。

`hpmmfgctl CI` 使用 Windows/Linux 和 Node.js 22 / 24 检查，并包含原生设备枚举。 `Publish hpmmfgctl` 由 `hpmmfgctl-v*` 标签触发，要求标签与正式包版本一致。该包的 npm Trusted Publisher 使用 `hpmmfgctl-publish.yml`。发布新的镜像烧写服务版本时，也需要更新插件固定使用的包版本。

发布新版本时，先在包目录执行：

```sh
npm version patch --no-git-tag-version
```

提交并推送 `package.json` 和 `package-lock.json` 的版本变更，再给这个提交打标签。例如升级后版本为 `0.1.0`：

```sh
git tag hpmsdkctl-v0.1.0
git push origin hpmsdkctl-v0.1.0
```

workflow 使用 GitHub Environment `npm`。npm Trusted Publisher 必须匹配 `hpmicro/hpmicro-ai-tools`、workflow 文件名 `hpmsdkctl-publish.yml` 和环境名 `npm`，并允许直接 `npm publish`。此流程不需要 npm token。参考 [npm Trusted Publishing 官方文档](https://docs.npmjs.com/trusted-publishers/)。已发布版本不能覆盖；当前 workflow 不支持 beta 发布。

## 常见问题

- 插件未出现：检查 marketplace 注册、仓库访问、客户端兼容性与组织策略。
- 本地 MCP 无法启动：检查 Node.js、`PATH` 及 npm 源访问情况。
- 知识库调用失败：检查网络连接、插件启用状态和登录状态；找不到资料时补充芯片/开发板型号及 SDK 版本，详见[常见问题](plugins/hpm-knowledgebase/README.zh-CN.md#常见问题)。
- Pin Tool 调用失败：检查网络连接、插件启用状态和登录状态，详见[常见问题](plugins/hpm-pintool-helper/README.zh-CN.md#常见问题)。
- 构建或烧录失败：执行 `hpmsdkctl config check`，核对工具路径。
- 镜像烧写操作失败：使用 `hpm-mfgtool-setup` 检查 CMD 配置并重新连接设备，详见[插件排查说明](plugins/hpm-mfgtool-helper/README.zh-CN.md#排查与验证范围)。
- CI 成功但 npm 未更新：检查 **Publish hpmsdkctl**，而不只是测试 CI。
- 不确定已发布版本：执行 `npm view hpmsdkctl version --registry=https://registry.npmjs.org/`。镜像源或网页缓存可能暂时显示旧信息。查询镜像烧写包时将包名替换为 `hpmmfgctl`。
- OIDC 被拒绝：检查 Trusted Publisher 的身份、环境及直接发布权限。

## 参与贡献

欢迎提交贡献。提 PR 前请阅读 [贡献指南](CONTRIBUTING.zh-CN.md)。较大改动先讨论，一个 PR 聚焦一个问题，并说明实际验证结果。发布版本由维护者单独管理。

## 许可证

本仓库采用 [MIT 许可证](LICENSE)。外部 HPM SDK、工具及依赖仍适用各自的许可证。
