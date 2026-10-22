# HPM Pin Tool 插件

[English](README.md) | [简体中文](README.zh-CN.md)

`hpm-pintool-helper` 帮助你配置 HPMicro 芯片的引脚、信号路由、时钟和可编程逻辑，生成 C 代码及图示，并支持 `.hpmpc` 工程的导入与导出。

## 开始使用

1. 按照[安装说明](../../README.zh-CN.md#安装插件)安装并启用 `hpm-pintool-helper`。
2. 根据客户端提示完成登录。
3. 提供芯片型号、封装和配置需求，选择下方对应工作流。

插件连接 `https://tools.hpmicro.com/api/mcp`，需要能够访问该服务；使用这些工作流不需要在本地安装 SDK 或构建工具。

## Skill 工作流

| 技能 | 可以帮助你完成什么 |
| --- | --- |
| [hpm-pinmux-config](skills/hpm-pinmux-config/SKILL.md) | 选择外设引脚、检查分配冲突、配置信号路由并生成引脚初始化代码。 |
| [hpm-clock-config](skills/hpm-clock-config/SKILL.md) | 根据目标频率配置时钟，生成代码或时钟路径图。 |
| [hpm-pla-config](skills/hpm-pla-config/SKILL.md) | 配置可编程逻辑和滤波，生成初始化代码或流程图。 |
| [hpm-hpmpc-project](skills/hpm-hpmpc-project/SKILL.md) | 读取或保存 `.hpmpc` 工程，生成引脚和时钟源文件。 |

在提示词中明确指定技能，选择对应工作流；兼容客户端也可根据任务描述自动匹配技能。

## 示例提示词

```text
使用 hpm-pinmux-config，为我的芯片和封装查找 UART RX/TX 引脚组合，并生成引脚初始化代码。
使用 hpm-pinmux-config，检查现有引脚分配是否冲突，并给出替代方案。
使用 hpm-pinmux-config，配置我的应用需要的信号路由。
使用 hpm-clock-config，配置我的目标时钟频率，并展示时钟路径。
使用 hpm-pla-config，实现我的逻辑与滤波需求，生成初始化代码和流程图。
使用 hpm-hpmpc-project，读取我的 .hpmpc 文件，生成其中的引脚和时钟源文件。
使用 hpm-hpmpc-project，把当前配置保存为 .hpmpc 工程。
```

提问时提供已有引脚连接、目标频率和需要保留的配置。如果已经有工程文件，可以直接以该文件为起点。

## 常见问题

- 无法连接：检查网络连接，以及插件是否已启用。
- 提示登录：根据客户端提示重新登录。
- 芯片或功能不可用：让插件检查当前账号可使用的选项。
- 工程无法读取：提供完整的 `.hpmpc` 文件，并说明最近做过的修改。
