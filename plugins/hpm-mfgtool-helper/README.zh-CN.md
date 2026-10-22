# HPM 镜像烧写插件

[English](README.md) | [简体中文](README.zh-CN.md)

`hpm-mfgtool-helper` 包含 5 个工作流技能及本地 `hpmmfgctl` stdio MCP 服务配置，通过独立安装的 HPM Manufacturing CMD 发现串口/HID 设备，执行 ROM 存储器、镜像烧写、OTP 和扩展固件操作。

## 前置条件与安装

- Windows x64 或 Linux x86_64，Node.js **22.15+**，以及 `PATH` 中的 `npm`/`npx`。
- 支持插件/stdio MCP 的客户端，以及单独安装的 `hpm_manufacturing_cmd`；这些 ROM 工作流不依赖 SDK 构建工具链。
- 通过串口或 HID 连接、已进入相应 ROM 启动模式的目标设备。
- 能访问 npm 源，下载插件固定使用的 `hpmmfgctl@0.1.0`。

按[仓库安装说明](../../README.zh-CN.md#安装插件)安装插件。 [.mcp.json](.mcp.json) 配置启动以下命令：

```text
npx --yes --registry=https://registry.npmjs.org/ hpmmfgctl@0.1.0 mcp
```

服务端独立发布，分发插件前需先发布对应 npm 版本。本地源码开发可直接运行构建后的服务，见[包级 MCP 说明](../../mcp-servers/hpmmfgctl/README.zh-CN.md)。当前实现仅支持 stdio 传输。

设备发现使用原生串口/HID 模块；没有匹配预编译二进制的环境可能需要 C/C++ 工具链。 Linux HID 访问还可能需要 udev 规则或用户组权限。

## CMD 配置

先调用 `mfg.doctor`，未配置时通过 `mfg.set` 传入已安装 CMD 的绝对路径。服务验证可执行文件名及命令行为后才保存，不搜索 `PATH` 或安装目录。 CMD 可执行文件路径允许包含空格。

| 平台 | 默认配置文件 |
| --- | --- |
| Windows | `%APPDATA%/hpmicro/hpmmfgctl/config.json` |
| Linux | `$XDG_CONFIG_HOME/hpmicro/hpmmfgctl/config.json`，或 `~/.config/hpmicro/hpmmfgctl/config.json` |

如需隔离配置，在 MCP 服务环境变量中将 `HPMMFGCTL_CONFIG` 设为绝对**文件路径**。 `mfg.get` 读取配置，`mfg.clear` 清除保存的 CMD 路径。配置检查不访问目标硬件。

## Skill 工作流

| 技能 | 工作流 |
| --- | --- |
| [hpm-mfgtool-setup](skills/hpm-mfgtool-setup/SKILL.md) | 检查 CMD、发现设备，创建真实探测成功的 Target。 |
| [hpm-image-flash](skills/hpm-image-flash/SKILL.md) | 将已有镜像/用户数据写入 XPI NOR 或 eMMC/SDXC，或加载 RAM 启动镜像；按需校验。 |
| [hpm-memory-read-erase](skills/hpm-memory-read-erase/SKILL.md) | 查询、读取、导出或校验 ILM/DLM/XPI NOR/eMMC 数据，擦除 XPI NOR 区域或整片。 |
| [hpm-otp-read-program](skills/hpm-otp-read-program/SKILL.md) | 逐字读取 OTP，或明确授权后单次编程并回读确认。 |
| [hpm-rom-firmware-session](skills/hpm-rom-firmware-session/SKILL.md) | 加载 Bootloader 扩展固件，自动复位后重新建链，确认扩展 ROM 命令。 |

兼容客户端可以按任务选择技能，也可按名称显式调用。典型会话流程：

1. 调用 `mfg.doctor`，必要时用 `mfg.set` 配置 CMD。
2. 按所需传输类型调用 `device.discover`，选择目标设备。
3. 调用 `device.create`，通过 `query-rte 0` 探测成功后取得 `targetId`。
4. 使用该 `targetId` 执行相应技能的 `rom.*` 操作。
5. 完成后调用 `device.delete` 释放 Target。

枚举到设备不代表连接可用。Target 只存在于当前 MCP 进程，服务重启后需要重新创建。加载扩展固件后重新发现并创建 Target，HID 路径可能变化。设备 reset 会清除扩展固件，之后使用扩展命令需再次加载。

## 操作边界

- XPI NOR/eMMC 操作需要先把配置字写入设备 RAM，再调用 `rom.config_memory`。即便后续只是读取，该准备步骤也会写 RAM。按技能的 [ROM 命令序列](references/rom-command-sequences.md#外部存储器参数)执行。 XPI NOR 未指定其他有效暂存位置时使用 ILM `0x200`；eMMC 暂存参数需单独明确。
- XPI NOR 传输地址使用字节地址，eMMC/SDXC 使用扇区索引，长度均为字节数。配置地址始终指向 RAM 中暂存的配置字。
- `rom.read_memory` 内联读取上限为 65536 字节，更大范围使用 `rom.read_memory_to_file`。OTP 工作流每次读取一个对齐的 4 字节 word，不支持 checksum 校验，编程后通过回读确认；编程失败不自动重试。
- ROM 文件路径必须为不含空白或控制字符的绝对路径；输入文件必须存在。导出文件的父目录必须存在，替换文件需对该文件授权并设置 `overwrite: true`。
- 写入、配置、擦除、加载、复位及文件替换需要覆盖实际 Target、范围/数据和文件的授权。服务本身没有额外确认步骤。检查 `isError` 及操作结果的 `success`、`exitCode`、 `timedOut`，任一步失败即停止序列。

当前 MCP 覆盖设备和 ROM 操作。镜像创建、签名/加密及量产包导出仍属于底层 CMD 能力，尚未封装为 MCP 工具。当前 MCP 擦除工具只接受 XPI NOR，不接受 eMMC/SDXC。

配置/设备工具、ROM 参数、Memory ID 和超时的完整说明见 [hpmmfgctl 文档](../../mcp-servers/hpmmfgctl/README.zh-CN.md)。

## 示例提示词

在提示词中明确指定技能，选择对应工作流；兼容客户端也可根据任务描述自动匹配技能。

```text
使用 hpm-mfgtool-setup，检查 Manufacturing CMD 配置，发现串口/HID 设备。
使用 hpm-mfgtool-setup，连接选中的设备，创建真实探测成功的 Target。
使用 hpm-image-flash，把这个已有镜像烧写到指定 XPI NOR 地址并校验。
使用 hpm-memory-read-erase，把指定存储器范围导出到这个绝对文件路径。
使用 hpm-otp-read-program，从这个对齐地址读取三个 OTP word，不执行编程。
使用 hpm-rom-firmware-session，加载匹配的 Bootloader 扩展固件，重新连接并检查 checksum 支持。
```

## 排查与验证范围

- 启动失败：检查 Node.js、`npx`、npm 源访问及原生模块安装情况。
- CMD 异常：调用 `mfg.doctor`，检查 `HPMMFGCTL_CONFIG`，用 `mfg.set` 配置兼容路径。
- 连接异常：检查 ROM 启动模式、串口/HID 选择、端口占用及 Linux 权限；以 `device.create` 的实际探测确认连接。
- Target 不存在：服务重启或固件会话切换后重新创建。
- checksum 不可用：查询 ROM 命令，必要时执行扩展固件工作流，确认芯片系列与签名选择。
- ROM/文件操作失败：检查 Memory ID、地址单位、外部存储器初始化、路径限制和返回日志。

本说明已对照仓库配置、技能和本地服务契约核对，未验证 npm 发布状态或真实硬件。开发检查和硬件验证要求见[包级文档](../../mcp-servers/hpmmfgctl/README.zh-CN.md)。
