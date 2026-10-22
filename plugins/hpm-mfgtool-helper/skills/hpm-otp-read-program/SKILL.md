---
name: hpm-otp-read-program
description: 读取 HPM 芯片 OTP 内容，或在明确授权后编程 OTP 字并回读确认。用于 OTP 查看、配置检查、VID/PID、密钥摘要和生命周期操作；普通镜像及易失或外部存储器使用其他 skill。
---

# HPM OTP 读取与编程

使用 `hpm-mfg-tool-ctl` 和经过探测的 `targetId`。没有可用 Target 时先读取并执行
[环境与设备连接](../hpm-mfgtool-setup/SKILL.md)。

所有 OTP 操作固定使用 `memoryId=0x20000`。OTP 每次只能读取一个 4 字节 word：每次
`rom.read_memory` 都固定传入 `length=4`。读取多个 word 时，从起始地址开始按 `+4`
递增地址并逐次调用，任一分块失败立即停止。先判断请求是只读还是编程，只执行对应分支。

## 读取 OTP

1. 明确 `targetId`、4 字节对齐的 OTP 起始 `address` 和 word 数量。涉及具名配置项时，
   使用对应 SoC 资料确定地址和数量；资料不足时请求用户提供，不套用其他芯片的布局。
2. 对第 `i` 个 word 调用 `rom.read_memory`，传入 `memoryId=0x20000`、
   `address = 起始地址 + 4 × i`、`length=4`。按地址顺序逐个读取，全部成功后再汇总报告
   地址范围和每个 word 的实际值。

只读请求到此结束，不请求编程授权，也不调用 `rom.write_memory`。

## 编程 OTP

1. 明确 SoC、`targetId`、4 字节对齐的 OTP 起始 `address`、十六进制 `data` 和配置目的。
   每个十六进制字是一个 4 字节 word。涉及 VID/PID、SRK HASH、KEK、生命周期或锁定位
   时，要求用户提供对应 SoC 资料或已经确认的最终值。
2. 按 `data` 的 word 数量执行上述分块读取：第 `i` 次使用
   `address = 起始地址 + 4 × i`、`length=4`。全部成功后展示每个 word 的当前值、目标值
   和差异；任一读取失败时停止。
3. 使用准确 Target、地址和数据请求明确授权；上层请求只有在已经包含这三项时才视为授权。
4. 调用 `rom.write_memory`：保持相同 `targetId` 和 `address`，设置
   `memoryId=0x20000`，传入上述 `data`。只调用一次；失败后停止且不自动重试。
5. 使用与编程前完全相同的地址序列再次分块调用 `rom.read_memory`，每次仍传
   `length=4`，逐字报告实际值。完成标准是写入成功且所有回读 word 与目标一致。

OTP 不支持 `verify-checksum`，因此编程后的再次读取是本流程的验证步骤。

具体 SoC 决定可编程位方向、锁定和生命周期转换规则。资料不足时保持未执行状态，不根据
其他芯片或示例值推断。
