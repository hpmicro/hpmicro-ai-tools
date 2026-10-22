# hpmsdkctl (TypeScript)

[English](README.md) | [简体中文](README.zh-CN.md)

HPM SDK CLI and stdio MCP server implemented in TypeScript.

Requires Node.js 22.15+ and locally installed HPM SDK, CMake, Ninja, Python, RISC-V GCC and optionally OpenOCD. The CLI runs on Node.js and invokes the locally installed SDK tools.

## Install

```sh
npm install -g hpmsdkctl --registry=https://registry.npmjs.org/
hpmsdkctl --help
```

Alternatively, use `npx --yes "hpmsdkctl@<version>"` to run a pinned version.

## CLI

### Complete command reference

`<value>` denotes an option or argument that needs a value; `[boolean]` is an optional value. All commands support `--help`. Running `hpmsdkctl` without arguments prints help; `config` requires a subcommand. `hpmsdkctl --version` (or `-V`) prints the package release version, identical to the version reported by the MCP server.

| Command                    | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `config init`              | Validate SDK/tool paths and versions, then save configuration |
| `config list`              | Print full configuration as JSON                              |
| `config get <key>`         | Read one configuration value                                  |
| `config set <key> <value>` | Validate and save one value                                   |
| `config unset <key>`       | Clear and save one value                                      |
| `config check`             | Check paths and SDK environment consistency                   |
| `build list-options`       | Query compatible boards and build combinations                |
| `build generate`           | Generate a Ninja build directory with CMake                   |
| `build compile`            | Run Ninja in an existing build directory                      |
| `project localize-sdk`     | Run the SDK localization target                               |
| `project unlocalize-sdk`   | Restore the original application CMake entry point            |
| `openocd list-configs`     | Query SDK OpenOCD files and inferred defaults                 |
| `openocd flash`            | Write and verify firmware on target hardware                  |
| `openocd start-gdb-server` | Start OpenOCD's GDB server and wait for exit                  |
| `mcp`                      | Serve MCP over stdin/stdout                                   |

#### `config init`

Use either `--sdk-env` or explicit tool paths, not both. Required paths must exist, the SDK environment must be consistent, and configured tools must pass `--version` checks. OpenOCD is optional. Failed validation leaves the saved file unchanged. SDK Env import looks for Windows-style `.exe` tools on every platform; use explicit paths for other installations.

| Option | Meaning / constraint |
| --- | --- |
| `--sdk-env <path>` | SDK Env directory containing `cmd_params.yaml`; alternative to explicit paths |
| `--hpm-sdk <path>` | HPM SDK directory; required in explicit-path mode |
| `--cmake <path>` | CMake executable; required in explicit-path mode |
| `--ninja <path>` | Ninja executable; required in explicit-path mode |
| `--python <path>` | Python executable; required in explicit-path mode |
| `--openocd <path>` | Optional OpenOCD executable |
| `--toolchain <path>` | RISC-V toolchain root, containing `bin/riscv32-unknown-elf-gcc` (`.exe` on Windows); required in explicit-path mode |
| `--toolchain-variant <name>` | Explicit-path toolchain variant; defaults to `gcc` |

```sh
hpmsdkctl config init --sdk-env /path/to/sdk_env
hpmsdkctl config init --hpm-sdk /path/to/hpm_sdk --cmake /path/to/cmake --ninja /path/to/ninja --python /path/to/python --toolchain /path/to/toolchain
```

#### `config list`

No arguments or options. Prints configuration JSON; a missing file produces empty configuration without creating a file or directory.

```sh
hpmsdkctl config list
```

#### `config get <key>`

`key` is required. Accepts canonical keys or supported aliases, prints the value, and returns an empty string for an unset value. Unknown keys fail.

```sh
hpmsdkctl config get tools.python
hpmsdkctl config get python
```

#### `config set <key> <value>`

Both arguments are required. Accepts the same keys and aliases as `get`. SDK/tool paths are validated before saving; executable tools also run `--version`. Environment values are saved without executable version checks. Setting `hpm_sdk` also updates `env.HPM_SDK_BASE`. This edits one value, not a full configuration initialization.

```sh
hpmsdkctl config set python /path/to/python
hpmsdkctl config set env.CUSTOM value
```

#### `config unset <key>`

`key` is required. Clears one key or alias and saves configuration without version checks. Clearing `hpm_sdk` also removes `env.HPM_SDK_BASE`; clearing `env.*` removes that entry. Required values can be cleared, but subsequent operations may fail validation.

```sh
hpmsdkctl config unset tools.openocd
hpmsdkctl config unset env.CUSTOM
```

Canonical keys are `hpm_sdk`, `tools.cmake`, `tools.ninja`, `tools.python`, `tools.openocd`, and `env.<name>` (nonempty name). Aliases are `cmake`, `ninja`, `python`, `openocd`, `toolchain` → `env.GNURISCV_TOOLCHAIN_PATH`, and `toolchain_variant` → `env.HPM_SDK_TOOLCHAIN_VARIANT`. `sdk_env` is an initialization parameter, not a supported get/set/unset key.

#### `config check`

No arguments or options. Prints path checks and SDK/BASE consistency checks without starting tools. Missing OpenOCD is a warning; missing required settings cause a nonzero exit.

```sh
hpmsdkctl config check
```

#### `build list-options`

Supply exactly one of `--sample <path>` (relative to SDK `samples`) or `--app-dir <path>` (external application). Prints JSON with compatible boards and HPM/CMake build types. Does not generate a project or run CMake. For a multicore project containing `core0` and `core1` with `linked_project` declared in `core0/app.yaml`, the project root is accepted; `core0` becomes the primary application, and secondary-core dependencies are included when filtering boards.

```sh
hpmsdkctl build list-options --sample hello_world
hpmsdkctl build list-options --app-dir /path/to/app
```

#### `build generate`

Creates a Ninja build with CMake. Query build options first; there are no implicit board or build-type defaults. When given the multicore project root described above, generation targets `core0`; the HPM SDK builds the secondary-core project from its `linked_project` metadata.

| Option | Meaning / constraint |
| --- | --- |
| `--sample <path>` | SDK sample; exactly one of sample/app-dir |
| `--app-dir <path>` | External application; exactly one of sample/app-dir |
| `--board <name>` | SDK board; exactly one of board/custom-board |
| `--custom-board <path>` | Custom board directory with `CMakeLists.txt` and `<directory-name>.yaml` containing `board.soc` |
| `--hpm-build-type <name>` | Required SDK build type, chosen from query results |
| `--cmake-build-type <name>` | Required CMake build type, chosen from query results |
| `--custom-gcc-linker <path>` | Optional existing linker script file |
| `--build-dir <path>` | Optional output directory; defaults to `<app-dir>/<board>_<hpm-build-type>_<cmake-build-type>` |
| `--clean [boolean]` | Delete the build directory before generation; omitted means no cleanup, bare flag means true |

Explicit clean values accept `true`, `t`, `1`, `false`, `f`, or `0`, case-insensitively. `hpmsdkctl build generate --clean` recursively deletes the target build directory before generation. Verify that directory before using the option.

```sh
hpmsdkctl build generate --sample hello_world --board hpm6750evkmini --hpm-build-type flash_xip --cmake-build-type debug
hpmsdkctl build generate --app-dir /path/to/app --custom-board /path/to/custom-board --hpm-build-type ram --cmake-build-type debug --build-dir /path/to/build --custom-gcc-linker /path/to/linker.ld --clean=false
```

#### `build compile`

`--build-dir <path>` is required and must contain `build.ninja`. Runs Ninja in that directory; does not regenerate the project.

```sh
hpmsdkctl build compile --build-dir /path/to/build
```

#### `project localize-sdk`

`--build-dir <path>` is required and must contain `build.ninja`. Runs Ninja's `localize_sdk` target to copy SDK dependencies into the application. If `CMakeLists.txt.localized.bak` exists, run `project unlocalize-sdk` before repeating localization.

```sh
hpmsdkctl project localize-sdk --build-dir /path/to/build
```

#### `project unlocalize-sdk`

`--localized-dir <path>` is required: the application directory, not its build directory. Restores `CMakeLists.txt.localized.bak` to `CMakeLists.txt`, saving the current file as `CMakeLists.txt.unlocalized.bak` (overwriting an existing backup). Does not remove copied SDK files.

```sh
hpmsdkctl project unlocalize-sdk --localized-dir /path/to/app
```

#### `openocd list-configs`

`--board <name>` is required and accepts an SDK board name or board directory. `--app <path>` optionally selects a sample name or application directory to infer single/dual-core SoC defaults. Returns probe/SoC/board configuration files and inferred defaults; unresolved defaults are empty strings. Does not access hardware.

```sh
hpmsdkctl openocd list-configs --board hpm6750evkmini --app hello_world
```

#### `openocd flash`

Writes and verifies real target hardware, then resets it and exits. Configure OpenOCD first.

| Option | Meaning / constraint |
| --- | --- |
| `--probe <name>` | Required probe configuration name or `.cfg` path |
| `--soc <name>` | Required SoC configuration name or `.cfg` path; select the correct core variant |
| `--board <name>` | Required OpenOCD board configuration name or `.cfg` path |
| `--file <path>` | Required firmware path |
| `--address <address>` | Decimal or hexadecimal integer; required for BIN, optional for other formats; never inferred |

Configuration names resolve below SDK `boards/openocd`; explicit `.cfg` paths are passed through. Firmware paths are quoted as Tcl data, so brackets and dollar signs in paths are treated literally.

```sh
hpmsdkctl openocd flash --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini --file /path/to/firmware.elf
hpmsdkctl openocd flash --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini --file /path/to/firmware.bin --address 0x80000400
```

#### `openocd start-gdb-server`

Requires `--probe <name>`, `--soc <name>`, and `--board <name>`, using the same configuration resolution as `openocd flash`. Requires configured OpenOCD. Starts the GDB server and waits for exit; it does not launch a GDB client or impose a timeout.

```sh
hpmsdkctl openocd start-gdb-server --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini
```

#### `mcp`

No arguments or options. Serves MCP over stdio; use it as a client-managed process, not as an interactive shell command. Logs use stderr and stdout carries protocol messages.

```sh
hpmsdkctl mcp
```

## Configuration

Default configuration locations:

| OS | Default |
| --- | --- |
| Windows | `%APPDATA%/hpmicro/hpmsdkctl/config.json` |
| macOS | `~/Library/Application Support/hpmicro/hpmsdkctl/config.json` |
| Linux | `$XDG_CONFIG_HOME/hpmicro/hpmsdkctl/config.json`, or `~/.config/hpmicro/hpmsdkctl/config.json` |

`HPMSDKCTL_CONFIG` overrides the default configuration file path. Use `config init` to configure SDK and tool paths. Loading a nonexistent configuration returns empty data without creating files or directories. Writes occur only when configuration is explicitly saved.

## MCP

Pin a verified package version:

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

Replace `<version>` with the intended release. For local development, run `node /absolute/path/to/dist/main.js mcp` instead.

MCP parameters use snake_case. Every tool returns a structured result with `ok`; failures include `error` and set MCP `isError: true`. Operations that launch external tools also return `exit_code`, `stdout`, and `stderr`; `exit_code` is `null` when no process was started.

### Complete MCP tool reference

`?` marks optional parameters; all other parameters are required. Tools without parameters receive `{}`. Filesystem and hardware effects match the corresponding CLI command.

| Tool | Parameters | Corresponding CLI command |
| --- | --- | --- |
| `config.init` | `sdk_env?`, `hpm_sdk?`, `cmake?`, `ninja?`, `python?`, `openocd?`, `toolchain?`, `toolchain_variant?`; choose SDK Env or explicit paths | `config init` |
| `config.list` | None | `config list` |
| `config.get` | `key` | `config get` |
| `config.set` | `key`, `value` | `config set` |
| `config.unset` | `key` | `config unset` |
| `config.check` | None | `config check` |
| `build.list_options` | `sample?`, `app_dir?`; select one application source | `build list-options` |
| `build.generate` | `sample?`, `app_dir?` (choose one); `board?`, `custom_board?` (choose one); `hpm_build_type`, `cmake_build_type`, `custom_gcc_linker_file?`, `build_dir?`, `clean?` | `build generate` |
| `build.compile` | `build_dir` | `build compile` |
| `project.localize_sdk` | `build_dir` | `project localize-sdk` |
| `project.unlocalize_sdk` | `localized_dir` | `project unlocalize-sdk` |
| `openocd.list_configs` | `board`, `app?` | `openocd list-configs` |
| `openocd.flash` | `probe`, `soc`, `board`, `file`, `address?`; BIN firmware requires `address` | `openocd flash` |
| `openocd.start_gdb_server` | `probe`, `soc`, `board` | `openocd start-gdb-server` |

All inputs are strings except the boolean `clean`. Configuration keys and aliases are documented in the CLI configuration section above.

## Development and verification

```sh
cd mcp-servers/hpmsdkctl
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```

The package owns its `package.json` and lockfile and does not use a root npm workspace. Regular tests need no SDK or hardware and do not flash boards or start a persistent GDB server. To include the real SDK build test, set:

```powershell
$env:HPMSDKCTL_SDK_ENV = 'D:/work/sdk_env'
npm test
```

Real flashing and debugging require a separate hardware validation pass.
