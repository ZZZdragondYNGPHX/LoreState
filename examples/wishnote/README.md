# 缄愿笔记示例

此目录是 LoreState 的领域示例，使用仓库根目录的同一通用引擎。

1. 安装 LoreState。
2. 导入并绑定本目录 `worldbook.json`。停用旧维护 QR 和旧愿档存储规则。
3. 新聊天可预览并确认 `baseline.json`；已有愿档先转换旧备份，不能用空白基线代替迁移。

```sh
node examples/wishnote/migrate.mjs backup 旧愿档备份.json 新基线.json
node examples/wishnote/migrate.mjs xml 热档.txt 新基线.json 冷档世界书.json
```

输出文件必须不存在。转换只生成文件，随后在 LoreState 面板导入、预览和确认。原始旧状态保存在 `provenance.original`，不会送入模型；转换不复制旧聊天历史，新基线后的回复使用 LoreStatePatch。

人物路径为 `/people/P01/reality/F01`；愿望内容更新到 `/people/P01/wishes/W01/text`。热/冷标记均保留，但这一通用版本会完整注入所有人物。领域语义由 `profile.instructions` 与世界书引导，核心不强制恒/程类型或目标人物存在。

`legacy/` 仅供离线迁移和原始世界书对照，不是第二份可安装扩展。`adapter.js` 将旧格式转换到通用文字状态，保留原件供核查。旧版允许的自定义字段若不是纯文字结构，转换会拒绝，需先人工整理；不会悄悄丢弃它们。
