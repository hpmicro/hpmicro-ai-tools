# ProjectEntity 结构与转换

以连接服务实际公布的 `generate_hpmpc_file_content` schema 为准。以下是构造工程时的结构索引，不是可直接提交的默认芯片配置。

- `info` 必须包含 `projectName`、`sdkName`、`socName`、`packageName` 和数字类型的 `createTime`、`updateTime`。新建工程按当前时间生成毫秒时间戳；修改时保留创建时间。
- `pinmux.functions` 与 `clock.functions` 均必需，即便其中一类为空对象。函数键使用用户工程中的名称。
- 每个 pinmux 函数必须有 `selectPins`，以引脚名为键，值为 `{ signal, padCtls, options?, annotation? }`，`padCtls` 的值为字符串。管理器放在 `managers.gpiom`、`managers.trgm`、`managers.pla`。 `pinmux.alias` 位于函数集合外。
- 每个 clock 函数必须有 `selectClocks: { srcClocks: string[], funcClocks: string[] }` 及 `enableClocks: Record<string, number>`。启用值依据工程约定/实际 schema 和已有内容取值；来源不明确时询问，不把任意数值当作通用开关。可选配置为 `pllClkConfig[id].params`、`srcClkConfig[id].divFactor` 和 `funcClkConfig[id].{ from, divFactor? }`。

## 独立工具输入到工程配置

| 独立输入 | 工程位置 |
| --- | --- |
| `pins[]` 中的 `pinName` | `pinmux.functions[name].selectPins` 的键 |
| pin 的 `signal` / `padCtls` | 对应 selectPins 条目，PAD 值按工程 schema 规范化 |
| `alias` | `pinmux.alias` |
| `trgm.TRGM0` | `managers.trgm["0"]`，`io/filter/dma` 按工程 schema 转换 |
| 顶层或逐 pin 的 `gpiom` | 合并为 `managers.gpiom`，先解决同字段冲突 |
| `plaConfigs[].plaIdx` | `managers.pla` 的模块键；值为模块级 filter1 与 channels |
| `pllClocks[].pllClkId` / `params` | `pllClkConfig[id].params` |
| `srcClocks[].srcClkId` / `divider` | `srcClkConfig[id].divFactor` |
| `funcClocks[].funcClkId` / `from` / `divider` | `funcClkConfig[id].from` / `divFactor` |

工程时钟还需填写选择集合和启用记录，不能仅重命名生成工具的数组。保留现有工程的函数、排序、颜色和注释等用户内容；必要的字段类型转换需依据实际 schema 执行。封装工具可能规范化默认字段，最终保存返回对象，避免修改后继续使用旧的完整性校验值。
