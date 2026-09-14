# LoreState｜文字状态栏增量记忆 · 0.12.2

做文字角色卡时，状态栏常常每轮整张重写。LoreState 的思路是：**第一次记录完整状态，之后只更新发生变化的栏目**；脚本负责校验、合并、历史回放和状态栏展示。

比如上一轮是「地点：酒馆 / 衣着：斗篷 / 身体：疲惫」，这一轮只换了雨衣，AI 只需更新“衣着”，其他内容继续继承。

**目前支持**
- `full → delta` 增量更新，错误轮不会覆盖已有有效状态。
- 人物、物品、事件、国家等独立模块，可各自定义栏目。
- 热档 / 冷档与按需读取，减少无关实体长期占用提示空间。
- Template API v2：多区域 HUD、部分/重复字段、自定义冷档区域。
- 外观制作台：可用已保存的模型 API 生成或修改 HTML 草稿，校验后手动应用。
- 可选 EJS 动态世界书：配合 ST-Prompt-Template，根据 LoreState 当前只读状态按数值区间/阶段输出不同世界书内容。
- 0.12.2：浅色控制中心、五区导航；更新/取消/撤销统一到“更新与恢复”。保留首次条目绑定修复。

**安装**
需要 SillyTavern + Tavern Helper。推荐固定稳定版 `0.12.2`；`main` 仅用于跟随开发，两者不要同时启用。

固定版脚本 JSON：
https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/tags/0.12.2/prototype/dist/0.12.2/lorestate-script.json

导入后：**魔法棒 → LoreState → 选择世界书/条目 → 确认绑定 → 制作或载入 v2 HTML → 保存并启用聊天。**

从 `0.11.0 / 0.11.1 / 0.12.0` 升级到 `0.12.2`，现有 v3 状态、快照和 v2 外观可继续使用。

**作者必看**
- 作者入门：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/作者入门.md
- 条目创作：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/状态栏条目创作指南.md
- Template API v2：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/HTML模板适配指南.md
- 外观制作台：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/外观制作台.md
- EJS 动态世界书：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/EJS动态世界书.md
- FAQ / 试卡：https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/常见问题与试卡清单.md

项目主页：https://github.com/ZZZdragondYNGPHX/LoreState

说明：LoreState 保存的是“当前仍然成立的事实”，不是数值游戏引擎。EJS 需自行安装 ST-Prompt-Template。自动化与模拟宿主测试不等同于真实酒馆、实际模型和长期游玩验收。