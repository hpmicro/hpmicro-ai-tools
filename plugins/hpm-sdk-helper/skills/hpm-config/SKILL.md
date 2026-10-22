---
name: hpm-config
description: >
  HPMicro 微控制器 HPM SDK 开发环境配置。用于初始化和管理 hpmsdkctl 工具链配置。
  Use when user needs to (1) initialize HPM SDK environment for first use, (2) switch SDK version,
  (3) verify the current toolchain configuration, or (4) modify individual tool paths.
  Triggered by phrases like "初始化环境", "配置 SDK", "切换 SDK", "check config", "setup toolchain".
---

以下工具由 hpmsdkctl MCP server 提供。

## 工作流程

### 首次初始化（推荐方式）

1. 询问用户 SDK env 目录路径（包含 `cmd_params.yaml` 的目录）
2. 调用 `config.init`，传入 `sdk_env: "<path>"`
3. 调用 `config.check` 验证所有路径可访问

### 手动初始化（无 SDK env 目录时）

1. 调用 `config.init`，分别传入 `hpm_sdk`, `cmake`, `ninja`, `python`, `toolchain`, `openocd`, `toolchain_variant`（默认 `gcc`）
2. 调用 `config.check` 验证

### 查看 / 修改配置

| 工具 | 用途 |
|---|---|
| `config.list` | 列出全部配置 |
| `config.get` | 按 key 读取（key: `hpm_sdk`, `tools.cmake`, `tools.ninja`, `tools.python`, `tools.openocd`, `env.GNURISCV_TOOLCHAIN_PATH`, `env.HPM_SDK_TOOLCHAIN_VARIANT`） |
| `config.set` | 设置 key=value 并持久化 |
