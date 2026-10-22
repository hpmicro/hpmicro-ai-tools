# HPM Pin Tool Plugin

[English](README.md) | [简体中文](README.zh-CN.md)

`hpm-pintool-helper` helps you configure HPMicro chip pins, signal routing, clocks, and programmable logic. It generates C code and diagrams, and supports importing and exporting `.hpmpc` projects.

## Get started

1. Follow the [installation guide](../../README.md#install-plugins) to install and enable `hpm-pintool-helper`.
2. Sign in when prompted by your client.
3. Provide your chip model, package, and configuration requirements, then select a workflow below.

The plugin connects to `https://tools.hpmicro.com/api/mcp`. You need network access to the service; no local SDK or build tools are required to use these workflows.

## Workflow skills

| Skill | What it helps you do |
| --- | --- |
| [hpm-pinmux-config](skills/hpm-pinmux-config/SKILL.md) | Select peripheral pins, check assignment conflicts, configure signal routing, and generate pinmux code. |
| [hpm-clock-config](skills/hpm-clock-config/SKILL.md) | Configure clocks for your target frequencies and generate code or clock-path diagrams. |
| [hpm-pla-config](skills/hpm-pla-config/SKILL.md) | Configure programmable logic and filtering, then generate initialization code or diagrams. |
| [hpm-hpmpc-project](skills/hpm-hpmpc-project/SKILL.md) | Read or save `.hpmpc` projects and generate pinmux and clock source files. |

Name the skill explicitly to select a workflow. Compatible clients can also match skills automatically from a task description.

## Example prompts

```text
Use hpm-pinmux-config to find UART RX/TX pin choices for my chip and package, then generate pinmux C code.
Use hpm-pinmux-config to check my pin assignments for conflicts and suggest alternatives.
Use hpm-pinmux-config to configure the signal routing required by my application.
Use hpm-clock-config to configure my target clock frequency and show the clock path.
Use hpm-pla-config to implement my logic and filtering requirements, then generate initialization code and a flowchart.
Use hpm-hpmpc-project to read my .hpmpc file and generate its pinmux and clock source files.
Use hpm-hpmpc-project to save my current configuration as a .hpmpc project.
```

Include existing pin connections, target frequencies, and any settings you need to preserve. If you already have a project file, provide it as the starting point.

## Common issues

- Cannot connect: check your network connection and whether the plugin is enabled.
- Sign-in required: follow the client's prompts to sign in again.
- A chip or feature is unavailable: ask the plugin to check the options available to your account.
- A project cannot be read: provide the complete `.hpmpc` file and describe any recent changes.
