---
name: hpm-pla-config
description: 查询 HPM PLA 模块和可选参数，把滤波、AND/OR 门及 CFF 逻辑需求转换为通道配置，生成初始化 C 代码或 Mermaid 流程图。用于可编程逻辑阵列配置与信号逻辑可视化。
---

# HPM PLA 逻辑配置

先读取[远程会话与目标选择](../../references/service-context.md)，确定 SDK/SoC。

1. 明确输入/输出信号、逻辑关系、滤波和边沿/同步要求；保留用户指定的模块和通道。
2. 调用 `get_pla_overview` 查找实际模块、通道及 IO。返回的 `channels[].enabled` 均为默认 false，不代表板卡当前状态。模块不存在时报告当前目标的查询结果。
3. 需要构造配置时调用 `get_pla_options`，读取 `filters.filter1/filter2/filter3`、 `andGate`、`orGate` 和 `cff`。可用组的 `parameters` 中，`key: channel` 提供可选滤波器/门编号；返回名称是原始元数据，不带选定门的前缀。
4. 将需求映射成 `plaConfigs: [{ plaIdx, filter1?, channels, input?, output? }]`。通道键为 `chn0`–`chn7`，仅对参与逻辑的通道设置 `enabled: true`。 `filter2`、`filter3`、`andGate`、`orGate`、`cff` 放在对应通道内， `filter1` 放在模块级。参数值按 schema 使用字符串，`enabled` 使用布尔值。每个滤波器/门的 `channel` 依据其资源编号选择；Filter3 只支持 0–6，不能用 7。以元数据编码构造门输入，不把布尔真值直接当成硬件选择器编码。
5. 按请求调用 `generate_pla_code({ soc, sdkName, plaConfigs })` 获取 `{ init_pla }`，或调用 `generate_pla_flowchart({ soc, sdkName, plaIdx, plaConfigs })` 获取 `{ mermaid }`。同时需要代码和图时使用相同配置，逐个生成所需模块图。

核对需求中的每条逻辑路径都落在已启用通道及有效选项上。流程图只绘制已启用通道；模块缺失提示或空图不能当作预期逻辑已实现。`input`/`output` 是图示标签，实际外部连接需按 TRGM/引脚配置建立；涉及连接时使用 [引脚与信号路由](../hpm-pinmux-config/SKILL.md)。

交付模块/通道分配、关键参数编码与逻辑对应关系，以及用户要求的代码/图。单纯查看可用模块或参数时，以查询结果结束，无需创建配置。
