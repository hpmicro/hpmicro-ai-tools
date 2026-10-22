# Contributing

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

Contributions to plugins, MCP servers, tests, and documentation are welcome.
Read the [README](README.md) and relevant package documentation first. You may
write issues and PR descriptions in English or Chinese. Source comments use English.

## Before starting

- Search existing issues and PRs to avoid duplicate work.
- Small fixes and documentation improvements can go directly to a PR.
- Discuss new plugins/MCP servers, major refactors, new dependencies with broad
  impact, and breaking changes in an issue before implementation.
- Keep each PR focused on one problem; avoid unrelated cleanup or formatting.

## Workflow

1. Fork the repository and create a branch from current `main`, for example
   `fix/hpmsdkctl-config` or `docs/install-guide`.
2. Implement the scoped change and add appropriate tests and documentation.
3. Run the applicable checks below and record results and limitations.
4. Open a PR targeting `main` using the PR template. Use Draft for unfinished work.
5. Address review feedback and resolve discussions with the reviewer.
6. A maintainer reviews, merges, and manages any release separately.

Use descriptive PR titles, for example `fix(hpmsdkctl): validate OpenOCD path`,
`feat(hpm-sdk-helper): improve build guidance`, or `docs: clarify installation`.
Individual commit messages are not subject to an automated naming requirement.
Squash merge is the preferred strategy, not an automatically enforced setting.

Do not change release versions, create release tags, or publish packages in an
ordinary contribution PR. Maintainers handle releases; dependency lockfile
changes are still expected when dependencies change. If a version change is
specifically requested by a maintainer, explain it in the PR.

## Validation

For hpmsdkctl code, run from its package directory:

```sh
cd mcp-servers/hpmsdkctl
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

Bug fixes should include a regression test where a realistic test seam exists;
otherwise explain why it cannot be added. Do not commit generated `dist`,
`node_modules`, `.test-bin`, local configuration, credentials, or build artifacts.

| Change         | Expected evidence                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Documentation  | Valid links/examples and matching English/Chinese content                                       |
| Plugin/skill   | Valid JSON, correct manifest/resource paths, and tested client/version                          |
| CLI/MCP        | Checks above, tests for changed behavior, and updated public contracts                          |
| Flash/debug    | SDK/tool versions, board details if applicable, and actual validation scope                     |
| New plugin/MCP | Prior discussion, independent dependencies, documentation, tests, and proposed CI/release setup |

Hardware, full SDK, and reference tests are not mandatory for every contribution.
Clearly distinguish mock/unit testing from real SDK or hardware testing. Report
skipped tests and unavailable equipment; never claim validation you did not run.
Do not flash hardware merely to complete a checklist.

## Code and compatibility

- Follow the affected project's formatter, linter, and architecture.
- Use descriptive camelCase names internally and English JSDoc for exported
  functions, classes, and non-obvious contracts. Keep functions visually separated.
- Preserve existing external CLI flags, MCP snake_case fields, and configuration
  formats unless a breaking change has been discussed and documented.
- Keep CLI/MCP adapters separate from business logic; avoid coupling one
  adapter's formatting or errors into shared operations.
- Update both language versions of affected documentation. Keep executable
  examples and protocol schemas consistent with the implementation.
- Each MCP owns its dependencies; do not introduce a root npm workspace without discussion.
- Keep all applicable LICENSE copies and metadata consistent when licensing changes.

## Review and CI

Provide the motivation/linked issue, change summary, exact validation results,
compatibility impact, and documentation changes. Mark non-applicable checks as
such with an explanation rather than claiming they passed.

External PRs should receive maintainer approval before merge. Applicable CI must
pass and review discussions must be resolved. Maintainers may ask for smaller
PRs, tests, or a revised approach. These are contribution policies; repository
branch protection settings are configured separately by administrators.

Currently, hpmsdkctl CI uses path filters and runs only for package or CI workflow
changes. A plugin/documentation-only PR may have no CI run; that is not proof of
validation. There is not yet a universal PR gate. Do not require this filtered
workflow for every PR without addressing skipped checks.

Fork workflows may require maintainer approval, particularly for first-time
contributors. Do not add secrets, elevated permissions, or publication steps to
PR validation. Changes to workflows require careful maintainer review.
Merging a PR does not publish npm: releases use maintainer-managed version tags.

## Licensing and conduct

Unless separately agreed, contributions are submitted under the repository's
[MIT License](LICENSE). Submit only material you have the right to contribute;
preserve third-party license and copyright notices. No separate CLA is required.
External SDKs and dependencies retain their own licenses.

Be respectful, discuss technical tradeoffs constructively, and avoid sharing
private data in issues, examples, logs, or screenshots.
