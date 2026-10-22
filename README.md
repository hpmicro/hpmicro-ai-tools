# HPMicro AI Tools

[English](README.md) | [简体中文](README.zh-CN.md)

Agent plugins for HPMicro SDK development, image programming, pin/clock configuration, and technical information lookup.

| Plugin | Purpose |
| --- | --- |
| [hpm-sdk-helper](mcp-servers/hpmsdkctl/README.md) | Configure the SDK environment, build projects, flash firmware, and debug. |
| [hpm-mfgtool-helper](plugins/hpm-mfgtool-helper/README.md) | Connect devices, program images, and read, verify, or erase memory. |
| [hpm-knowledgebase](plugins/hpm-knowledgebase/README.md) | Find SDK code, chip/board documentation, and knowledgebase articles. |
| [hpm-pintool-helper](plugins/hpm-pintool-helper/README.md) | Configure pins, clocks, and programmable logic; generate code/diagrams and manage projects. |

## Requirements

SDK and Manufacturing plugins require Node.js **22.15+**, Git, and `npm`/`npx` in `PATH`. Installation needs access to GitHub and the official npm registry. Use a client with compatible plugin or stdio MCP support.

SDK tools run on your computer. Building requires locally installed HPM SDK, CMake, Ninja, Python, and a RISC-V toolchain, or an SDK Env directory containing their paths. OpenOCD is required for flashing and GDB server operations. Flashing writes target hardware: review the board, firmware, and address first.

Manufacturing operations require a separately installed `hpm_manufacturing_cmd` on Windows x64 or Linux x86_64. Use the setup workflow to configure its path and connect a device. These operations do not require the SDK build toolchain. See the [plugin guide](plugins/hpm-mfgtool-helper/README.md).

## Install plugins

Choose SDK, Manufacturing, Pin Tool, or Knowledgebase plugins independently, or combine them. The Knowledgebase plugin searches SDK code, chip/board documentation, and knowledgebase articles. It connects to `https://kb.hpmicro.com/llm/mcp`; enable the plugin and sign in when prompted. No local SDK or build tools are required. See the [plugin guide](plugins/hpm-knowledgebase/README.md).

The Pin Tool plugin helps configure pins, signal routing, clocks, and programmable logic, generate code and diagrams, and manage `.hpmpc` projects. It connects to `https://tools.hpmicro.com/api/mcp`; sign in when prompted. No local SDK or build tools are required. See the [workflow guide](plugins/hpm-pintool-helper/README.md).

### Claude Code

Run in a Claude Code session and follow the installation/activation prompts:

```text
/plugin marketplace add hpmicro/hpmicro-ai-tools
/plugin install hpm-sdk-helper@hpm-sdk-marketplace
/plugin install hpm-mfgtool-helper@hpm-sdk-marketplace
/plugin install hpm-knowledgebase@hpm-sdk-marketplace
/plugin install hpm-pintool-helper@hpm-sdk-marketplace
```

See the [official marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces).

### Codex

Add the marketplace in a terminal:

```sh
codex plugin marketplace add https://github.com/hpmicro/hpmicro-ai-tools.git
```

In a compatible client, open the plugin browser (`/plugins` in Codex CLI), then install and enable `hpm-sdk-helper`, `hpm-mfgtool-helper`, `hpm-pintool-helper`, or `hpm-knowledgebase`. Client support varies; see the [official plugin documentation](https://learn.chatgpt.com/docs/plugins). The marketplace command was checked against the CLI used for this repository.

### VS Code / GitHub Copilot

In a VS Code version with agent plugin support, configure:

```json
{
  "chat.plugins.enabled": true,
  "chat.plugins.marketplaces": ["hpmicro/hpmicro-ai-tools"]
}
```

Search `@agentPlugins` in Extensions, install the desired plugin, and confirm its skills and MCP tools are enabled. See the [official agent plugin documentation](https://code.visualstudio.com/docs/agent-customization/agent-plugins).

### Cursor

Clone the repository:

```sh
git clone https://github.com/hpmicro/hpmicro-ai-tools.git
```

Copy the plugins you need to the corresponding local installation directories, including their hidden files and directories:

| Source directory             | Installation directory                       |
| ---------------------------- | -------------------------------------------- |
| `plugins/hpm-sdk-helper`     | `~/.cursor/plugins/local/hpm-sdk-helper`     |
| `plugins/hpm-mfgtool-helper` | `~/.cursor/plugins/local/hpm-mfgtool-helper` |
| `plugins/hpm-knowledgebase`  | `~/.cursor/plugins/local/hpm-knowledgebase`  |
| `plugins/hpm-pintool-helper` | `~/.cursor/plugins/local/hpm-pintool-helper` |

Restart Cursor or run `Developer: Reload Window`, then open **Customize** to check the installed plugins. Local plugin imports must be allowed by your client or organization. See the [official plugin documentation](https://prod.cursor.com/docs/plugins).

## Use hpmsdkctl directly

No source build is needed for plugin users. To install the CLI independently:

```sh
npm install -g hpmsdkctl --registry=https://registry.npmjs.org/
hpmsdkctl --help
hpmsdkctl --version
hpmsdkctl config init --sdk-env /path/to/sdk_env
hpmsdkctl config check
```

For a compatible MCP client, use the plugin's server definition below. Adapt the enclosing configuration format to your client:

```json
{
  "mcpServers": {
    "hpm-sdk-ctl": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "--registry=https://registry.npmjs.org/", "hpmsdkctl", "mcp"]
    }
  }
}
```

To pin a reproducible MCP version, replace `hpmsdkctl` with `hpmsdkctl@<version>`.

## Use hpmmfgctl directly

`hpmmfgctl` provides a stdio MCP server rather than SDK CLI subcommands. Build it locally as described in the [package README](mcp-servers/hpmmfgctl/README.md). You can use the default configuration location or set `HPMMFGCTL_CONFIG` to an absolute configuration file path to isolate it:

```json
{
  "mcpServers": {
    "hpm-mfg-tool-ctl": {
      "command": "node",
      "args": ["/absolute/path/to/hpmmfgctl/dist/main.js", "mcp"],
      "env": { "HPMMFGCTL_CONFIG": "/absolute/path/to/hpmmfgctl/config.json" }
    }
  }
}
```

Use paths appropriate to your operating system. Once the package version is published, the plugin uses `npx --yes --registry=https://registry.npmjs.org/ hpmmfgctl@0.1.0 mcp`. Start with `mfg.doctor`, configure CMD with `mfg.set`, then discover and create a target before ROM operations. Only stdio transport is currently supported.

## Example prompts

Name the relevant skill in your request. For knowledgebase questions, name the plugin directly.

```text
Use hpm-config to check my HPM SDK configuration and report missing tools.
Use hpm-build to build hello_world; first discover available boards and build types.
Use hpm-flash-debug to find the OpenOCD settings for hpm6750evkmini and flash this ELF file.
Use hpm-mfgtool-setup to check my Manufacturing setup and connect to the selected device.
Use hpm-image-flash to program this existing image into the specified address and verify it.
Use hpm-knowledgebase to find material about my technical question and cite the sources.
Use hpm-pinmux-config to select peripheral pins and generate initialization code.
Use hpm-clock-config to configure my target clock frequency and show its path.
Use hpm-pla-config to generate initialization code and a flowchart for my logic requirements.
Use hpm-hpmpc-project to read my .hpmpc project and generate its pinmux and clock source files.
```

Initialize the environment before requesting builds. All commands, options, configuration keys, and MCP tools are listed in the [package documentation](mcp-servers/hpmsdkctl/README.md). Manufacturing tools and operation limits are documented in [hpmmfgctl](mcp-servers/hpmmfgctl/README.md).

## Repository layout

```text
hpmicro-ai-tools/
├── .agents/plugins/marketplace.json    # Codex marketplace
├── .claude-plugin/marketplace.json     # Claude Code / compatible clients
├── .cursor-plugin/marketplace.json     # Cursor marketplace metadata
├── plugins/
│   ├── hpm-sdk-helper/                 # SDK manifests, skills, and MCP configuration
│   ├── hpm-mfgtool-helper/             # Manufacturing manifests, skills, and MCP configuration
│   ├── hpm-knowledgebase/              # Knowledgebase manifests and remote MCP configuration
│   └── hpm-pintool-helper/             # Pin Tool manifests, skills, documentation, and remote MCP configuration
├── mcp-servers/
│   ├── hpmsdkctl/                      # SDK CLI/MCP source and tests
│   └── hpmmfgctl/                      # Manufacturing MCP source and tests
└── .github/workflows/
    ├── hpmsdkctl-ci.yml
    ├── hpmsdkctl-publish.yml
    ├── hpmmfgctl-ci.yml
    └── hpmmfgctl-publish.yml
```

Each MCP project owns its dependencies, lockfile, tests, and release workflow. There is no root `package.json` or npm workspace. Additional plugins and MCP servers can be added independently, including servers in other languages.

## Development

```sh
git clone https://github.com/hpmicro/hpmicro-ai-tools.git
cd hpmicro-ai-tools/mcp-servers/hpmsdkctl
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
node dist/main.js --help
```

See the package README for architecture and optional SDK/reference tests. For Manufacturing, use `mcp-servers/hpmmfgctl` as the working directory; the same install, lint, format, typecheck, build, and test commands apply. The plugin runs the npm package, not the local build. To test local MCP changes, configure your client to run `node` with the absolute path to `dist/main.js` followed by `mcp`.

## Updates and releases

Plugin updates and npm releases are separate:

- Plugin: update relevant manifest and marketplace versions, then refresh/update through the client. Cursor local installations require copying the files again.
- CLI: run `npm install -g hpmsdkctl@latest --registry=https://registry.npmjs.org/`.
- MCP: select the intended package version in client configuration and restart the server. A pinned version does not update automatically.

`hpmsdkctl CI` runs for matching branch pushes and pull requests on Windows, macOS, and Linux with Node.js 22 and 24. It checks lint, formatting, types, build, tests, and package contents, but does not publish. Root README-only changes do not trigger this CI.

`Publish hpmsdkctl` runs only for `hpmsdkctl-v*` tag pushes. It requires a stable version and matching tag, runs `prepublishOnly` checks, and publishes to the official npm registry. It does not wait for the separate multi-platform CI.

`hpmmfgctl CI` checks Windows/Linux with Node.js 22 and 24, including native device enumeration. `Publish hpmmfgctl` runs for `hpmmfgctl-v*` tags and requires a matching stable package version. Use `hpmmfgctl-publish.yml` as the npm Trusted Publisher workflow for that package. Update the plugin's pinned package version when releasing a new Manufacturing server version.

First update the version in the package directory:

```sh
npm version patch --no-git-tag-version
```

Commit and push `package.json` and `package-lock.json` before tagging that commit. For example, if the new version is `0.1.0`:

```sh
git tag hpmsdkctl-v0.1.0
git push origin hpmsdkctl-v0.1.0
```

The workflow uses GitHub Environment `npm`. npm Trusted Publisher must match `hpmicro/hpmicro-ai-tools`, workflow filename `hpmsdkctl-publish.yml`, and environment `npm`, and allow direct `npm publish`. No npm token is required. See [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/). Already published versions cannot be overwritten. Beta releases are not supported by the current workflow.

## Troubleshooting

- Plugin missing: check marketplace registration, repository access, client compatibility, and organization policies.
- Local MCP startup failure: check Node.js, `PATH`, and npm registry access.
- Knowledgebase failure: check your network connection, plugin status, and sign-in. Include the chip/board model and SDK version if no relevant material is found. See [common issues](plugins/hpm-knowledgebase/README.md#common-issues).
- Pin Tool failure: check your network connection, plugin status, and sign-in. See [common issues](plugins/hpm-pintool-helper/README.md#common-issues).
- Build/flash failure: run `hpmsdkctl config check` and check tool paths.
- Manufacturing failure: use `hpm-mfgtool-setup` to check CMD configuration and reconnect to the device. See the [plugin guide](plugins/hpm-mfgtool-helper/README.md#troubleshooting-and-verification).
- CI passed but npm unchanged: inspect **Publish hpmsdkctl**, not only the test CI.
- Version unclear: run `npm view hpmsdkctl version --registry=https://registry.npmjs.org/`. Mirror or website caches may temporarily show older information. Substitute `hpmmfgctl` to check the Manufacturing package.
- OIDC denied: check Trusted Publisher identity, environment, and direct publish permission.

## Contributing

Contributions are welcome. Read the [contribution guide](CONTRIBUTING.md) before opening a PR. Discuss substantial changes first; keep PRs focused and report actual validation results. Maintainers manage releases separately.

## Licensing

This repository is licensed under the [MIT License](LICENSE). External HPM SDK, tools, and dependencies retain their own licenses.
