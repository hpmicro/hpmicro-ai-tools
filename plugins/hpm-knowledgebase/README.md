# HPM Knowledgebase Plugin

[English](README.md) | [简体中文](README.zh-CN.md)

`hpm-knowledgebase` helps you find and read HPMicro technical material, including chip manuals, SDK code, board documentation, and knowledgebase articles.

## What you can look up

- Chip datasheets, user manuals, register descriptions, and errata.
- SDK drivers, APIs, and example code.
- Board schematics, interfaces, boot settings, and user guides.
- Knowledgebase articles, FAQs, troubleshooting tips, and usage experience.

Available material and SDK versions depend on the service's current collection. Include the chip or board model and SDK version in your question to get more relevant answers.

## Get started

1. Follow the [installation guide](../../README.md#install-plugins) to install and enable `hpm-knowledgebase`.
2. Sign in when prompted by your client.
3. Ask your question and request references to the relevant material.

The plugin connects to `https://kb.hpmicro.com/llm/mcp`. You need network access to the service; no local SDK or build tools are required.

## Example prompts

```text
Use the HPM Knowledgebase plugin to find the UART examples for my chip and SDK version.
Use the HPM Knowledgebase plugin to explain this register field and cite the relevant manual section.
Use the HPM Knowledgebase plugin to look up my board's boot settings and interface connections.
Use the HPM Knowledgebase plugin to find articles about this error and summarize the suggested fixes.
Use the HPM Knowledgebase plugin to check this API's usage and provide the source reference.
```

You can describe the task directly; there is no need to name individual tools.

## Common issues

- Cannot connect: check your network connection and whether the plugin is enabled.
- Sign-in required: follow the client's prompts to sign in again.
- No relevant material found: provide the chip/board model, SDK version, full error message, or a more specific question.
