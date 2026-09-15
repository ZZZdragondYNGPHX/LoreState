# LoreState｜创作者 / 使用者快速参考 · 0.13.0

**更新核对与导出**：模型连接中可填写自定义更新核对规则；作者初始档案/字段约束先“保存为新聊天默认配置”。分享前到“规则配置 → 角色卡导出”执行“检查并准备角色卡导出”。详见 [核对与导出指南](../更新核对与随卡导出.md)。


这份适合放在 Discord 置顶、资源帖或功能介绍帖的后续楼层。需要深入理解某一项时，再进入对应完整文档。

**当前版本**
- 固定稳定版：`0.12.3`
- 需要：SillyTavern + Tavern Helper
- 固定版与 `main` 不要同时启用
- 固定组件：https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/tags/0.13.0/prototype/dist/0.13.0/lorestate-script.json

**第一次配置**
1. 在世界书创建 `【LoreState模块 v1】` 状态栏条目。
2. 打开 **LoreState → 规则配置**，选择世界书与条目。
3. 点击 **确认绑定状态栏条目**。
4. 在 **外观制作** 生成/修改 HTML，或载入合法 Template API v2 模板。
5. 预览后应用，并点击 **保存 HTML 并启用本聊天**。
6. 用测试聊天验证一次 `full → delta`、刷新恢复和切换聊天。

**创作者写什么**
- 模块条目决定 DataSchema，也就是“保存哪些字段”。
- HTML 只决定“怎么显示”，不能用换皮肤偷偷增删状态字段。
- 第一次有效状态建立完整 `full`；之后 `delta` 只提交变化栏目。
- 一个栏目内部仍是完整当前值替换，新值必须保留该栏目里仍成立的旧事实。
- 未确认的猜测、计划和未来事件不要写成当前事实。

**想增删 / 改名栏目**
0.12.3 可在 **规则配置 → 聊天维护** 输入 `删除旧配置`，执行 **彻底删除旧配置**，然后重新绑定条目和 HTML。

这是破坏性结构重建：会删除本脚本配置与当前聊天的 LoreState 状态、快照、回档和更新绑定；保留聊天正文、世界书和全局 API。重要数据先备份。

**独立模型 / API**
支持 Tavern Helper OpenAI 兼容路径、Chat Completions、OpenAI Responses、Anthropic Messages；可以设置完整端点、自定义请求头、模型列表、重试、超时、流式和思考程度。默认 3 次总请求、0 无限等待、8000 tokens、`auto`。

**EJS 动态世界书**
0.12.0 起可选配合 ST-Prompt-Template，通过 `LoreState.*` / `ls()` / `lsRange()` / `lsStage()` 只读读取当前状态。LoreState 不内置 EJS，也不会把 EJS 结果写回状态。

**升级**
- `0.11.0`～`0.12.2 → 0.12.3`：合法 v2 HTML、v3 状态和快照无需因版本升级迁移。
- `0.10.6` 或更早：旧 HTML 需要重制为 Template API v2。

**详细文档**
- 文档目录：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/README.md
- 作者入门：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/作者入门.md
- 条目创作：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/状态栏条目创作指南.md
- 连续更新示例：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/状态栏条目与对话示例.md
- Template API v2：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/HTML模板适配指南.md
- 外观制作台：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/外观制作台.md
- 独立模型 / API：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/额外模型与API预设.md
- EJS 动态世界书：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/EJS动态世界书.md
- FAQ / 试卡：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/常见问题与试卡清单.md

遇到问题时优先记录：实际加载版本、操作步骤、出错楼层，以及去除隐私后的 LoreState 诊断信息。