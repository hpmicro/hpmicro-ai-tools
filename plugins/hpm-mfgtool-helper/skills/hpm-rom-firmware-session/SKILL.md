---
name: hpm-rom-firmware-session
description: 加载 HPM Bootloader 扩展固件，在自动复位后重新发现设备并确认扩展 ROM 命令可用。用于启用 verify-checksum 等扩展能力、切换签名/非签名固件，或处理加载固件后的断连与重连。
---

# HPM Bootloader 扩展固件会话

使用 `hpm-mfg-tool-ctl` 和经过探测的 `targetId`。没有可用 Target 时先读取并执行
[环境与设备连接](../hpm-mfgtool-setup/SKILL.md)。

1. 明确 SoC 系列和签名状态。签名选择必须符合设备生命周期；信息不足时请用户确认，不从
   连接方式或文件名猜测。
2. 说明加载成功后设备会自动复位、现有 `targetId` 将失效。调用
   `rom.load_bootloader_firmware`，传入旧 `targetId`、SoC `series` 和布尔值 `signed`。
3. 加载失败时停止。成功后按原传输类型重新调用 `device.discover`，再用新发现的端口或 HID
   路径调用 `device.create`；HID 路径可能变化，不复用旧路径或旧 `targetId`。
4. 用 `device.create` 返回的新 `targetId` 调用 `rom.query_rte`，设置 `rteId=5` 查询支持的
   命令列表，确认需要的扩展命令已出现。完成标准是重新建链成功且能力查询通过。

加载扩展固件后不再用 `rom.load_image` 加载该 Bootloader。设备 reset 会清除扩展固件；
reset 后需要重新执行本工作流才能继续使用扩展命令。
