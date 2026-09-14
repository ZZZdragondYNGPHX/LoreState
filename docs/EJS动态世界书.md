# EJS / 动态世界书只读桥接 · 当前 0.12.1

EJS 只读桥接从固定版本 **`0.12.0`** 首次提供；当前固定稳定版 **`0.12.1`** 继续兼容同一接口，并额外修复首次条目绑定/HTML 制作流程。正常安装请使用 `0.12.1`；`0.12.0` 发布说明保留为本功能的首发证据。

LoreState 负责保存与回放状态事实；可选的 **ST-Prompt-Template** 负责执行 EJS；世界书根据状态决定本轮输出什么文字。桥接：

- 不内置 EJS；
- 不创建第二套变量系统；
- 不同步 `stat_data`；
- 不写 LoreState 状态；
- 不自动修改或激活世界书；
- 不绕过冷热档读取凭据和原状态校验。

当前固定安装：

```js
import 'https://testingcf.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@0.12.1/artifact/bundle.js';
```

开发入口仍为 `@main`。不要同时启用固定版和 main。

## 使用前提

1. LoreState 已正常配置并能回放 v3 状态。
2. 用户自行安装并启用 **ST-Prompt-Template**，同时开启其“处理生成内容”。LoreState 不替你安装 Prompt Template。
3. 将 EJS 写进**每轮会参与生成**的世界书条目，而不是 LoreState 的 HTML 外观模板。
4. 世界书是否常驻/关键词触发、预算、顺序等仍由 SillyTavern / Prompt Template 处理；LoreState 不替你启用条目。
5. 动态条件不要只放在一次性的 preload / initial variables 中；需要每轮重新求值的规则必须每轮参与模板处理。

没有 Prompt Template 时，LoreState 的普通状态、外观、快照和诊断仍可使用；但不会有人执行 EJS，模板文字可能原样进入提示词。

## 真实字段路径

LoreState 不按角色名字重建变量表。实体使用稳定 ID：

```json
{
  "version": 3,
  "shared": {
    "地点": "白帆港"
  },
  "entities": {
    "P1": {
      "id": "P1",
      "type": "人物",
      "name": "爱丽丝",
      "fields": {
        "好感度": "-63"
      }
    }
  }
}
```

因此路径是：

- 公共字段：`shared.地点`
- 实体字段：`entities.P1.fields.好感度`

`P1` 要替换成你卡中真实、稳定的实体 ID。重名或改名不会自动生成另一套名字路径。

## 快捷 API

| 快捷入口 | 命名空间入口 | 行为 |
| --- | --- | --- |
| `lorestate` | `LoreState.state` | 本次 prepare 的深拷贝、深冻结快照；不可用时为空对象 |
| `ls(path, fallback?)` | `LoreState.get(...)` | 读取原值；缺失返回 fallback / undefined |
| `lsHas(path)` | `LoreState.has(...)` | 判断字段是否存在；0、false、空串、null 都算存在 |
| `lsRange(path,min,max,options?)` | `LoreState.range(...)` | 默认 `[min,max)`；`{includeMax:true}` 包含上界 |
| `lsStage(path,stages,fallback?)` | `LoreState.stage(...)` | 按数组顺序返回第一个匹配阶段名 |
| — | `LoreState.ready` | 当前是否有可靠快照 |
| — | `LoreState.reason` | 不可用原因，不含聊天正文/状态原文 |

路径可用点分字符串，也可用字符串/非负整数数组。为了防止原型链访问，`__proto__`、`prototype`、`constructor` 等危险路径会被拒绝。

## 最小示例

```ejs
<% if (typeof LoreState !== "undefined" && LoreState.ready) { %>
当前地点：<%= LoreState.get("shared.地点", "未记录") %>
当前好感度：<%= LoreState.get("entities.P1.fields.好感度", "未记录") %>
<% } %>
```

使用快捷函数：

```ejs
当前地点：<%= ls("shared.地点", "未记录") %>
<% if (lsHas("entities.P1.fields.好感度")) { %>
已记录该角色好感度。
<% } %>
```

## 数值区间

LoreState 字段仍是文字；`ls()` 会原样返回例如 `"-63"`。`range/stage` 在比较时接受有限 number 或纯数字文本，包括正负号、小数和指数写法。

空白值、布尔值、数组、对象、`63点`、十六进制、NaN、Infinity 等不当作有效数字。

```ejs
<% if (lsRange("entities.P1.fields.好感度", -100, -50)) { %>
当前关系位于 [-100, -50) 的敌对区间。
<% } %>
```

包含上界：

```ejs
<% if (lsRange("entities.P1.fields.好感度", -100, -50, { includeMax: true })) { %>
好感度位于 [-100, -50]。
<% } %>
```

`min` / `max` 必须是有限 number，并且 `min <= max`。

## 阶段映射

```ejs
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

stage 按数组顺序匹配；重叠时第一个有效阶段优先。非法阶段项跳过，不自动纠正作者的区间设计。

## 推荐：渐进叠加而不是硬跳剧情

下面的写法会随关系恶化逐层增加可用行为规则，而不是强迫模型一到阈值就执行某个剧情：

```ejs
<% if (typeof LoreState !== "undefined" && LoreState.ready === true) { %>
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

预期：

| 状态值 | 规则层级 |
| --- | --- |
| `-30` | 只输出当前好感度 |
| `-60` | 增加基础敌意 |
| `-80` | 再增加主动敌对可能性 |
| `-95` | 再增加有前提的严重剧情许可 |

这种写法更适合角色关系，因为 LoreState 提供的是事实/阶段，是否发生具体剧情仍应结合人物性格、场景和当前叙事。

## 只读保证

桥接没有 `set`、`patch` 或 `commit`。返回状态经过深冻结；模板不应尝试赋值修改。严格模式下写冻结对象可能直接抛错。

EJS 读取冷档也**不会**发放新的 LoreState 写入凭据、不会自动唤醒实体。世界书能“看到”某个快照不等于该实体已经获得本轮冷档写权限。

## 生成前态与回放

桥接读取 LoreState 现有回放结果，不把缓存当作权威事实：

- 普通生成：使用当前选中分支的可靠状态；
- swipe / regenerate / continue：尽量使用目标回复开始前的状态，与 LoreState 正文生成提示保持一致；
- 渲染旧楼层：按对应 message/swipe 截断，不把未来状态灌进过去；
- 编辑、删除、切分支、回档等会重新经过原历史校验；
- 有历史缺口、失效 checkpoint、未完成续写或无法确认生成边界时，宁可返回空态，也不把旧好状态冒充当前事实；
- 状态更新/外观生成任务忙碌时可返回空态，避免重入。

## 空态诊断

优先这样守卫：

```ejs
<% if (typeof LoreState !== "undefined" && LoreState.ready === true) { %>
  ...动态规则...
<% } %>
```

常见 `LoreState.reason`：

| reason | 含义 |
| --- | --- |
| `ready` | 本次快照可靠 |
| `inactive` | 当前聊天未启用或脚本未配置 |
| `uninitialized` | 尚无可用初始化状态 |
| `history-gap` | 回放存在失败楼层 |
| `read-error` | 读取/克隆/回档等校验失败 |
| `chat-changed` | runtime/context 已不属于当前聊天 |
| `generation-untracked` | 无法确认原地生成的前态边界 |
| `floor-unavailable` / `branch-mismatch` | 指定楼层/回复分支不可用于本次读取 |
| `busy` | 状态或外观任务忙碌/重入 |

不要在 `ready=false` 时直接访问 `lorestate.entities.P1` 这类深层属性；优先使用 helper 或 ready 守卫。

## 名称冲突

桥接不会静默覆盖已有同名函数/属性。若其他扩展已经占用 `ls` 等短名称，优先使用 `LoreState.*`；如果连 `LoreState` 命名空间也冲突，需要作者显式解决扩展冲突。

## 安全提醒

Prompt Template 的 EJS 执行属于该扩展自己的能力，不是 LoreState 的 HTML sandbox。不要把 LoreState 状态文字视为可信 HTML。

桥接首发实现参考的 ST-Prompt-Template 固定源码版本为 1.17.9；这只是版本化实现证据，不代表自动检测了你当前安装的插件版本。跨扩展顺序、sandbox/worker 组合与实际最终提示词仍应在真实环境验证。

## 升级边界

- `0.11.1` 及更早固定标签没有 EJS 桥接。
- `0.12.0` 首次提供桥接。
- `0.12.1` 保持桥接接口兼容，并成为当前固定安装入口。
- 从 `0.12.0 → 0.12.1` 不迁移 v3 状态、快照或 v2 外观。

桥接首发的固定源码、测试数量、上游证据和发布边界见 [0.12.0 发布说明](发布材料/0.12.0-EJS动态世界书.md)；当前固定版的条目绑定修复见 [0.12.1 发布说明](发布材料/0.12.1-条目绑定修复.md)。

## 实机验收建议

至少检查：

1. 当前实际加载的是 `0.12.1` 还是 `main`；
2. Prompt Template 已启用生成内容处理；
3. `LoreState.ready` 为 true，字段路径和实体 ID 正确；
4. 用 -30 / -60 / -80 / -95 检查最终提示词只出现应有规则；
5. 再测边界值、缺字段、非数字；
6. 测新回复、swipe、重生成、续写、编辑/删除、隐藏、回档、切聊天与脚本重载；
7. 确认 EJS 读取没有修改 LoreState 状态、冷热、read receipt 或快照。

自动化/模拟宿主通过不等于真实 SillyTavern、实际模型和你安装的 Prompt Template 组合已经验收。