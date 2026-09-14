# LoreState｜文字状态栏增量记忆 · 0.12.1

做文字角色卡时，状态栏往往每轮都要整张重写。LoreState 的思路是：**第一次记录完整状态，之后只更新发生变化的栏目**；脚本负责校验、合并、历史回放和状态栏展示。

例如上一轮是「地点：酒馆 / 衣着：斗篷 / 身体：疲惫」，这一轮只换了雨衣，AI 只需更新“衣着”，其他内容自动继承。

**目前支持**
- `full → delta` 增量状态；错误更新不会覆盖已有有效状态。
- 人物、物品、事件、国家等独立模块，可按模块定义不同栏目。
- 热档 / 冷档与按需读取，减少无关实体长期占用提示空间。
- Template API v2：多区域 HUD、部分字段、重复字段、冷档区域。
- 外观制作台：可用已保存的模型 API 生成/修改 HTML 草稿，校验后手动应用。
- 可选 EJS 动态世界书桥接：配合 ST-Prompt-Template，用 LoreState 当前只读状态按区间/阶段输出不同世界书内容。
- 0.12.1 修复首次配置的世界书条目绑定：确认后刷新/切页不会再误重置。

**安装**
需要 SillyTavern + Tavern Helper。推荐使用固定稳定版 `0.12.1`；`main` 仅用于跟随开发。两者不要同时启用。

固定版脚本 JSON：
https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/tags/0.12.1/prototype/dist/0.12.1/lorestate-script.json

项目与完整教程：
https://github.com/ZZZdragondYNGPHX/LoreState

导入后打开 **魔法棒 → LoreState**：
1. 选择世界书和状态栏条目；
2. 点击“确认绑定状态栏条目”；
3. 制作或载入 Template API v2 HTML；
4. 保存并启用当前聊天。

从 `0.11.0 / 0.11.1 / 0.12.0` 升级到 `0.12.1`，现有 v3 状态、快照和 v2 外观可继续使用，无需迁移。

说明：LoreState 保存的是“当前仍然成立的事实”，不是数值游戏引擎。EJS 功能需要自行安装 ST-Prompt-Template。项目已通过自动化与模拟宿主回归，但不把这些测试等同于真实酒馆、实际模型和长期游玩验收。