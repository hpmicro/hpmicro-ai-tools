---
name: hpm-memory-read-erase
description: 查询、读取、导出或校验 HPM 芯片的 ILM、DLM、XPI NOR 和 eMMC/SDXC，并擦除 XPI NOR。用于内存查看、转储、备份、镜像比较、快速校验、区域擦除或整片擦除；OTP 操作使用 hpm-otp-read-program。
---

# HPM 存储器读取与擦除

使用 `hpm-mfg-tool-ctl` 和经过探测的 `targetId`。没有可用 Target 时先读取并执行
[环境与设备连接](../hpm-mfgtool-setup/SKILL.md)。操作 XPI NOR 或 eMMC/SDXC 前读取
[ROM 命令序列](../../references/rom-command-sequences.md)中的“外部存储器参数”。

1. 明确 `targetId`、`memoryId`、地址或扇区索引和字节长度。需要几何信息时调用
   `rom.query_rte`，使用 `rteId=4`，并将 `argument` 设为同一个目标 `memoryId`。
2. 根据下面对应分支逐条调用。每一步 `success=true` 后才继续；完成时报告实际范围和
   输出文件。

## XPI NOR / eMMC 操作前的固定配置序列

外部存储器尚未配置时先执行：

1. `rom.write_memory`：`memoryId` 使用 `0`（ILM）或 `1`（DLM），`address` 使用配置字
   暂存地址，`data` 使用用户确认的配置字。XPI NOR 未指定其他有效位置时使用 ILM
   `memoryId=0`、`address=0x200`，不得默认使用 `0x0`。
2. `rom.config_memory`：`memoryId` 使用目标 XPI NOR 或 SDXC，`address` 与第一步的配置字
   暂存地址完全相同。

该序列会写设备 RAM。当前请求只授权纯读取时，先说明并请求授权；两步均成功后才能执行
下面的读取、校验或擦除。

## 读取或导出

- 不超过 65536 字节：调用 `rom.read_memory`，传入目标 `memoryId`、起始 `address` 和
  `length`。
- 更大范围或备份：调用 `rom.read_memory_to_file`，使用相同的 `memoryId`、`address`、
  `length`，并传入不含空白或控制字符的绝对 `filePath`。仅在用户授权替换该准确文件时
  设置 `overwrite=true`。

## 快速校验

- 十六进制字数组：调用 `rom.verify_checksum`，传入 `data`。
- 参考文件：调用 `rom.verify_checksum_from_file`，传入绝对 `filePath`。

两者都复用目标 `memoryId` 和比较起始 `address`。校验前用 `rom.query_rte` 的
`rteId=5` 确认命令可用；命令不在列表中时转到 `hpm-rom-firmware-session`，并在重新
建链后使用新 `targetId` 执行一次校验。

## 擦除 XPI NOR

- 区域擦除：调用 `rom.erase_region`，传入目标 XPI NOR `memoryId`、起始 `address` 和
  `length`。
- 整片擦除：调用 `rom.erase_chip`，只传目标 XPI NOR `memoryId`；地址和长度不限制范围。

执行前展示准确 Target 和擦除范围并取得授权。擦除失败后不重试，也不执行后续操作。

读取和查询不会修改目标存储内容；外部存储器配置、文件输出及擦除分别作为独立修改说明。
