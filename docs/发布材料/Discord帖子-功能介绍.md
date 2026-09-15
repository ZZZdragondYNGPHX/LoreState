# LoreState｜文字状态栏增量记忆 · 功能介绍 · 0.12.3

做文字角色卡时，状态栏最常见的问题之一是：**每轮整张重写，既浪费提示空间，也容易把没变化的事实改坏。**

LoreState 的做法是把“当前仍然成立的事实”单独维护：第一次建立完整状态，之后只提交发生变化的栏目；脚本负责校验、合并、历史回放、快照和状态栏展示。

**核心能力**
- `full → delta` 增量更新：没变化的栏目自动继承，非法更新不会半提交。
- 模块化状态：人物、物品、国家、组织、地点、事件等可以拥有不同栏目。
- 热档 / 冷档与按需读取：长期保存完整资料，同时减少无关实体持续占用提示空间。
- 历史回放、快照与回档：状态跟随当前聊天分支恢复，不只保存“最后一份表”。
- Template API v2：状态数据和 HTML 展示解耦，可做多区域 HUD、冷档区和不同布局。
- 外观制作台：可用已保存的模型连接生成或修改 HTML 草稿，通过本地校验后再手动应用。
- 独立状态模型：支持 Tavern Helper OpenAI 兼容连接，以及 Chat Completions、OpenAI Responses、Anthropic Messages 直连。
- 酒馆提示词预设桥接：状态更新可以复用当前或指定的酒馆提示词预设。
- EJS 动态世界书：可选配合 ST-Prompt-Template，只读读取 LoreState 状态，按数值区间或阶段输出不同世界书内容。
- 0.12.3 支持彻底删除旧配置后重新制卡、重建栏目，不再需要换一份脚本才能改变 DataSchema。

**安装**
需要 SillyTavern + Tavern Helper。当前推荐固定稳定版 `0.12.3`；`main` 仅用于跟随开发，两者不要同时启用。

固定版脚本 JSON：
https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/tags/0.12.3/prototype/dist/0.12.3/lorestate-script.json

首次使用流程：**导入脚本 → 选择世界书/状态栏条目 → 确认绑定 → 制作或载入 Template API v2 HTML → 保存并启用聊天。**

项目主页：
https://github.com/ZZZdragondYNGPHX/LoreState

创作者 / 使用者快速参考：
https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/发布材料/Discord帖子-创作者与使用者参考.md

LoreState 保存的是持续事实，不是数值战斗或自动剧情引擎。自动化与模拟宿主通过也不等于真实酒馆、实际模型和长期游玩已经验收。