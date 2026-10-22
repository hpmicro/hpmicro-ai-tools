# HPM Manufacturing Plugin

[English](README.md) | [简体中文](README.zh-CN.md)

`hpm-mfgtool-helper` bundles five workflow skills and the configuration for the local `hpmmfgctl` stdio MCP server. It discovers serial/HID devices and performs ROM memory, image-programming, OTP, and extension-firmware operations through a separately installed HPM Manufacturing CMD.

## Requirements and installation

- Windows x64 or Linux x86_64, with Node.js **22.15+** and `npm`/`npx` in `PATH`.
- A compatible plugin/stdio MCP client and a separately installed `hpm_manufacturing_cmd`; no SDK build toolchain is required for these ROM workflows.
- A target device in the appropriate ROM boot mode, connected over serial or HID.
- npm registry access for the plugin's pinned `hpmmfgctl@0.1.0` package.

Install the plugin using the [repository instructions](../../README.md#install-plugins). The [.mcp.json](.mcp.json) entry starts:

```text
npx --yes --registry=https://registry.npmjs.org/ hpmmfgctl@0.1.0 mcp
```

The server is published separately; the pinned npm version must be published before distribution. Local source development can instead run the built server as described in the [package README](../../mcp-servers/hpmmfgctl/README.md#mcp). Only stdio transport is supported by the current implementation.

Discovery uses native serial/HID modules. Environments without matching prebuilt binaries may need a C/C++ build toolchain. Linux HID access may require udev rules or group permissions.

## CMD configuration

Start with `mfg.doctor`, then use `mfg.set` with the installed CMD's absolute path if configuration is missing. The server validates the executable's name and command behavior before saving; it does not search `PATH` or installation folders. The executable path may contain spaces.

| Platform | Default configuration file |
| --- | --- |
| Windows | `%APPDATA%/hpmicro/hpmmfgctl/config.json` |
| Linux | `$XDG_CONFIG_HOME/hpmicro/hpmmfgctl/config.json`, or `~/.config/hpmicro/hpmmfgctl/config.json` |

To isolate configuration, set `HPMMFGCTL_CONFIG` in the MCP server environment to an absolute **file path**. `mfg.get` reads configuration; `mfg.clear` clears the saved CMD path. Configuration checks do not access target hardware.

## Workflow skills

| Skill | Purpose |
| --- | --- |
| [hpm-mfgtool-setup](skills/hpm-mfgtool-setup/SKILL.md) | Check CMD, discover devices, and create a successfully probed target. |
| [hpm-image-flash](skills/hpm-image-flash/SKILL.md) | Program existing images/user data into XPI NOR or eMMC/SDXC, or load a RAM boot image; verify when requested. |
| [hpm-memory-read-erase](skills/hpm-memory-read-erase/SKILL.md) | Query, read, export, or verify ILM/DLM/XPI NOR/eMMC data; erase XPI NOR regions or chips. |
| [hpm-otp-read-program](skills/hpm-otp-read-program/SKILL.md) | Read OTP one word at a time, or program once with explicit authorization and read back. |
| [hpm-rom-firmware-session](skills/hpm-rom-firmware-session/SKILL.md) | Load bootloader extension firmware, reconnect after automatic reset, and verify extended ROM commands. |

Skills can be selected from the task or invoked by name in a compatible client. For a typical session:

1. Check CMD with `mfg.doctor`; configure it with `mfg.set` if needed.
2. Call `device.discover` for the requested transport and choose the intended device.
3. Call `device.create`; it probes with `query-rte 0` before returning a `targetId`.
4. Use that `targetId` with the relevant skill's `rom.*` operations.
5. Release the target with `device.delete` when finished.

Enumeration alone does not prove a device is usable. Targets are process-local: recreate them after restarting MCP. After loading extension firmware, rediscover and create a new target; the HID path may change. Device reset clears the extension firmware, so reload it before using extension commands again.

## Operation boundaries

- XPI NOR/eMMC operations require configuration words staged in device RAM, followed by `rom.config_memory`. This setup writes RAM even when the following operation is a read. Follow the skill's [ROM command sequences](references/rom-command-sequences.md#外部存储器参数). XPI NOR defaults to ILM address `0x200` when no other valid staging location is specified; eMMC staging parameters must be established separately.
- XPI NOR transfer addresses are byte addresses; eMMC/SDXC transfer addresses are sector indices, while lengths remain byte counts. The configuration address always identifies staged configuration words in RAM.
- Inline `rom.read_memory` is limited to 65536 bytes; larger dumps use `rom.read_memory_to_file`. The OTP workflow reads one aligned 4-byte word per call and verifies programming by readback, since OTP checksum verification is unavailable. OTP programming is not retried automatically.
- ROM file paths must be absolute and contain no whitespace/control characters. Input files must exist. File exports require an existing parent directory; replacement requires `overwrite: true` and authorization for that file.
- Writes, configuration, erases, loads, resets, and file replacement require authorization covering the actual target, range/data, and file. The server has no additional confirmation step. Check `isError` and operation `success`, `exitCode`, and `timedOut`; stop the sequence on failure.

The current MCP covers device and ROM operations. Image creation, signing/encryption, and production-package export remain CMD capabilities and are not exposed as MCP tools. The current MCP erase tools accept XPI NOR, not eMMC/SDXC.

The [complete MCP reference](../../mcp-servers/hpmmfgctl/README.md#complete-mcp-tool-reference) documents configuration/device tools, ROM parameters, memory IDs, and timeouts.

## Example prompts

Name the skill explicitly to select a workflow. Compatible clients can also match skills automatically from a task description.

```text
Use hpm-mfgtool-setup to check my Manufacturing CMD configuration and discover serial/HID devices.
Use hpm-mfgtool-setup to connect to the selected device and create a successfully probed target.
Use hpm-image-flash to program this existing image into the specified XPI NOR address and verify it.
Use hpm-memory-read-erase to export the specified memory range to this absolute file path.
Use hpm-otp-read-program to read three OTP words from this aligned address without programming them.
Use hpm-rom-firmware-session to load the appropriate bootloader extension, reconnect, and check checksum support.
```

## Troubleshooting and verification

- Startup failure: check Node.js, `npx`, npm registry access, and native-module installation.
- CMD failure: run `mfg.doctor`, check `HPMMFGCTL_CONFIG`, and configure the compatible executable with `mfg.set`.
- Device failure: check ROM boot mode, serial/HID selection, port occupancy, and Linux permissions. Use `device.create` to establish actual connectivity.
- Unknown target: recreate the target after server restart or firmware-session changes.
- Checksum command unavailable: query ROM commands and use the extension-firmware workflow if needed; confirm the SoC series and signed/unsigned choice.
- ROM/file failure: check the memory ID, address units, external-memory setup, input/output path constraints, and the returned command log.

This README was checked against repository configuration, skills, and the local server contract. It does not establish npm publication status or validate real hardware. See the [package documentation](../../mcp-servers/hpmmfgctl/README.md) for development checks and hardware verification requirements.
