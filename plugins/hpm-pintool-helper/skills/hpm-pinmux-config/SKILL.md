---
name: hpm-pinmux-config
description: 查询 HPM 芯片的引脚与信号，规划外设引脚分配、PAD 参数和 TRGM/GPIOM 路由，并生成 pinmux C 代码。用于选引脚、检查复用冲突或配置触发路由；不负责固件烧录。
---

# HPM 引脚与信号路由

先读取[远程会话与目标选择](../../references/service-context.md)，确定 SDK、SoC 和封装。最终给出可追溯到查询结果的引脚/路由配置及用户要求的代码。

## 引脚分配

1. 从用户需求和已有工程收集外设实例、信号方向、固定连接、保留引脚及电气要求。查询类请求到所需结果即可，不必生成代码。
2. 对待分配外设调用 `get_pins`，使用 `signal` 缩小候选；需要确认某个引脚的复用时用 `get_signals` 的 `pin` 过滤。`signal` 是不区分大小写的子串匹配，候选中应再次核对完整信号名和外设实例。
3. 形成引脚到完整信号名的一对一映射，并与已有配置核对。一个物理引脚不能同时分配给不同信号。候选冲突时给出可用替代；必要连接不明确时只询问影响选择的条件。
4. 用户要求 PAD 参数时调用 `get_padctls`，依据实际字段和可选值构造 `padCtls`。引脚复用数据不包含板级连线和完整电气条件，把尚未确定的电气假设明确列出。

## TRGM / GPIOM

仅在需求涉及相关路由时查询和配置：

- `get_trgm_detail` 返回 `{ modules, types, options }`。使用返回的模块名（如 `TRGM0`）构造顶层 `trgm`，子项为小写 `io`、`filter`、`dma`。从模块对应的 options 选择输入/输出和参数。按实际 schema 区分类型，例如 IO `invert` 是字符串，而 filter `invert`/`sync` 是布尔值。
- `get_gpiom_detail` 返回 `{ types, parameters }`。两个数组为空表示无可配置的 GPIOM。支持顶层 `gpiom` 与每个 pin 的 `gpiom`；同一控制器字段统一取值，不依赖冲突配置的覆盖顺序。

## 生成与交付

调用 `generate_pinmux_code`，传入同一 SDK/SoC/`package`，以及 `pins: [{ pinName, signal, padCtls?, gpiom? }]`；需要时附 `alias`、`trgm`、`gpiom`。纯路由配置且没有外部引脚时显式传 `pins: []`。

返回值是初始化函数体片段，不自动等同于完整可编译源文件。集成到用户工程时保留已有函数结构、头文件和无关分配。交付引脚/信号映射、相关路由与 PAD 取值、生成结果，并说明仍未验证的板级连接。需要完整 `.hpmpc` 工程时使用 [HPMPC 工作流](../hpm-hpmpc-project/SKILL.md)。
