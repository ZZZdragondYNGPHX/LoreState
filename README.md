# LoreState

LoreState 为 SillyTavern 文字角色卡保存持续状态。AI 在正文后输出状态更新，脚本负责校验、合并、历史回放与状态栏展示。人物、国家、组织、地点、物品和事件可以使用各自的栏目；冷档按需读取。

当前维护线是 **Tavern Helper 文字状态脚本的 `main` 开发分支**，当前稳定版为不可移动标签 **`0.12.0`**。历史 `0.10.3` RC 已从误建的版本号 branch 原样固化为同名兼容 tag；它不再接受提交。

**0.12.0 新增 EJS 动态世界书桥接**：可选接入 ST-Prompt-Template，从 LoreState 回放读取冻结快照，通过区间与阶段条件输出当前适用的世界书内容。不内置 EJS、不另建状态、不修改存档；现有 v3 状态和 v2 外观保持兼容。见 [0.12.0 发布说明](docs/发布材料/0.12.0-EJS动态世界书.md)。

**0.11.1 新增外观制作台**：复用 API 绑定，从风格描述生成/修改 HTML 草稿，校验预览后手动应用；支持字段条件显隐与样式 class 映射。已有 v2 模板与聊天存档保持兼容。见 [0.11.1 发布说明](docs/发布材料/0.11.1-外观制作台.md)。

**0.11.0 引入 Template API v2**：多区域 HUD、部分/重复字段与作者自定义冷档布局。仅展示层破坏性升级，旧模板保留原文但需重制；XML v3、数据 schema 与存档不变。此前的 `0.10.6` 标签保持原样。详见 [v2 作者接口与两套示例](docs/HTML模板适配指南.md)及 [0.11.0 发布说明](docs/发布材料/0.11.0-Template-API-v2.md)。

## 从这里开始

- **[作者文档目录](docs/README.md)**：入门顺序、模块条目、HTML 与试卡清单。
- **[版本管理](docs/版本管理.md)**：`main`、正式 tag、构建产物与调试分支的唯一规则。
- [0.9.0 模块条目与试卡](docs/0.9.0模块条目与试卡.md)：新卡配置和可复制示例。
- [额外模型与 API 预设](docs/额外模型与API预设.md)：独立更新、重试、取消与撤销；真实酒馆及实际模型仍需单独验收。
- **[EJS / 动态世界书](docs/EJS动态世界书.md)**：只读桥接、真实字段路径、渐进关系示例与验收边界（0.12.0 起提供）。
- **[隐藏助手兼容与更新](docs/隐藏助手兼容与更新.md)**：已有聊天恢复、脚本更新和验收。
- [当前脚本代码](artifact/bundle.js)：`main` 的生成运行代码。
- [常见问题与试卡清单](docs/常见问题与试卡清单.md)。
- [发布材料](docs/发布材料/README.md)：对外帖子、附件和作者改造教程。

## 下载与版本边界

| 入口 | 性质 | 说明 |
| --- | --- | --- |
| [0.12.0 固定远程组件](prototype/dist/0.12.0/lorestate-script.json) | 当前稳定版 | 固定引用 `@0.12.0/artifact/bundle.js`；不随 `main` 变化 |
| [main 远程组件](prototype/dist/main/lorestate-script.json) | 开发版 | 固定引用 `@main/artifact/bundle.js`；会随 `main` 更新 |
| [main 脚本代码](artifact/bundle.js) | 开发版生成物 | 由 `prototype/` 源码构建，不手工维护 |
| `0.10.0`～`0.10.2` Git tags | 历史正式版 | 不可移动；固定源码与 bundle，尚无新制式版本目录 |
| `0.10.3` Git tag | 历史兼容快照 | 由原 RC branch 同 SHA 固化；不可移动，不再继续开发 |
| `prototype-v0.x` tags / `prototype/dist/v0.x` | 历史 | 仅用于旧版本复现 |

固定安装使用 `0.12.0`；需要跟随开发时才使用 `@main`。固定版本入口不得引用 `@main`。

```js
import 'https://testingcf.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@0.12.0/artifact/bundle.js';
```

从 **0.11.0 / 0.11.1 → 0.12.0** 无需重制 v2 模板或迁移状态；已有模块配置、聊天与快照可以保留。从更早版本升级时需重新制作并应用 Template API v2 HTML；旧模板原文保留，未换模板时显示升级提示，状态引擎继续运行。跨更旧版本升级到模块结构仍按 0.9.0 指南处理；本版不新增旧数据协议迁移。

目标环境沿用 SillyTavern 1.18.0 / 酒馆助手 4.9.5。自动化验证范围见[验证记录](prototype/verification.md)；自动测试不等于真实 SillyTavern、真实模型与人工游玩验收。

## EJS / 动态世界书（0.12.0）

可选兼容 ST-Prompt-Template：在世界书 EJS 中使用 `lorestate`、`ls`、`lsHas`、`lsRange`、`lsStage` 或 `LoreState.*`，读取本次回放的只读快照。真实路径例如 `entities.P1.fields.好感度`；数字文本可用于区间/阶段判断，不按姓名另建状态。

不内置 EJS、不写状态、不自动改世界书；生成前态、旧楼层、切聊天、回档与历史缺口都有独立边界。**0.12.0 首次提供本功能；旧 0.11.1 标签不包含桥接且不会被改写。真实酒馆与实际模型仍须单独验收。** 安装条件、可复制示例与固定上游证据见 [EJS 指南](docs/EJS动态世界书.md)。

## 开发

Node.js 22+。开发前依次阅读 [AGENTS.md](AGENTS.md)、[版本管理](docs/版本管理.md)、[开发说明](docs/开发说明.md) 和[当前交接](交接文档.md)。

源码在 `prototype/`，运行代码在 `artifact/bundle.js`：

```sh
npm run build
npm run check
npm test
```

`npm run build` 生成 `main` 开发入口。准备新的固定版本时，在创建 tag **之前**传入新的版本号，例如：

```sh
npm run build -- 0.12.1
```

它会生成对应的 `prototype/dist/<version>/`，其中 loader 固定引用同名 tag 的 `artifact/bundle.js`。正式版本只能用不可移动 tag 表示；禁止再创建裸版本号 branch 或 `release-*` 长期分支。

`0.10.0`～`0.10.3` 形成于这套目录规范落地之前，只保留固定 tag 下的源码与 `artifact/bundle.js`，没有 `prototype/dist/<version>/` 导入组件。不要移动旧 tag 或补写其历史；`0.10.4` 是第一个按新规范同时提交固定入口、收据和 bundle 的版本。

## 历史：旧原生扩展

以下说明属于仓库根目录 `src/`、`index.js` 和 `manifest.json` 的旧原生扩展，不是上面的 Tavern Helper 脚本安装流程。根目录 `package.json` / `manifest.json` 中的 **0.2.1** 也是这条旧实现的版本，**不代表当前 Tavern Helper 脚本版本**。旧协议与当前 v3 不混用。

LoreState 是用于 SillyTavern 的通用纯文字状态接口与扩展。吸收 MVU 的增量更新、消息楼层存储和历史事件联动思路，用自然语言保存事实，由程序负责路径校验、原子提交和回放。

旧 `examples/` 示例目录和 `examples/wishnote` 分支已退休，不再作为项目实现或安装入口；历史记录只保留在 Git 历史中。核心没有人物编号、愿望类型或世界观规则，不依赖 MVU、酒馆助手或运行时 CDN。

## 旧原生扩展使用

需要 SillyTavern 1.18.0 或更高版本及 manifest 声明的宿主能力。将本仓库安装为 UI 扩展，刷新后打开角色聊天，点击输入框旁的 **魔法棒 → LoreState**。在“基线设置”中粘贴基线 JSON，预览并确认。

```json
{
  "schemaVersion": 1,
  "profile": {"id": "my-world", "instructions": "记录地点和长期有效的事实。"},
  "data": {"places": {"harbor": {"description": "商会管理的潮汐港"}}}
}
```

`data` 接受对象和非空文字。金额可写“拥有一百枚银币”，不需要数值变量。对象键作为稳定路径；不用数组下标，减少删除引起的编号漂移。`profile.instructions` 是用户定义的领域提示规则，**不是可执行校验器**。当前版本验证结构与操作安全，不自动验证叙事因果、跨记录引用或愿望语义。

模型每轮在正文后输出：

```text
<LoreStatePatch>{"base":"复制注入提示中的标识","ops":[{"op":"replace","path":"/places/harbor/description","value":"居民议会接管的潮汐港"}]}</LoreStatePatch>
```

路径相对于 `data`。支持 `add`、`replace`、`remove`；替换和删除限于文字叶子，删除需要 `reason`。新增对象时父路径必须存在。无变化时 `ops: []`。整批操作全部成功才提交，遗漏字段保持原样。不是完整 JSON Patch 实现，也不执行模型代码。

如需隐藏正文中的更新块，可手动导入 `assets/display-regex.json`；它仅作用于显示侧，原始消息协议仍保留。

## 历史与恢复

- 数据只写 `chatMetadata.lorestate_v1` 和消息 `extra.lorestate_v1`，按当前选中回复回放。
- 删除尾部回退；编辑历史使后续 base 失效，错误轮停止提交和生成。可修正回复或明确忽略该轮。
- 导出备份包含校验和；恢复先预览，再在当前最后一层建立新基线。新基线之前的更新不再重放。
- 完整文字注入上下文；超过 48000 字符停止生成，不静默压缩。暂不提供按需冷档投影。
- 不支持同一回复“继续生成”；使用下一轮或重抽。状态提示里的领域规则应与角色卡和世界书保持一致。
- 宿主保存接口返回不等于磁盘持久化保证；重要节点导出，并刷新核对。

旧 WishNote 扩展使用不同命名空间，相关示例和转换工具已从当前主线退休。主扩展不会自动改写旧数据；仍需处理旧聊天时，请先保留自己的备份，并在独立迁移环境中完成转换。

## 旧原生扩展开发

Node.js 22+，无第三方依赖，无构建步骤。根目录 `manifest.json` 可直接由 SillyTavern 加载。

```sh
npm run check
npm test
```

`src/core.js` 管理事务、验证、回放；`src/host.js` 管理宿主事件与保存；`src/prompt.js` 提供通用协议；`index.js` 提供基线和备份面板。新增领域只需提供基线与规则，不复制内核。

设计来源：[MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)，研究快照 `61010dab47bc3a08a1b626320bf7fc8c9573eca4`。本项目为独立实现。验证范围见 [验证记录](prototype/verification.md)。
