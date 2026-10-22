---
name: hpm-hpmpc-project
description: 读取 HPM .hpmpc 本地工程生成引脚/时钟源码，或把完整 ProjectEntity 配置校验封装为 .hpmpc；也用于修改工程后重新生成完整性校验值。用于工程导入导出与源码转换，不负责构建或烧录。
---

# HPMPC 工程转换

先读取[远程会话与目标选择](../../references/service-context.md)。按输入类型选择以下分支；远程工具接收内容，本地文件读写由当前客户端执行。

## 从已有 .hpmpc 生成源码

1. 读取用户指定的文件并解析外层 JSON，取得 `content`、`secretKey`。 `content` 在标准文件中是 ProjectEntity 对象。以其中的 SDK/SoC/封装为目标，不擅自换成默认版本。
2. 将对象 `content` 序列化为 JSON 字符串，调用 `generate_code_from_hpmpc_file({ content, secretKey })`。如果输入本身已是 JSON 字符串，解析检查后只编码一层；工具不接收整份外层文件或本地 `filePath`。
3. 成功结果为文件名到源码的映射。按用户要求展示或保存，保存前确认返回路径解析后位于指定输出目录内；绝对路径或越界路径应报错。保留输出目录内无关文件。

完整性校验失败时报告错误，检查用户是否修改过内容。只有用户要求编辑或修复工程时才重新封装；不通过自动重签掩盖导入失败。

## 创建、修改或重新封装工程

1. 对已有工程作所需修改；新建或从独立生成配置转换时，读取 [工程结构与转换边界](references/project-entity.md)。新目标先查询芯片/封装与所需元数据；独立生成输入不能直接当作 ProjectEntity。
2. 调用 `generate_hpmpc_file_content({ projectEntity })`。该工具会做 schema 解析和代码生成可行性校验，返回 `{ clientKey, secretKey, content }`。保存服务端返回的完整对象；保留其规范化后的 `content`，因为它与 key 配套。
3. 用户还要求源码时，把返回 `content` 序列化，并用返回的 `secretKey` 调用 `generate_code_from_hpmpc_file`，再保存所需源码。修改内容之后重新封装，不本地仿造 `clientKey`/`secretKey`。

生成能力按 SDK/SoC 的 pinmux、clock 分别限制。某类能力关闭而对应 `functions` 非空时会失败；保留用户配置并报告该限制，不能删除函数或切换 SDK 让校验通过。

交付工程/源码输出位置、目标 SDK/SoC/封装、服务返回的生成文件及实际验证结果。只有拿到有效工具结果并完成用户要求的保存才报告导出成功；完整性校验和代码生成不等于编译或硬件验证。
