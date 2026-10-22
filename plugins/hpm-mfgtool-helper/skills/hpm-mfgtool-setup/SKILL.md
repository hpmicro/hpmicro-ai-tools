---
name: hpm-mfgtool-setup
description: 检查 HPM 镜像烧写 CMD 配置，发现串口或 HID 设备并创建经过真实探测的 ROM Target。用于环境检查、连接故障、设备枚举或获取 targetId；不执行 ROM 数据操作。
---

# HPM 镜像烧写环境与设备连接

使用 `hpm-mfg-tool-ctl` MCP 工具得到一个可用的 `targetId`。

1. 调用 `mfg.doctor`。CMD 未配置或不兼容时报告校验原因；仅在缺少路径时向用户索取
   已安装 CMD 的绝对路径，调用 `mfg.set` 后再次检查。
2. 按用户指定的传输类型调用 `device.discover`，保留明确给出的 VID、PID、端口、HID
   路径和波特率。未指定传输类型时同时发现串口和 HID。
3. 结果唯一明确时选择设备；否则列出候选项、`accessible` 状态和权限提示，请用户选择。
4. 调用 `device.create` 执行 `query-rte 0` 真实探测。串口设备传入所选 `port` 和波特率；
   HID 设备优先传入所选 `path`，并保留 VID/PID。仅枚举到设备不代表连接可用。
5. 返回 `targetId`、传输类型、最终连接参数和探测结果。完成标准是 Target 已注册且探测
   结果 `success=true`。

只有 `device.list` 中现有 Target 的连接参数与请求完全一致时才复用。本流程不搜索 CMD，
也不执行 `rom.*` 数据操作。
