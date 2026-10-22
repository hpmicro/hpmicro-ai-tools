---
name: hpm-image-flash
description: 将已有镜像或用户数据烧写到 HPM 芯片的 XPI NOR、eMMC/SDXC，或通过串行启动加载到 RAM，并按需执行写后校验。用于“烧写镜像”“下载固件”“写入用户数据”；不创建、签名或加密镜像。
---

# HPM 镜像烧写

使用 `hpm-mfg-tool-ctl` 和经过探测的 `targetId`。没有可用 Target 时先读取并执行
[环境与设备连接](../hpm-mfgtool-setup/SKILL.md)。烧写外部存储器前读取
[ROM 命令序列](../../references/rom-command-sequences.md)中的“外部存储器参数”。

1. 明确输入文件、目标存储器、烧写地址或 eMMC 起始扇区。XPI NOR/eMMC 还必须明确
   配置字、配置字暂存地址及暂存 RAM 类型。XPI NOR 未指定暂存位置时使用 ILM
   `memoryId=0`、`address=0x200`；eMMC 缺少暂存信息时请求用户提供。
2. 判断输入类型。启动镜像使用镜像定义的地址；用户数据使用用户指定地址；eMMC 输入
   必须已经包含所需容器头。当前 MCP 不解析或转换镜像。
3. 给出预执行摘要：Target、文件、存储器、地址或扇区、配置字暂存位置、是否加载扩展
   固件、是否校验及可能的自动复位。当前请求未授权其中某项修改时，使用摘要请求确认。
4. 计划写后校验时，先用 `rom.query_rte` 确认 `verify-checksum` 可用；不可用时读取并
   执行 [Bootloader 扩展固件会话](../hpm-rom-firmware-session/SKILL.md)，然后使用新
   `targetId` 继续。

## XPI NOR / eMMC 固定烧写序列

按顺序调用以下 MCP 工具；每一步 `success=true` 后才进入下一步：

1. `rom.write_memory`：把配置字写入 ILM 或 DLM。
   - `memoryId`：ILM 使用 `0`，DLM 使用 `1`
   - `address`：XPI NOR 默认使用 `0x200`；不得默认使用 `0x0`
   - `data`：用户确认的 FLASH 或 eMMC 配置字
2. `rom.config_memory`：使用上一步的配置字初始化外部存储器。
   - `memoryId`：目标 XPI NOR 或 SDXC/eMMC
   - `address`：与第一步完全相同的配置字暂存地址
3. `rom.write_memory_from_file`：烧写镜像。
   - `memoryId`：与第二步完全相同
   - `address`：XPI NOR 烧写地址或 eMMC 起始扇区索引
   - `filePath`：镜像绝对路径
4. 计划包含校验时调用 `rom.verify_checksum_from_file`。
   - `memoryId`、`address`、`filePath` 与第三步完全相同

任一步失败立即停止，并报告尚未执行的后续命令。前三步全部成功才算烧写完成；第四步成功
才可报告“烧写并校验成功”。

## RAM 串行加载

RAM 串行启动镜像直接使用 `rom.load_image`，不执行上述三步。如果当前会话已加载
Bootloader 扩展固件，先把 reset 和重新建链纳入预执行摘要；复位并取得新 `targetId`
后再加载普通 RAM 镜像。

输入路径必须为不含空白或控制字符的绝对路径。Bootloader 扩展固件使用专用 skill，
不当作普通 RAM 镜像加载。
