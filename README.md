# LoreState

LoreState 为 SillyTavern 文字角色卡保存持续状态。AI 在正文后提交状态变化，脚本负责校验、合并、历史回放、快照与状态栏展示；人物、物品、国家、组织、地点、事件等可以使用不同栏目，并支持冷热档按需读取。

当前维护线是 **Tavern Helper 文字状态脚本**。当前固定稳定版为不可移动标签 **`0.13.0`**，`main` 是唯一长期开发分支。

## 0.13.0 新增

- **更新前核对**：同一次请求先逐项核对，再输出更新；校验漏查、漏写和摘要/状态冲突。
- **自定义核对规则**：可按状态栏定义更新条件，随角色卡保存。
- **随卡导出准备**：规则副本、作者默认档案、外观和更新默认值可携带；检查脚本数据导出开关。

用法见 [更新核对与随卡导出](docs/更新核对与随卡导出.md)，完整改动见 [0.13.0 发布说明](docs/发布材料/0.13.0-更新核对与随卡导出.md)。

## 已有能力

- **配置重置**：可在同一脚本中彻底删除旧 LoreState 配置并重新制卡/重建栏目。
- **多协议模型连接**：保留酒馆助手 OpenAI 兼容连接，并支持 Chat Completions、OpenAI Responses、Anthropic Messages 直连。
- **完整端点与自定义请求头**：基础地址可保留代理前缀，也可直接填写完整接口端点。
- **酒馆提示词预设桥接**：状态更新可使用内置、当前酒馆或指定酒馆提示词预设。
- **请求默认值**：3 次总请求、0 表示无限等待、8000 tokens、`auto` 思考程度；可显式选择 `none`～`ultra`，实际支持范围由模型/服务决定。
- 继续兼容 XML v3 状态、`【LoreState模块 v1】`、Template API v2、外观制作台、快照/回档、隐藏楼层回放和 EJS 只读桥接。

完整改动与边界见 [0.12.3 发布说明](docs/发布材料/0.12.3-配置重置与多协议API.md)。

## 安装

固定安装使用 [0.13.0 远程组件](prototype/dist/0.13.0/lorestate-script.json)。只有明确需要跟随开发时才使用 [main 远程组件](prototype/dist/main/lorestate-script.json)。不要同时启用固定版和 main。

也可以在 Tavern Helper 角色脚本中使用固定 import：

```js
import 'https://testingcf.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@0.13.0/artifact/bundle.js';
```

首次使用顺序：**选择世界书与状态栏条目 → 确认绑定状态栏条目 → 制作/载入 Template API v2 HTML → 预览 → 保存 HTML 并启用本聊天**。

## 文档从哪里看

- **[文档目录](docs/README.md)**：按“作者 / 外观 / EJS / 排错 / 开发”分类的当前入口。
- **[作者入门](docs/作者入门.md)**：安装、首次绑定、full → delta、0.12.3 重置配置。
- **[状态栏条目创作指南](docs/状态栏条目创作指南.md)**：`【LoreState模块 v1】` 的当前写法。
- **[Template API v2](docs/HTML模板适配指南.md)** 与 **[外观制作台](docs/外观制作台.md)**：状态栏 HTML。
- **[额外模型与 API 预设](docs/额外模型与API预设.md)**：独立状态模型、多协议连接、重试与取消。
- **[EJS / 动态世界书](docs/EJS动态世界书.md)**：只读读取 LoreState 状态并按区间/阶段输出世界书内容。
- **[FAQ / 试卡清单](docs/常见问题与试卡清单.md)**：升级、显示、冷热档、回档、EJS 与实机验收。
- **[发布材料](docs/发布材料/README.md)**：当前 0.13.0 对外材料及历史版本发布证据。

## 升级与重做栏目

从 `0.11.0` / `0.11.1` / `0.12.0` / `0.12.1` / `0.12.2` 升级到 `0.12.3`，合法 v2 HTML、v3 状态和快照不需要因为版本升级而迁移。

从 `0.10.6` 或更早版本升级时，旧 HTML 原文可保留，但当前展示层需要重新制作 Template API v2 外观。

如果不是“升级”，而是想**增删/改名栏目或换一套 DataSchema**，0.12.3 可以在 **规则配置 → 聊天维护** 输入 `删除旧配置` 并执行 **彻底删除旧配置**。这是破坏性操作：会清除本脚本配置与当前聊天的 LoreState 状态/快照/绑定，但保留聊天正文、世界书、全局 API 预设；重要数据应先备份。详见 [作者入门](docs/作者入门.md)。

## 开发

Node.js 22+。开发前阅读 [AGENTS.md](AGENTS.md)、[版本管理](docs/版本管理.md)、[开发说明](docs/开发说明.md) 和[当前交接](交接文档.md)。

```sh
npm run build
npm run check
npm test
```

涉及模板、UI 或宿主行为时再运行 `node scripts/test-browser.mjs`；涉及 EJS 时按任务运行 `node scripts/test-ejs.mjs`。

当前 `0.13.0` 已发布；下一 patch 的构建示例是：

```sh
npm run build -- 0.13.1
```

正式版本只用不可移动 Git tag 表示；固定 loader 只能引用自己的 `@<version>/artifact/bundle.js`。

## 历史实现

仓库根目录的 `src/`、`index.js`、`manifest.json` 与 `package.json` 中的 **0.2.1** 属于已停止维护的旧原生扩展，**不是当前 Tavern Helper 脚本版本**。旧协议、旧迁移记录与早期作者文档统一放在 [docs/archive](docs/archive/README.md) 或 Git 历史中，不作为当前安装和制卡入口。

当前自动化验证范围见 [prototype/verification.md](prototype/verification.md)。自动测试与模拟宿主通过不等于真实 SillyTavern、真实模型、手机和长期游玩已经验收。
