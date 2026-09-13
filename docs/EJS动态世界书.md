# EJS / 动态世界书只读桥接

本功能从固定版本 **0.12.0** 提供，开发基底为 `main / b138ffa2c454a942c48d490217f227c002c4aa80`。**仍未完成真实酒馆与实际模型验收**。旧 `0.11.1` 不包含桥接，tag 不改写；固定 `@0.12.0` 与持续开发的 `@main` 是不同入口。安装及证据见 [0.12.0 发布说明](发布材料/0.12.0-EJS动态世界书.md)。

LoreState 继续负责状态事实与回放；可选的 ST-Prompt-Template 负责执行 EJS；世界书负责根据这些事实输出当前适用的角色行为描述。桥接不创建第二套变量，不同步 `stat_data`，不写世界书或存档。

## 使用前提

1. 保留现有 Tavern Helper / LoreState 配置和正常的 v3 状态；不改 schema、不迁移快照。当前仓库的宿主目标仍为 SillyTavern 1.18.0 / Tavern Helper 4.9.5。
2. 由用户自行安装并启用 **ST-Prompt-Template**，同时开启其“处理生成内容”。本次实现按上游 **1.17.9** 的固定源码合同接入；尚未检测你实际安装的插件版本。
3. 将下面的 EJS 写进参与生成的世界书条目，而不是 LoreState 的 HTML 外观模板。世界书仍需按酒馆的启用、关键词/常驻、预算等规则进入提示词；桥接不会替你激活条目。
4. 动态关系规则不要只放在一次性的 preload / initial-variables 条目中。确认每轮生成都重新处理该条目；不要使用永久改写消息原文的设置测试状态条件。
5. 没有 Prompt Template 时，LoreState 其他功能不依赖它；但不会有人替你执行 EJS。上游扩展关闭时，EJS 可能原样进入提示词。桥接不是 EJS 引擎或安全沙盒。

建议先用合成测试聊天，查看**最终发送的提示词**，不要只凭模型回答判断条件是否生效。

## 先找到真实字段路径

原方案的 `角色.爱丽丝.好感度` 不是 LoreState 的存储结构。真实状态节选如下：

```json
{
  "version": 3,
  "shared": { "地点": "白帆港" },
  "entities": {
    "P1": {
      "id": "P1",
      "type": "角色",
      "name": "爱丽丝",
      "fields": { "好感度": "-63" }
    }
  }
}
```

从控制中心档案/原始状态中找到稳定 ID，例中的 `P1` 要替换为自己卡内的编号。重名或改名不会生成另一套名字映射。公共字段从 `shared` 读取，实体栏目从 `entities.<ID>.fields` 读取；快照保留原有 version、类型、冷热、关联等元数据。

```ejs
当前地点：<%= ls("shared.地点", "未记录") %>
当前好感度：<%= ls("entities.P1.fields.好感度", "未记录") %>
<% if (lsHas("entities.P1.fields.好感度")) { %>
这位角色已经记录了好感度。
<% } %>
```

以上快捷示例假定桥接已就绪；可直接复制的稳健版本见后面的渐进示例。

## API 合同

| 快捷入口 | 同义命名空间入口 | 返回值 / 约定 |
| --- | --- | --- |
| `lorestate` | `LoreState.state` | 一次 context prepare 的深拷贝、深冻结快照；不可用时为冻结的 `{}` |
| `ls(path, fallback?)` | `LoreState.get(...)` | 读原值；缺失或 undefined 返回 fallback，未传则 undefined |
| `lsHas(path)` | `LoreState.has(...)` | 只判断字段存在；0、false、空串和 null 都算存在 |
| `lsRange(path, min, max, options?)` | `LoreState.range(...)` | 默认 `[min,max)`；仅 `{includeMax:true}` 包含上界 |
| `lsStage(path, stages, fallback?)` | `LoreState.stage(...)` | 按数组顺序返回第一个匹配阶段的 name；无匹配返回 fallback |
| — | `LoreState.ready` / `LoreState.reason` | 是否有可靠快照，以及不可用原因；不含聊天正文或错误原文 |

- 路径支持中文点分字符串和字符串/非负整数数组，例如 `["entities", "P1", "fields", "有.点的栏目"]`、`["entities", "P1", "links", 0]`。**不实现完整 Lodash 方括号语法**。
- 只读自有属性；拒绝 `__proto__`、`prototype`、`constructor`，不沿原型链读取。
- `ls` 不转换原值。LoreState 栏目本身是文本，因此 `"-63"` 仍返回字符串；range/stage 在比较时接受有限数字和纯十进制数字文本（可有正负号、小数、指数及首尾空白）。
- 空白、null、布尔值、数组、单位文本“63点”、十六进制、NaN、Infinity 不作为有效数字；range 返回 false，stage 返回 fallback。min/max 必须是有限 number 且 min ≤ max。
- stage 的有效项目为 `{name: "阶段", min: 数字, max: 数字, includeMax?: true}`。非法项目跳过，重叠按首匹配，不自动修正作者区间。
- 不提供 set、patch、commit。通过返回的嵌套对象或数组也不能修改 LoreState；严格模式下尝试写冻结对象会抛错，请勿在模板中赋值。
- 既有同名函数/属性保留并告警，不静默覆盖。优先使用未冲突的 `LoreState.*`；命名空间也冲突时需作者显式解决，不能假定该名字属于本桥接。

## 区间与阶段示例

```ejs
<% if (lsRange("entities.P1.fields.好感度", -100, -50)) { %>
当前关系落在 [-100, -50) 的仇恨区间。
<% } %>

<% const stage = lsStage("entities.P1.fields.好感度", [
  { name: "仇恨", min: -100, max: -50 },
  { name: "厌恶", min: -50, max: 0 },
  { name: "普通", min: 0, max: 30 },
  { name: "友好", min: 30, max: 60 },
  { name: "亲密", min: 60, max: 80 },
  { name: "爱恋", min: 80, max: 100, includeMax: true }
], "未知"); %>
当前关系阶段：<%= stage %>
```

## 可复制：渐进关系世界书

以下规则用三个叠加条件，而不是强迫剧情跳档。区间上界显式包含 -50、-75、-90；-100 是此示例约定的下限。没有可靠状态时不输出任何行为许可。

<!-- ejs-smoke:progressive -->
```ejs
<% if (typeof LoreState !== "undefined" && LoreState?.ready === true) { %>
<% const favorPath = "entities.P1.fields.好感度"; %>
爱丽丝当前好感度：<%= LoreState.get(favorPath, "未记录") %>

<% if (LoreState.range(favorPath, -100, -50, { includeMax: true })) { %>
爱丽丝对{{user}}具有明显敌意。
<% } %>

<% if (LoreState.range(favorPath, -100, -75, { includeMax: true })) { %>
她可能主动寻找让{{user}}利益受损的机会。
<% } %>

<% if (LoreState.range(favorPath, -100, -90, { includeMax: true })) { %>
在符合人物性格、当前剧情与环境条件时，允许考虑严重报复或背叛。
这只是行为可能性，不是必须触发的剧情事件。
<% } %>
<% } %>
```

| 文本状态值 | 应输出的有效内容 |
| --- | --- |
| `"-30"` | 仅当前好感度 |
| `"-60"` | 加上基础敌意 |
| `"-80"` | 再加主动敌对的可能性 |
| `"-95"` | 再加有前提的严重剧情许可 |

`{{user}}` 的替换属于酒馆/Prompt Template 原有处理，不由桥接自行实现。注意本次固定版本的 [Prompt Template escaper](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/function/ejs.ts#L631-L634) 直接返回原文：**即使使用 `<%=`，也不能假定会做 HTML 转义**。本例用于提示词纯文本；不要把状态文本当作可信 HTML 注入页面。

## 状态与时序边界

- 每次 prepare 从维护线的 `getResult → replaySnapshots → replayState` 获取可靠结果，随后 clone/freeze 一次。所有 helper 共用该快照，不在每次调用时回放；不读取 `chat.current` 作为权威缓存。
- 普通生成与 preparation 读取当前选中分支；编辑、删除、隐藏和 swipe 的变化无需等 UI 刷新即可参与下一次回放。隐藏楼层仍属于状态历史。
- `swipe / regenerate / continue` 的生成上下文读取目标回复开始前的状态，和 LoreState 原生成提示相同。以优先的 `GENERATION_AFTER_COMMANDS` 监听固定目标楼层；宿主后来删除原回复时不再多排除一层。这里只记临时生成边界，不保存另一份状态。
- 缺少上述边界、未识别的 append/appendFinal 原地生成、或边界读取失败时返回 `generation-untracked`，不猜测前态。普通 helper 请求的独立时序不等于核心正文生成，需在目标环境单独验收。
- `runType=render` 使用 `message_id` 对历史截断，不把未来状态灌进旧楼层；指定 swipe 与当前分支不符时为空。旧楼层跨越回档保留区无法通过现有 checkpoint 校验时，同样不给不可靠快照。
- 初始档案通过原有 authorPolicy/initialResult 生效；没有初始档案和首个有效更新块时为空。
- 有任何历史缺口（errors/tainted）、失效 checkpoint 或未完成续写时，不把最后一次好状态冒充当前事实。桥接隔离读取异常；**原有 LoreState 生成前校验仍可停止不安全的正文生成**。
- 独立状态更新或外观生成任务忙碌时为空，避免把处理中状态用于新的条件判断。
- 聊天 ID 或聊天对象已变、旧脚本尚未重载的窗口返回空态（同名聊天也检查对象身份）；新 runtime 只读取新聊天。关闭/替换 runtime 会显式移除桥接和生成边界监听。
- 快照包含原生冷档，但 EJS 读取**不发放冷档更新凭据，也不唤醒实体**。冷档写入仍遵守原来的按需读取与 read receipt 协议。

### 空态诊断

优先检查 `typeof LoreState` 与 `LoreState.ready`，不要只看某个值是否为真。直接访问空态的 `lorestate.entities.P1` 仍是普通 JavaScript 错误；未就绪时使用 helper / ready 守卫。

| reason | 含义 |
| --- | --- |
| `ready` | 可靠的本次快照 |
| `inactive` | 当前聊天未启用或脚本未配置 |
| `uninitialized` | 没有可用初始化状态 |
| `history-gap` | 回放存在失败楼层 |
| `read-error` | 回档/续写/读取/克隆校验失败；不返回错误原文 |
| `chat-changed` | 旧 runtime 或 context 不属于当前聊天 |
| `generation-untracked` | 无法确认原地生成的前态边界 |
| `floor-unavailable` / `branch-mismatch` | 楼层或指定回复分支不能用于本次读取 |
| `busy` | 状态/外观任务忙碌，或遇到重入 |

不提供自动修复、自动安装或自动改世界书。若出现命名冲突，检查控制台的 `[LoreState/EJS]` 名称提示；桥接日志不输出状态、聊天原文、密钥或异常原文。

## 依赖与固定源码证据

| 依赖 | 提供方式 | 本次证据边界 |
| --- | --- |
| SillyTavern | 宿主提供 | 仓库目标 1.18.0；下面的固定源码验证事件与删楼顺序 |
| Tavern Helper | 已有宿主扩展 | 目标 4.9.5；使用 eventOn、eventMakeFirst、eventRemoveListener |
| LoreState | 原 Tavern Helper 远程脚本 | 维护源经原 build 生成 bundle；不增加旁路 loader |
| ST-Prompt-Template | **可选宿主扩展**，用户启用 | 固定源码 1.17.9；由其提供 EJS，不由 LoreState 远程安装 |
| EJS 引擎 smoke | 仅开发验证 | 校验固定上游内容 hash 后，在内存中执行合成模板；不进入 bundle |
| MagVarUpdate | 仅设计参考 | 不是运行依赖，不读取/同步 stat_data |

- **ST-Prompt-Template**：`d6f520d149aba146305b0b781ddd691d449c28d2`。
  - [prepareContext / prompt_template_prepare](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/function/ejs.ts#L211-L318)：异步 emit 可变 context 后返回；导出的 helper 因此对本次 EJS 可见。
  - [上下文和生成/渲染调用点](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/modules/handler.ts)：generateType、runType、message_id / swipe_id 与多个 prepare 阶段。
  - [模板执行与世界书求值](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/utils/evaluate.ts)；[设置说明](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/docs/features_cn.md)。
- **Tavern Helper 4.9.5**：`af21bee2aadef5bf384f618e3456ff15ba9c431d`。
  - [事件实现](https://github.com/N0VI028/JS-Slash-Runner/blob/af21bee2aadef5bf384f618e3456ff15ba9c431d/src/function/event.ts#L23-L143)与[声明](https://github.com/N0VI028/JS-Slash-Runner/blob/af21bee2aadef5bf384f618e3456ff15ba9c431d/%40types/iframe/event.d.ts)：自定义字符串事件、直接透传 context、优先注册和按原回调移除。清理显式使用 eventRemoveListener，不依赖 stop 返回包装的细节。
- **SillyTavern 1.18.0**：`51ad27fb86d39a3daca3adaa970375c9670c12df`。
  - [GENERATION_AFTER_COMMANDS](https://github.com/SillyTavern/SillyTavern/blob/51ad27fb86d39a3daca3adaa970375c9670c12df/public/script.js#L4240-L4262)先于[regenerate 删除目标消息](https://github.com/SillyTavern/SillyTavern/blob/51ad27fb86d39a3daca3adaa970375c9670c12df/public/script.js#L4337-L4353)。
- **MagVarUpdate 设计参考**：`dd4f1d92b450dc7eaa1b43e23b6e3fb832c909d1` 的[分阶段示例](https://github.com/MagicalAstrogy/MagVarUpdate/blob/dd4f1d92b450dc7eaa1b43e23b6e3fb832c909d1/example/%E7%90%86%E7%90%86/%E5%8F%98%E9%87%8F%E5%88%86%E9%98%B6%E6%AE%B5-%E5%A5%BD%E6%84%9F%E5%BA%A6.md)使用 EJS 读取 stat_data。这里只借鉴“状态事实 → 条件文本”，不复制其状态结构、角色内容或代码。

这些是**固定源码证据 + 本地模拟回归**，不是对任意版本/你已安装版本的真实宿主兼容认证。关键事实的源码置信度高；跨插件安装顺序、实际生成时序与最终提示词仍须实测。

## 开发验证与交付

```sh
npm run build
npm run check
npm test
node scripts/test-browser.mjs
node scripts/test-ejs.mjs
```

最后一项是可复现的可选网络 smoke：只取上述固定 ref 的 EJS 3.1.9 引擎，校验 SHA-256，在临时内存环境执行本文渐进示例（包括禁用 with 的上下文模式）。它不安装 npm 包、不写入上游源码，不代替完整 Prompt Template 扩展或酒馆验收。Windows 若 npm.ps1 包装器报错，可用 npm.cmd 运行同一 npm 脚本。

变更入口：`prototype/ejs-bridge.js`、`prototype/runtime.js`；开发构建只生成 `artifact/bundle.js` 与 `prototype/dist/main/` 的 loader/receipt。本次固定发布另生成 `prototype/dist/0.12.0/lorestate-script.json` 与 `receipt.json`，且只引用 `@0.12.0/artifact/bundle.js`。main loader 仍只引用 `@main/artifact/bundle.js`，没有诊断 loader、离线版或无版本根入口。receipt 的 optionalRuntimeDependencies 是取证版本，不是已检测安装版本；realHostVerified 仍为 false。

固定 `0.11.1` 的 runtime blob 为 `3e1133d39ae1c5cbe0cbb6e2c44949faceeb4421`，bundle blob 为 `ab46519f7cde1272f4496009868208198928570c`，与本次基底一致且无 prompt_template_prepare/bridge。旧 tag 与固定目录不改写。

自动化与发布证据见[验证记录](../prototype/verification.md)。只发布本次维护源、文档和生成物；用户原有的根交接文档本地删除不纳入发布提交。

### 下一验收门：真实酒馆

1. 确认当前实际加载的 LoreState ref/commit、SillyTavern、Tavern Helper 和 Prompt Template 版本。Git main 与 0.12.0 tag 的发布不代表已安装/刷新到当前酒馆；真实宿主导入和配置仍需用户授权。
2. 在合成聊天中准备合法初始状态，启用该世界书与 Prompt Template 生成处理；确认就绪、字段路径与是否存在同名冲突。
3. 分别用 -30/-60/-80/-95 生成并检查最终提示词，确认只出现相应层级；再测 0、-50、100、缺字段与非数字。
4. 真实执行新回复、swipe、重生成、续写、编辑/删除、隐藏、回档、切聊天与脚本重载；确认前态不混入目标回复、旧楼层不读取未来数据。
5. 按你启用的 Prompt Template 沙盒、编译 worker、世界书预加载、其他扩展顺序再验收；核对默认未启用插件时 LoreState 仍可用。
6. 确认聊天变量、read receipt 与快照未因 EJS 读取被改写，且模板不包含写状态操作。真实模型、手机、完整沙盒组合与人工游玩本轮均未测。

### 指南路由回执

主工程路由 `sillytavern-api-reference`；写入门槛 ST-A0 已明确目标/红线/验收。知识库快照 `2026-08-18`，按需查阅 ST-A0、ST-A5（阶段与宏边界）、ST-B1（变量作用域）；不采用设计/动效候选。上述指南仅作导航，敏感 API 以列出的固定上游源码为依据。无新运行依赖安装，无 MVU/同层数据库方案；下一门是用户授权下的真实宿主验证，而非自动标记人工通过。
