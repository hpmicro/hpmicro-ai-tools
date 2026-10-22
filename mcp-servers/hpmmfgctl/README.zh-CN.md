# hpmmfgctl（TypeScript）

[English](README.md) | [简体中文](README.zh-CN.md)

使用 TypeScript 实现的 HPM 镜像烧写 stdio MCP 服务。它调用本机安装的镜像烧写 CMD，通过串口或 HID 发现、探测和操作 HPM ROM 设备。

支持 Windows x64 和 Linux x86_64，需要 Node.js 22.15 及以上版本，并需单独安装镜像烧写 CMD。服务不会搜索 `PATH` 或安装目录。

## 安装

```sh
npm install -g hpmmfgctl --registry=https://registry.npmjs.org/
hpmmfgctl --help
```

也可以使用 `npx --yes "hpmmfgctl@<version>"` 固定运行指定版本。

设备发现依赖 `@serialport/bindings-cpp` 和 `node-hid`，两者均包含原生组件。没有适用预编译文件的环境可能需要 C/C++ 原生构建工具链。Linux HID 使用 hidraw 后端，可能还需要配置 udev 规则或用户组权限。

## CLI

`hpmmfgctl` 只负责启动 MCP 服务，不直接提供镜像烧写操作子命令。支持以下两种等价入口：

```sh
hpmmfgctl mcp
hpmmfgctl serve --stdio
```

服务通过标准输入输出使用 MCP 协议；stdout 仅承载协议消息。

## 配置

默认配置文件位置：

| 操作系统 | 默认位置 |
| --- | --- |
| Windows | `%APPDATA%/hpmicro/hpmmfgctl/config.json` |
| Linux | `$XDG_CONFIG_HOME/hpmicro/hpmmfgctl/config.json`，或 `~/.config/hpmicro/hpmmfgctl/config.json` |

环境变量 `HPMMFGCTL_CONFIG` 可覆盖默认配置文件路径，值应指向配置文件，而不是目录。配置格式兼容旧 Go 服务：

```json
{
  "mfgCmdPath": "C:\\Program Files\\HPMicro\\hpm_manufacturing_cmd.exe"
}
```

建议使用 `mfg.set` 写入配置，而不是手动编辑文件。它会先检查以下条件，全部通过后才保存：

- 路径为绝对路径，且指向可执行的普通文件；
- Windows 文件名为 `hpm_manufacturing_cmd.exe`，Linux 文件名为 `hpm_manufacturing_cmd`；
- `--version`、无参数错误退出和 `--help` 行为兼容；
- 帮助信息包含服务需要的 `-p`、`-u`、`-r`、`-t` 和 `-f` 选项。

CMD 路径本身可以包含空格。读取不存在的配置文件会得到空配置；只有 `mfg.set` 或 `mfg.clear` 才会创建配置目录并写入配置。

## MCP

建议固定经过验证的包版本：

```json
{
  "mcpServers": {
    "hpm-mfg-tool-ctl": {
      "command": "npx",
      "args": ["--yes", "--registry=https://registry.npmjs.org/", "hpmmfgctl@<version>", "mcp"]
    }
  }
}
```

将 `<version>` 替换为实际版本。需要隔离配置时，可在该服务的 `env` 中将 `HPMMFGCTL_CONFIG` 设置为一个绝对配置文件路径。本地开发时可将 `command` 改为 `node`，并把 `args` 设置为构建后的 `dist/main.js` 绝对路径和 `mcp`。

### 推荐工作流

1. 调用 `mfg.doctor` 检查配置和 CMD 兼容性；未配置时调用 `mfg.set`。
2. 调用 `device.discover` 枚举串口或 HID 设备。
3. 调用 `device.create`。服务会执行 `query-rte 0` 真实探测，成功后返回 `targetId`。
4. 使用 `targetId` 调用 `rom.*` 工具。
5. 不再使用设备时调用 `device.delete`。

Target 只存在于当前 MCP 进程中，服务重启后必须重新创建。CMD 进程串行执行，排队中和执行中的请求均可取消；启动外部命令时不经过 shell。

### 完整 MCP 工具参考

`?` 表示可选参数，其余参数均为必填；无参数工具传入 `{}`。参数名区分大小写，并使用 camelCase。所有工具都返回结构化结果；前置条件错误或操作失败时设置 MCP `isError: true`。

#### 配置工具

| 工具         | 参数   | 行为                                                                   |
| ------------ | ------ | ---------------------------------------------------------------------- |
| `mfg.doctor` | 无     | 强制重新检查 CMD，返回服务版本、平台、配置路径、已配置路径和兼容性结果 |
| `mfg.get`    | 无     | 读取当前配置；未配置时返回空对象                                       |
| `mfg.set`    | `path` | 校验并保存 CMD 绝对路径；失败时不修改已有配置                          |
| `mfg.clear`  | 无     | 清除已保存的 CMD 路径和兼容性缓存                                      |

`mfg.doctor` 和 `mfg.set` 会启动 CMD 进行兼容性检查，但不会访问目标硬件。

#### 设备与 Target 工具

| 工具 | 参数 | 行为 |
| --- | --- | --- |
| `device.discover` | `transport`；`vid?`、`pid?` | 枚举 `serial` 或 `hid` 设备；VID/PID 只过滤 HID |
| `device.create` | `transport`；`port?`、`baudRate?`、`path?`、`vid?`、`pid?`、`timeoutMs?` | 探测设备，成功后注册进程内 Target |
| `device.list` | 无 | 列出当前进程中已注册的 Target 及连接参数 |
| `device.delete` | `targetId` | 删除一个已注册 Target；未知 ID 报错 |

连接参数说明：

| 参数        | 含义与约束                                                             |
| ----------- | ---------------------------------------------------------------------- |
| `transport` | `serial` 或 `hid`                                                      |
| `vid`       | 0–65535；默认 HPMicro VID `0x34B7`（十进制 13495）                     |
| `pid`       | 0–65535；默认 0，表示匹配任意 PID                                      |
| `port`      | 串口路径，如 `COM11` 或 `/dev/ttyUSB0`；省略时系统中必须恰好有一个串口 |
| `baudRate`  | 串口波特率，0–4294967295；省略或 0 时使用 115200                       |
| `path`      | HID 接口路径；省略时匹配的可访问 HID 设备必须恰好有一个                |
| `timeoutMs` | `device.create` 探测超时，1000–1800000 ms，默认 10000 ms               |

Windows 串口枚举只能说明端口存在，不能证明当前可访问；所有平台都会在 `device.create` 时通过 CMD 真实探测。HID 枚举会尝试打开接口，并在结果中返回 `accessible` 和权限提示。

#### ROM 工具

每个 ROM 工具都需要 `targetId`，并可传入 `timeoutMs`（1000–1800000 ms）。

| 工具 | 其余参数 | 用途 |
| --- | --- | --- |
| `rom.query_rte` | `rteId`、`argument?` | 查询 ROM 功能、存储器属性或支持的命令 |
| `rom.config_rte` | `peripheralMask`、`baudRate` | 配置运行时串口外设掩码和波特率 |
| `rom.config_memory` | `memoryId`、`address` | 使用设备内存中的配置数据初始化外部存储器 |
| `rom.read_memory` | `memoryId`、`address`、`length` | 将设备数据读入 CMD 输出，最多 65536 字节 |
| `rom.read_memory_to_file` | `memoryId`、`address`、`length`、`filePath`、`overwrite?` | 将设备数据写入本地文件 |
| `rom.write_memory` | `memoryId`、`address`、`data` | 写入十六进制字数组 |
| `rom.write_memory_from_file` | `memoryId`、`address`、`filePath` | 写入本地文件内容 |
| `rom.verify_checksum` | `memoryId`、`address`、`data` | 根据十六进制字数组校验设备数据 |
| `rom.verify_checksum_from_file` | `memoryId`、`address`、`filePath` | 根据本地文件校验设备数据 |
| `rom.erase_region` | `memoryId`、`address`、`length` | 擦除 XPI NOR 区域 |
| `rom.erase_chip` | `memoryId` | 擦除整片 XPI NOR |
| `rom.load_image` | `filePath` | 向支持串行启动的设备加载已有镜像 |
| `rom.load_bootloader_firmware` | `series`、`signed` | 按 SoC 系列加载 Bootloader 固件，成功后设备自动复位 |
| `rom.reset` | `resetType` | 复位设备：0 默认、1 热复位、2 冷复位 |

ROM 参数约束：

- `rteId` 只能为 0（ROM 功能）、4（存储器属性）或 5（命令列表）。仅 `rteId=4` 时必须提供 `argument`，其值为要查询的 `memoryId`。
- `memoryId`、`address`、`peripheralMask` 和 `query_rte.argument` 使用十进制或 `0x` 十六进制字符串，范围为 32 位无符号整数。对 SDXC/eMMC 操作，`address` 表示扇区索引；`config_memory.address` 则始终表示设备内存中配置数据的地址。
- `length` 是正整数字节数，最大 4294967295；`read_memory` 额外限制为 65536。
- `data` 是逗号分隔的 1–8 位十六进制字，每个字按 4 字节处理，可带成对的 `[[...]]`，例如 `[[0xfcf90001,0x05,0x0,0x0]]`，不能包含空格。
- `series` 由已安装 CMD 决定，例如 `HPM6700`、`HPM6400`、`HPM5300`、 `HPM6200` 或 `HPM6300`；`signed` 为布尔值。

支持的存储器及适用操作：

| `memoryId` | 存储器   | 读/写 | 校验 | 配置 | 擦除 |
| ---------- | -------- | ----- | ---- | ---- | ---- |
| `0`        | ILM      | 是    | 是   | 否   | 否   |
| `1`        | DLM      | 是    | 是   | 否   | 否   |
| `0x10000`  | XPI0 NOR | 是    | 是   | 是   | 是   |
| `0x10001`  | XPI1 NOR | 是    | 是   | 是   | 是   |
| `0x20000`  | OTP      | 是    | 否   | 否   | 否   |
| `0x30000`  | SDXC0    | 是    | 是   | 是   | 否   |
| `0x30001`  | SDXC1    | 是    | 是   | 是   | 否   |

“读/写”表示 schema 允许相应操作；设备、ROM 和 CMD 本身仍可能施加更严格限制。

默认超时为：`rom.erase_chip` 1800000 ms；擦除区域、写入、读取到文件和加载操作 600000 ms；其他 ROM 操作 30000 ms。可通过 `timeoutMs` 覆盖。

### 文件与执行安全

- ROM 命令中的 `filePath` 必须是绝对路径，且不能包含空白或控制字符。这是 CMD 内部命令解析的限制，不适用于 `mfg.set` 的 CMD 路径。
- 文件输入必须存在且为普通文件。读取到文件要求父目录已存在；默认拒绝覆盖，只有 `overwrite: true` 才允许覆盖已有文件。
- ROM 操作结果包含 `success`、`exitCode`、`timedOut`、`durationMs` 和合并后的 `log`。日志最多保留 1 MiB；过大时保留首尾并省略中间部分。
- `query`、内联 `read` 和 `verify` 被标注为只读。读取到文件以及配置、写入、擦除、加载和复位被标注为破坏性操作。
- 服务端没有二次确认或授权令牌机制。调用方必须在写入、配置、擦除、加载、复位及文件覆盖前确认目标、地址、长度和文件。

## 开发与验证

```sh
cd mcp-servers/hpmmfgctl
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

本地启动示例：

```powershell
$env:HPMMFGCTL_CONFIG = "C:\hpm-mfg-data\config.json"
node dist/main.js mcp
```

常规自动化测试不需要真实设备，也不会执行镜像烧写操作。发布前仍需在 Windows 和 Linux 上使用真实设备验证串口/HID 枚举、Target 探测，以及经过授权的 ROM 操作。

发布标签使用 `hpmmfgctl-v<包版本>`。插件固定引用已发布的 npm 版本，因此应先发布 npm 包，再更新或分发插件。
