# hpmsdkctl（TypeScript）

[English](README.md) | [简体中文](README.zh-CN.md)

使用 TypeScript 实现的 HPM SDK 命令行工具和 stdio MCP 服务。

需要 Node.js 22.15 及以上版本，以及本地安装的 HPM SDK、CMake、Ninja、Python 和 RISC-V GCC。烧录与调试功能还需要 OpenOCD。CLI 在 Node.js 中运行，并调用本地 SDK 工具。

## 安装

```sh
npm install -g hpmsdkctl --registry=https://registry.npmjs.org/
hpmsdkctl --help
```

也可以使用 `npx --yes "hpmsdkctl@<version>"` 固定运行指定版本。

## CLI

### 完整命令参考

`<value>` 表示必须为该选项或参数提供值，`[boolean]` 表示可选值。所有命令均支持 `--help`。不带参数运行 `hpmsdkctl` 会显示帮助，`config` 必须指定子命令。 `hpmsdkctl --version`（或 `-V`）输出包版本，与 MCP 服务报告的版本一致。

| 命令                       | 用途                                   |
| -------------------------- | -------------------------------------- |
| `config init`              | 校验 SDK、工具路径和版本，然后保存配置 |
| `config list`              | 以 JSON 输出完整配置                   |
| `config get <key>`         | 读取一个配置项                         |
| `config set <key> <value>` | 校验并保存一个配置项                   |
| `config unset <key>`       | 清空并保存一个配置项                   |
| `config check`             | 检查路径与 SDK 环境一致性              |
| `build list-options`       | 查询兼容开发板与构建组合               |
| `build generate`           | 使用 CMake 生成 Ninja 构建目录         |
| `build compile`            | 在已有构建目录中执行 Ninja             |
| `project localize-sdk`     | 执行 SDK 本地化目标                    |
| `project unlocalize-sdk`   | 恢复应用原来的 CMake 入口文件          |
| `openocd list-configs`     | 查询 SDK OpenOCD 配置文件和推断默认值  |
| `openocd flash`            | 向目标硬件写入并校验固件               |
| `openocd start-gdb-server` | 启动 OpenOCD GDB Server 并等待退出     |
| `mcp`                      | 通过标准输入输出提供 MCP 服务          |

#### `config init`

选择 `--sdk-env` 或显式工具路径两种方式之一，不能混用。必需路径必须存在，SDK 环境必须一致，已配置工具必须通过 `--version` 检查。 OpenOCD 为可选项。校验失败时不会修改已保存的配置。 SDK Env 导入在所有平台上都查找 Windows 风格的 `.exe` 工具；其他安装方式请使用显式路径模式。

| 选项 | 含义与约束 |
| --- | --- |
| `--sdk-env <path>` | 包含 `cmd_params.yaml` 的 SDK Env 目录，替代显式路径配置 |
| `--hpm-sdk <path>` | HPM SDK 目录，显式路径模式必填 |
| `--cmake <path>` | CMake 可执行文件，显式路径模式必填 |
| `--ninja <path>` | Ninja 可执行文件，显式路径模式必填 |
| `--python <path>` | Python 可执行文件，显式路径模式必填 |
| `--openocd <path>` | 可选的 OpenOCD 可执行文件 |
| `--toolchain <path>` | RISC-V 工具链根目录，包含 `bin/riscv32-unknown-elf-gcc`（Windows 带 `.exe`），显式路径模式必填 |
| `--toolchain-variant <name>` | 显式路径模式的工具链类型，默认 `gcc` |

```sh
hpmsdkctl config init --sdk-env /path/to/sdk_env
hpmsdkctl config init --hpm-sdk /path/to/hpm_sdk --cmake /path/to/cmake --ninja /path/to/ninja --python /path/to/python --toolchain /path/to/toolchain
```

#### `config list`

无参数或选项。输出配置 JSON；配置文件不存在时返回空配置，不创建文件或目录。

```sh
hpmsdkctl config list
```

#### `config get <key>`

`key` 必填，接受规范配置键或支持的别名。输出对应值，未设置的值返回空字符串，未知键报错。

```sh
hpmsdkctl config get tools.python
hpmsdkctl config get python
```

#### `config set <key> <value>`

两个位置参数均必填，支持与 `get` 相同的配置键和别名。 SDK 和工具路径保存前会进行校验，可执行工具还会运行 `--version`。环境变量值不进行可执行工具版本检查。设置 `hpm_sdk` 会同时更新 `env.HPM_SDK_BASE`。此命令只修改单个配置项，不等同于完整初始化。

```sh
hpmsdkctl config set python /path/to/python
hpmsdkctl config set env.CUSTOM value
```

#### `config unset <key>`

`key` 必填。清空配置键或别名并保存，不执行版本检查。清空 `hpm_sdk` 会同时移除 `env.HPM_SDK_BASE`；清空 `env.*` 会移除对应条目。允许清空必需项，但后续操作可能因配置不完整而校验失败。

```sh
hpmsdkctl config unset tools.openocd
hpmsdkctl config unset env.CUSTOM
```

规范配置键包括 `hpm_sdk`、`tools.cmake`、`tools.ninja`、`tools.python`、 `tools.openocd` 和 `env.<name>`（名称不能为空）。别名包括 `cmake`、`ninja`、 `python`、`openocd`、`toolchain`（对应 `env.GNURISCV_TOOLCHAIN_PATH`）和 `toolchain_variant`（对应 `env.HPM_SDK_TOOLCHAIN_VARIANT`）。 `sdk_env` 是初始化参数，不是支持 get/set/unset 的配置键。

#### `config check`

无参数或选项。不启动外部工具，输出路径及 SDK/BASE 一致性检查。未配置 OpenOCD 产生警告，缺少必需配置会以非零退出码结束。

```sh
hpmsdkctl config check
```

#### `build list-options`

必须且只能选择 `--sample <path>`（相对 SDK `samples` 的路径）或 `--app-dir <path>`（外部应用目录）。以 JSON 输出兼容开发板、HPM 和 CMake 构建类型，不生成项目，也不运行 CMake。对于包含 `core0`、`core1` 且 `core0/app.yaml` 声明 `linked_project` 的多核工程，可传入工程根目录；命令会以 `core0` 为主工程，并同时检查从核工程的依赖。

```sh
hpmsdkctl build list-options --sample hello_world
hpmsdkctl build list-options --app-dir /path/to/app
```

#### `build generate`

调用 CMake 生成 Ninja 构建项目。建议先查询构建选项，开发板和构建类型没有隐式默认值。传入上述多核工程根目录时，以 `core0` 生成项目；HPM SDK 会根据 `linked_project` 自动构建从核工程。

| 选项 | 含义与约束 |
| --- | --- |
| `--sample <path>` | SDK sample，与 app-dir 二选一 |
| `--app-dir <path>` | 外部应用目录，与 sample 二选一 |
| `--board <name>` | SDK 开发板，与 custom-board 二选一 |
| `--custom-board <path>` | 自定义开发板目录，包含 `CMakeLists.txt` 和带 `board.soc` 的 `<目录名>.yaml` |
| `--hpm-build-type <name>` | 必填，从查询结果选择 SDK 构建类型 |
| `--cmake-build-type <name>` | 必填，从查询结果选择 CMake 构建类型 |
| `--custom-gcc-linker <path>` | 可选的已存在链接脚本文件 |
| `--build-dir <path>` | 可选的输出目录，默认 `<app-dir>/<board>_<hpm-build-type>_<cmake-build-type>` |
| `--clean [boolean]` | 生成前删除构建目录；不传不清理，仅传该选项表示 true |

显式 clean 值支持 `true`、`t`、`1`、`false`、`f` 或 `0`，不区分大小写。 `hpmsdkctl build generate --clean` 会递归删除目标构建目录，使用前务必确认该目录。

```sh
hpmsdkctl build generate --sample hello_world --board hpm6750evkmini --hpm-build-type flash_xip --cmake-build-type debug
hpmsdkctl build generate --app-dir /path/to/app --custom-board /path/to/custom-board --hpm-build-type ram --cmake-build-type debug --build-dir /path/to/build --custom-gcc-linker /path/to/linker.ld --clean=false
```

#### `build compile`

`--build-dir <path>` 必填，目录中必须存在 `build.ninja`。在该目录执行 Ninja，不重新生成项目。

```sh
hpmsdkctl build compile --build-dir /path/to/build
```

#### `project localize-sdk`

`--build-dir <path>` 必填，目录中必须存在 `build.ninja`。执行 Ninja 的 `localize_sdk` 目标，把 SDK 依赖复制到应用目录。若已有 `CMakeLists.txt.localized.bak`，重复本地化前应先运行 `project unlocalize-sdk`。

```sh
hpmsdkctl project localize-sdk --build-dir /path/to/build
```

#### `project unlocalize-sdk`

`--localized-dir <path>` 必填，应为应用目录而不是构建目录。将 `CMakeLists.txt.localized.bak` 恢复为 `CMakeLists.txt`，并把当前文件保存为 `CMakeLists.txt.unlocalized.bak`（覆盖同名备份）。不会删除已复制的 SDK 文件。

```sh
hpmsdkctl project unlocalize-sdk --localized-dir /path/to/app
```

#### `openocd list-configs`

`--board <name>` 必填，支持 SDK 开发板名称或开发板目录。 `--app <path>` 可选，支持 sample 名称或应用目录，用于推断单核/双核 SoC 默认配置。返回 probe、SoC、board 配置文件和推断默认值；无法推断的默认值为空字符串。此命令不访问硬件。

```sh
hpmsdkctl openocd list-configs --board hpm6750evkmini --app hello_world
```

#### `openocd flash`

向真实硬件写入并校验固件，随后复位并退出。执行前必须配置 OpenOCD。

| 选项                  | 含义与约束                                                           |
| --------------------- | -------------------------------------------------------------------- |
| `--probe <name>`      | 必填，调试器配置名称或 `.cfg` 路径                                   |
| `--soc <name>`        | 必填，SoC 配置名称或 `.cfg` 路径，需选择正确的核类型                 |
| `--board <name>`      | 必填，OpenOCD 开发板配置名称或 `.cfg` 路径                           |
| `--file <path>`       | 必填，固件路径                                                       |
| `--address <address>` | 十进制或十六进制整数；BIN 固件必填，其他格式可选；不会自动填入默认值 |

配置名称从 SDK `boards/openocd` 下解析，显式 `.cfg` 路径直接传递给 OpenOCD。固件路径会按 Tcl 数据转义，路径中的方括号和美元符号均按字面值处理。

```sh
hpmsdkctl openocd flash --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini --file /path/to/firmware.elf
hpmsdkctl openocd flash --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini --file /path/to/firmware.bin --address 0x80000400
```

#### `openocd start-gdb-server`

`--probe <name>`、`--soc <name>` 和 `--board <name>` 均必填，配置解析方式与 `openocd flash` 相同。必须已配置 OpenOCD。启动 GDB Server 并等待退出，不启动 GDB 客户端，也不设置内置超时。

```sh
hpmsdkctl openocd start-gdb-server --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini
```

#### `mcp`

无参数或选项。通过 stdio 提供 MCP 服务，通常由客户端管理进程，不用于交互式终端操作。日志写入 stderr，stdout 仅承载协议消息。

```sh
hpmsdkctl mcp
```

## 配置

默认配置文件位置：

| 操作系统 | 默认位置 |
| --- | --- |
| Windows | `%APPDATA%/hpmicro/hpmsdkctl/config.json` |
| macOS | `~/Library/Application Support/hpmicro/hpmsdkctl/config.json` |
| Linux | `$XDG_CONFIG_HOME/hpmicro/hpmsdkctl/config.json`，或 `~/.config/hpmicro/hpmsdkctl/config.json` |

环境变量 `HPMSDKCTL_CONFIG` 可覆盖默认配置文件路径。使用 `config init` 设置 SDK 和工具路径。读取尚不存在的配置文件时返回空配置，不创建文件或目录。仅在显式保存配置时执行写入。

## MCP

建议固定经过验证的包版本：

```json
{
  "mcpServers": {
    "hpm-sdk-ctl": {
      "command": "npx",
      "args": ["--yes", "hpmsdkctl@<version>", "mcp"]
    }
  }
}
```

将 `<version>` 替换为实际版本。本地开发时可改为执行 `node /absolute/path/to/dist/main.js mcp`。

MCP 参数使用 snake_case。所有工具返回结构化结果，`ok` 表示操作是否成功；失败时包含 `error` 并设置 MCP `isError: true`。执行外部工具的操作还会返回 `exit_code`、`stdout` 和 `stderr`；未启动进程时 `exit_code` 为 `null`。

### 完整 MCP 工具参考

`?` 表示可选参数，其他参数均必填；无参数工具传入 `{}`。文件系统和硬件影响与对应 CLI 命令相同。

| 工具 | 参数 | 对应 CLI 命令 |
| --- | --- | --- |
| `config.init` | `sdk_env?`、`hpm_sdk?`、`cmake?`、`ninja?`、`python?`、`openocd?`、`toolchain?`、`toolchain_variant?`；选择 SDK Env 或显式路径模式 | `config init` |
| `config.list` | 无 | `config list` |
| `config.get` | `key` | `config get` |
| `config.set` | `key`、`value` | `config set` |
| `config.unset` | `key` | `config unset` |
| `config.check` | 无 | `config check` |
| `build.list_options` | `sample?`、`app_dir?`，选择一个应用来源 | `build list-options` |
| `build.generate` | `sample?`、`app_dir?`（二选一）；`board?`、`custom_board?`（二选一）；`hpm_build_type`、`cmake_build_type`、`custom_gcc_linker_file?`、`build_dir?`、`clean?` | `build generate` |
| `build.compile` | `build_dir` | `build compile` |
| `project.localize_sdk` | `build_dir` | `project localize-sdk` |
| `project.unlocalize_sdk` | `localized_dir` | `project unlocalize-sdk` |
| `openocd.list_configs` | `board`、`app?` | `openocd list-configs` |
| `openocd.flash` | `probe`、`soc`、`board`、`file`、`address?`；BIN 固件必须提供 `address` | `openocd flash` |
| `openocd.start_gdb_server` | `probe`、`soc`、`board` | `openocd start-gdb-server` |

除 `clean` 为布尔值外，其他输入值均为字符串。配置键和别名见上方 CLI 配置说明。

## 开发与验证

```sh
cd mcp-servers/hpmsdkctl
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```

项目独立维护 `package.json` 和依赖锁文件，不使用根目录 npm workspace。常规测试不需要 SDK 或硬件，也不会烧录开发板或启动持久运行的 GDB Server。如需运行真实 SDK 构建测试，请设置：

```powershell
$env:HPMSDKCTL_SDK_ENV = 'D:/work/sdk_env'
npm test
```

真实硬件烧录和调试需要单独验证。
