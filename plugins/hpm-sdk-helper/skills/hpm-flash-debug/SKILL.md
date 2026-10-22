---
name: hpm-flash-debug
description: >
  HPM 微控制器烧录和调试。用于查询 OpenOCD 配置、烧录固件到目标板、启动 GDB 调试服务器。
  Use when user wants to (1) flash firmware to an HPM board, (2) start a GDB server for debugging,
  (3) discover OpenOCD probe/SoC/board configurations.
  Triggered by phrases like "烧录", "flash", "调试", "debug", "gdb", "OpenOCD", "program board", "下载固件".
---

以下工具由 hpmsdkctl MCP server 提供。前提: 先通过 `config.check` 确认配置就绪。

## 工作流程

### 查询调试配置

1. 调用 `openocd.list_configs`:
   - `board`: board 名称或路径（必填）
   - `app`: sample 路径或 app 目录（可选，用于检测多核项目）
2. 返回默认推荐的 probe、soc、board 配置

### 烧录固件

1. 从 `openocd.list_configs` 获取 probe/soc/board
2. 调用 `openocd.flash`:
   - `probe`, `soc`, `board`（来自上一步）
   - `file`: 固件文件路径（必填）
   - `address`: 十进制或十六进制烧录地址；BIN 文件必须填写，其他格式可省略

### 启动 GDB 服务器

1. 从 `openocd.list_configs` 获取配置
2. 调用 `openocd.start_gdb_server`，传入 `probe`, `soc`, `board`
