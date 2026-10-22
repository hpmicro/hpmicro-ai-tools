---
name: hpm-clock-config
description: 查询 HPM 时钟树，按目标频率规划 PLL、源时钟和功能时钟，生成时钟 C 代码或 Mermaid 信号路径。用于配置 CPU/外设时钟、查看时钟来源或分析分频；不测量硬件实际频率。
---

# HPM 时钟规划

先读取[远程会话与目标选择](../../references/service-context.md)，确定 SDK/SoC。

1. 明确目标时钟、期望频率及允许误差；从已有工程读取晶振/输入频率、共享 PLL 和其他使用者的限制。若只查看时钟来源，可直接执行查询与路径展示。
2. 调用 `get_clock_detail`。从返回数据确定实际 clock ID、可用来源、PLL 版本、参数范围及频率公式。按当前芯片公式计算，不能把示例 ID、分频定义或 PLL 参数套用到其他芯片。缺少必要输入频率或约束时，标明缺口后询问。
3. 选择满足范围与误差的 PLL/分频组合，核对共享源的其他使用者。明确目标下游时钟及频率影响；尚未覆盖的共享使用者保留为假设。无法满足时给出有效的近似方案和误差。
4. 用户要求代码时调用 `generate_clock_code`，按需传入：
   - `pllClocks: [{ pllClkId, params }]`
   - `srcClocks: [{ srcClkId, divider? }]`
   - `funcClocks: [{ funcClkId, from, divider? }]` 这里的源时钟 ID 与功能时钟 `from` 应各自来自元数据，不能仅凭名称相似替换。
5. 用户要求路径图或需核对所选链路时调用 `get_clock_signal_flow`，传 `clockId`。用与方案一致的 `pllParams`、`srcclkDivider`、`funcclkDivider`、`funcclkSource` 和 PLL `version` 覆盖默认值。v1 参数与 v2 的 `mfi/mfn/mfd` 不混用。结果包含 `pathNodes` 和 `mermaidFlowchart`；后者可能已带 Mermaid 代码围栏，展示时避免重复嵌套。

交付输入源假设、所选路径、计算频率/误差及生成代码或图。比较返回路径与所选配置；发现默认值或来源不一致时先修正再交付。图展示的是配置计算路径，不是板卡测量结果。若将片段写入现有工程，保留用户已有的无关时钟配置。

完整工程导出使用 [HPMPC 工作流](../hpm-hpmpc-project/SKILL.md)；其配置字段使用 `divFactor` 等工程结构，不能直接复制本工具的输入数组。
