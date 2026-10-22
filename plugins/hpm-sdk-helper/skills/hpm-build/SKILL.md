---
name: hpm-build
description: >
  HPM 微控制器 SDK 项目构建。用于查询可选构建配置、生成 CMake 构建目录、编译项目、本地化 SDK。
  Use when user wants to (1) build/compile an HPM SDK sample or application, (2) find compatible boards and build types,
  (3) generate a CMake build directory, or (4) localize SDK to make the project standalone.
  Triggered by phrases like "构建项目", "编译", "generate project", "build sample", "cmake", "本地化", "localize".
---

以下工具由 hpmsdkctl MCP server 提供。前提: 先通过 `config.check` 确认配置就绪。

## 工作流程

### 标准构建流程

1. **查询** — 调用 `build.list_options`:
   - 查 sample: `{ "sample": "hello_world" }`
   - 查自定义项目: `{ "app_dir": "/path/to/project" }`
   - 返回兼容的 board 列表，每个 board 下的 `hpm_build_type` 和 `cmake_build_type` 组合

2. **选择配置** — 直接询问用户需要构建的 board、hpm_build_type、cmake_build_type，从结果中选一组: board + hpm_build_type + cmake_build_type

3. **生成** — 调用 `build.generate`:
   - `sample` 或 `app_dir`（与上一步一致）
   - SDK 开发板传 `board`；自定义开发板传 `custom_board` 并省略 `board`，两者必须且只能选择一个
   - `hpm_build_type`, `cmake_build_type`
   - 可选: `custom_gcc_linker_file`, `build_dir`, `clean`

4. **编译** — 调用 `build.compile`，传入 generate 返回的 `build_dir`

### 可选操作

- `project.localize_sdk` — 传入 `build_dir`，将 SDK 复制到项目内
- `project.unlocalize_sdk` — 传入本地化后的项目目录，恢复原始状态

### 多核项目

对于包含 `core0`、`core1` 且 `core0/app.yaml` 声明 `linked_project` 的多核 sample，
向 `build.list_options` 和 `build.generate` 传入 sample 根路径。工具会选择 `core0` 作为主工程，
HPM SDK 的 CMake 流程会按照 `linked_project.build_type` 自动构建从核工程。
