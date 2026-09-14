# LoreState｜让文字状态栏真正“记住上一轮” · 0.12.1

做纯文字卡时，经常会遇到一个问题：状态栏明明只变了一两项，AI 却要每轮把整张状态表重新写一遍。越写越长，也更容易漏掉前面的内容。

于是做了 LoreState：**第一次写完整状态，之后只写发生变化的栏目；脚本负责校验、合并、回放，并在最新 AI 回复旁显示当前完整状态。**

比如上一轮是「地点：酒馆，衣着：斗篷，身体状况：有些疲惫」，这一轮只是换上雨衣，AI 只需要更新衣着。地点和身体状况会继续继承，不必重新生成一遍。

现在 LoreState 已经不只是单块状态栏：人物、物品、事件、国家等可以作为独立模块维护，共享栏目与实体栏目可以分开；不常用实体可以进入冷档，需要时再读取。

**当前能做什么**

- 首次 `full` 完整记录，后续 `delta` 增量更新；没有变化的栏目自动继承。
- 状态随聊天楼层保存，可按当前选中回复回放；错误更新不会覆盖已经有效的状态。
- 支持共享栏目与人物、物品、事件、国家等实体模块，并保留冷热档与按需读取能力。
- Template API v2 支持多区域 HUD、只显示部分字段、重复字段、同类型多个区域以及作者自定义冷档布局；HTML 只负责展示，不决定状态 schema。
- 内置“外观制作台”：可复用已保存的模型 API，从风格描述生成 HTML，或基于当前 HTML 继续修改；生成结果先作为草稿，校验后由用户手动应用。
- 外观支持字段条件显隐与字段值映射 class；继续维持静态 HTML/CSS、安全白名单与资源隔离。
- 可选接入 **ST-Prompt-Template** 的 EJS 动态世界书：通过 `lorestate`、`ls`、`lsHas`、`lsRange`、`lsStage` 或 `LoreState.*` 读取当前冻结快照，可按数值区间、阶段等条件决定本轮世界书输出。
- EJS 桥接是**只读**的：LoreState 不内置 EJS、不建立第二套状态、不把 EJS 结果写回状态。
- 0.12.1 修复了首次设置时的条目绑定：现在可以先确认要使用的状态栏世界书条目，再进入外观制作；刷新和切页不会再把选择误重置到第一条。

增量减少的是“每轮重新生成整张状态表”和“重复携带历史更新标签”的冗余；当前需要提供给模型的有效状态仍会进入上下文，实际 token 变化取决于角色卡、世界书和聊天内容。

当前稳定版为不可移动标签 **`0.12.1`**；`main` 是持续更新的开发入口。固定版本不会随着 `main` 后续提交变化。

## 安装

需要 **SillyTavern + 酒馆助手（Tavern Helper）**。

可以直接导入下面的远程脚本 JSON，也可以在酒馆助手中新建角色脚本，填入：

```js
import 'https://testingcf.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@0.12.1/artifact/bundle.js';
```

**main 分支（最新开发版）**

```js
import 'https://cdn.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@main/artifact/bundle.js';
```

只启用一份 LoreState，不要同时加载固定版和 `main`。

启用后从 **魔法棒 → LoreState 设置** 打开。首次使用时先选择世界书与状态栏条目，点击“确认绑定状态栏条目”；之后可以制作/应用 HTML，并启用当前聊天。

- [远程版脚本 JSON · 0.12.1](https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/tags/0.12.1/prototype/dist/0.12.1/lorestate-script.json)
- [main 远程版脚本 JSON · 持续更新](https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/heads/main/prototype/dist/main/lorestate-script.json)
- [EJS / 动态世界书作者指南](https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/EJS动态世界书.md)
- [外观制作台说明](https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/外观制作台.md)
- [Template API v2 / HTML 模板适配指南](https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/docs/HTML模板适配指南.md)
- [项目仓库](https://github.com/ZZZdragondYNGPHX/LoreState)

## 升级说明

从 **0.11.0 / 0.11.1 / 0.12.0 → 0.12.1**，现有 v3 状态、聊天快照和 Template API v2 外观可以继续使用，不需要迁移或重制。

如果从更早版本升级，旧 HTML 原文仍会保留，但需要按 **Template API v2** 重新制作并应用外观；状态引擎和已有状态不会因为换模板而被清空。

## 适用范围与边界

适合地点、衣着、身体状况、任务、关系、人物档案、物品、国家、事件等需要“持续记忆当前状态”的文字信息。状态内容仍以自然语言为主，脚本负责结构、校验、合并、回放和展示。

外观层只支持受限制的静态 HTML/CSS，不执行模型生成的自定义 JavaScript，也不允许任意外部资源。EJS 动态世界书依赖用户自行安装并启用 ST-Prompt-Template；未安装时 LoreState 的普通状态功能仍可使用。

0.12.1 已通过项目的构建、Node 测试以及浏览器模拟宿主回归；但这些自动化不等于真实 SillyTavern、真实模型、手机实机和长期人工游玩验收。遇到问题时，建议附上 LoreState 版本、操作步骤，以及去除隐私后的错误信息或状态标签。
