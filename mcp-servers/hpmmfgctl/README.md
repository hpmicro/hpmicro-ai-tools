# hpmmfgctl (TypeScript)

[English](README.md) | [简体中文](README.zh-CN.md)

HPM Manufacturing stdio MCP server implemented in TypeScript. It invokes a locally installed HPM Manufacturing CMD to discover, probe, and operate HPM ROM devices over serial or HID.

Requires Node.js 22.15+ and a separately installed HPM Manufacturing CMD. Supported platforms are Windows x64 and Linux x86_64. The server does not search `PATH` or installation directories.

## Install

```sh
npm install -g hpmmfgctl --registry=https://registry.npmjs.org/
hpmmfgctl --help
```

Alternatively, use `npx --yes "hpmmfgctl@<version>"` to run a pinned version.

Device discovery uses `@serialport/bindings-cpp` and `node-hid`, both of which contain native components. Environments without matching prebuilt binaries may need a native C/C++ build toolchain. Linux HID uses the hidraw backend and may also require udev rules or group permissions.

## CLI

`hpmmfgctl` starts the MCP server; it does not expose manufacturing operations as direct CLI subcommands. These entry points are equivalent:

```sh
hpmmfgctl mcp
hpmmfgctl serve --stdio
```

The service uses MCP over stdin/stdout, with stdout reserved for protocol messages. The current TypeScript implementation does not include the old Go server's HTTP transport.

## Configuration

Default configuration locations:

| Operating system | Default location |
| --- | --- |
| Windows | `%APPDATA%/hpmicro/hpmmfgctl/config.json` |
| macOS | `~/Library/Application Support/hpmicro/hpmmfgctl/config.json` |
| Linux | `$XDG_CONFIG_HOME/hpmicro/hpmmfgctl/config.json`, or `~/.config/hpmicro/hpmmfgctl/config.json` |

`HPMMFGCTL_CONFIG` overrides the default configuration file path in the same way that `HPMSDKCTL_CONFIG` does for `hpmsdkctl`: it names the file, not a directory. The format is compatible with the old Go server:

```json
{
  "mfgCmdPath": "C:\\Program Files\\HPMicro\\hpm_manufacturing_cmd.exe"
}
```

Use `mfg.set` instead of editing the file directly. It saves only after all compatibility checks pass:

- the path is absolute and identifies an executable regular file;
- the filename is `hpm_manufacturing_cmd.exe` on Windows or `hpm_manufacturing_cmd` on Linux;
- `--version`, no-argument failure, and `--help` behavior are compatible; and
- help contains the required `-p`, `-u`, `-r`, `-t`, and `-f` options.

The CMD executable path may contain spaces. Reading a missing configuration file returns empty configuration; only `mfg.set` or `mfg.clear` creates the configuration directory and writes the file.

## MCP

Pin a verified package version:

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

Replace `<version>` with the package version. To isolate configuration, set `HPMMFGCTL_CONFIG` in the server's `env` to an absolute configuration file path. For local development, use `node` as the command and pass the absolute built `dist/main.js` path followed by `mcp`.

### Recommended workflow

1. Call `mfg.doctor` to check configuration and CMD compatibility. Call `mfg.set` if the executable is not configured.
2. Call `device.discover` for serial or HID devices.
3. Call `device.create`. The service probes the device with `query-rte 0` and returns a `targetId` only after a successful probe.
4. Pass that `targetId` to `rom.*` tools.
5. Call `device.delete` when the target is no longer needed.

Targets exist only in the current MCP process and must be recreated after a restart. CMD processes execute serially. Queued and running requests support cancellation, and commands are started without a shell.

### Complete MCP tool reference

`?` marks an optional parameter; all other parameters are required. Pass `{}` to tools without parameters. Parameter names are case-sensitive and use camelCase. Every tool returns structured content; precondition and operation failures set MCP `isError: true`.

#### Configuration tools

| Tool | Parameters | Behavior |
| --- | --- | --- |
| `mfg.doctor` | None | Force a CMD compatibility check and report server, platform, path, and validation details |
| `mfg.get` | None | Read current configuration; returns an empty object when unset |
| `mfg.set` | `path` | Validate and save an absolute CMD path; leaves existing configuration unchanged on failure |
| `mfg.clear` | None | Clear the saved CMD path and compatibility cache |

`mfg.doctor` and `mfg.set` start CMD for compatibility checks but do not access target hardware.

#### Device and target tools

| Tool | Parameters | Behavior |
| --- | --- | --- |
| `device.discover` | `transport`; `vid?`, `pid?` | Enumerate `serial` or `hid` devices; VID/PID filter only HID |
| `device.create` | `transport`; `port?`, `baudRate?`, `path?`, `vid?`, `pid?`, `timeoutMs?` | Probe a device and register a process-local target |
| `device.list` | None | List process-local targets and connection settings |
| `device.delete` | `targetId` | Delete one target; rejects an unknown ID |

Connection parameters:

| Parameter | Meaning / constraint |
| --- | --- |
| `transport` | `serial` or `hid` |
| `vid` | 0-65535; defaults to HPMicro VID `0x34B7` (decimal 13495) |
| `pid` | 0-65535; defaults to 0, which matches any PID |
| `port` | Serial path such as `COM11` or `/dev/ttyUSB0`; if omitted, exactly one serial port must exist |
| `baudRate` | Serial rate, 0-4294967295; omitted or zero defaults to 115200 |
| `path` | HID interface path; if omitted, exactly one matching accessible HID device must exist |
| `timeoutMs` | `device.create` probe timeout, 1000-1800000 ms; defaults to 10000 ms |

Windows serial enumeration proves only that a port exists, not that it is accessible. On every platform, `device.create` performs a real CMD probe. HID discovery attempts to open each interface and returns `accessible` plus a permission hint when appropriate.

#### ROM tools

Every ROM tool requires `targetId` and accepts optional `timeoutMs` from 1000 to 1800000 ms.

| Tool | Other parameters | Purpose |
| --- | --- | --- |
| `rom.query_rte` | `rteId`, `argument?` | Query ROM features, memory properties, or supported commands |
| `rom.config_rte` | `peripheralMask`, `baudRate` | Configure the runtime serial peripheral mask and rate |
| `rom.config_memory` | `memoryId`, `address` | Initialize external memory using configuration data already in device memory |
| `rom.read_memory` | `memoryId`, `address`, `length` | Read device data into CMD output, up to 65536 bytes |
| `rom.read_memory_to_file` | `memoryId`, `address`, `length`, `filePath`, `overwrite?` | Write device data to a local file |
| `rom.write_memory` | `memoryId`, `address`, `data` | Write hexadecimal words |
| `rom.write_memory_from_file` | `memoryId`, `address`, `filePath` | Write a local file |
| `rom.verify_checksum` | `memoryId`, `address`, `data` | Verify device data against hexadecimal words |
| `rom.verify_checksum_from_file` | `memoryId`, `address`, `filePath` | Verify device data against a local file |
| `rom.erase_region` | `memoryId`, `address`, `length` | Erase an XPI NOR region |
| `rom.erase_chip` | `memoryId` | Erase an entire XPI NOR device |
| `rom.load_image` | `filePath` | Load an existing image into a device that supports serial boot |
| `rom.load_bootloader_firmware` | `series`, `signed` | Load bootloader firmware for a SoC series; resets automatically on success |
| `rom.reset` | `resetType` | Reset the device: 0 default, 1 hot, or 2 cold |

ROM parameter constraints:

- `rteId` is 0 (ROM features), 4 (memory properties), or 5 (command list). `argument` is required only for `rteId=4` and contains the queried `memoryId`.
- `memoryId`, `address`, `peripheralMask`, and `query_rte.argument` are decimal or `0x` hexadecimal strings in the unsigned 32-bit range. For SDXC/eMMC transfers, `address` is a sector index. `config_memory.address` always identifies configuration data already stored in device memory.
- `length` is a positive byte count up to 4294967295; `read_memory` additionally caps it at 65536.
- `data` is a comma-separated list of 1-8 digit hexadecimal words, four bytes per word. Paired `[[...]]` brackets are optional. Example: `[[0xfcf90001,0x05,0x0,0x0]]`. Whitespace is not allowed.
- `series` is defined by the installed CMD, for example `HPM6700`, `HPM6400`, `HPM5300`, `HPM6200`, or `HPM6300`; `signed` is a boolean.

Supported memories and operation groups:

| `memoryId` | Memory   | Read/write | Verify | Configure | Erase |
| ---------- | -------- | ---------- | ------ | --------- | ----- |
| `0`        | ILM      | Yes        | Yes    | No        | No    |
| `1`        | DLM      | Yes        | Yes    | No        | No    |
| `0x10000`  | XPI0 NOR | Yes        | Yes    | Yes       | Yes   |
| `0x10001`  | XPI1 NOR | Yes        | Yes    | Yes       | Yes   |
| `0x20000`  | OTP      | Yes        | No     | No        | No    |
| `0x30000`  | SDXC0    | Yes        | Yes    | Yes       | No    |
| `0x30001`  | SDXC1    | Yes        | Yes    | Yes       | No    |

“Read/write” means the schema permits those operations; the device, ROM, and installed CMD may impose tighter restrictions.

Default timeouts are 1800000 ms for `rom.erase_chip`; 600000 ms for region erase, writes, file reads, and loads; and 30000 ms for other ROM operations. Override them with `timeoutMs`.

### File and execution safety

- A ROM `filePath` must be absolute and contain no whitespace or control characters. This CMD parser restriction does not apply to the executable path passed to `mfg.set`.
- Input files must exist and be regular files. A file read requires an existing parent directory and refuses to replace an existing file unless `overwrite: true` is set.
- ROM results contain `success`, `exitCode`, `timedOut`, `durationMs`, and a combined `log`. Logs are capped at 1 MiB, preserving their beginning and end when truncated.
- Queries, inline reads, and verification are marked read-only. File reads, configuration, writes, erases, loads, and reset are marked destructive.
- The server has no second confirmation or authorization token. The caller must confirm the target, address, length, and file before writes, configuration, erases, loads, resets, and file replacement.

## Development and verification

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

Local startup example:

```powershell
$env:HPMMFGCTL_CONFIG = "C:\hpm-mfg-data\config.json"
node dist/main.js mcp
```

Normal automated tests do not require hardware and do not perform manufacturing operations. Before release, smoke-test serial/HID discovery, target probing, and approved ROM operations with real devices on Windows and Linux.

Release tags use `hpmmfgctl-v<package version>`. The plugin pins a published npm version, so publish the package before updating or distributing the plugin.
