# EJS / 动态世界书只读桥接 · 当前 0.13.0

EJS 只读桥接从固定版 **`0.12.0`** 首次提供；当前固定稳定版 **`0.13.0`** 继续兼容同一接口。正常安装请使用 `0.13.0`，不要因为功能首发于 0.12.0/0.12.1 就回退旧标签。

LoreState 保存并回放状态；可选的 **ST-Prompt-Template** 执行 EJS；世界书根据当前 LoreState 状态决定本轮输出哪些文字。

桥接不会：内置 EJS、创建第二套变量系统、同步 `stat_data`、写 LoreState 状态、自动修改/激活世界书、绕过冷档读取与状态校验。

## 使用前提

1. LoreState 已正常配置并能回放 v3 状态。
2. 用户自行安装并启用 ST-Prompt-Template，并开启其生成内容处理。
3. EJS 写在**每轮实际参与生成**的世界书条目里，不是 LoreState HTML 模板。
4. 世界书常驻/关键词触发、预算和顺序仍由 SillyTavern / Prompt Template 决定。
5. 需要每轮变化的条件必须每轮参与模板处理，不要只放一次性 preload/initial variables。

没有 Prompt Template 时，LoreState 普通状态、外观、快照和诊断仍可使用，但没有扩展负责执行 EJS。

## 真实字段路径

LoreState 使用稳定实体 ID，不按角色名字另建变量：

```json
{
  "version": 3,
  "shared": {"地点": "白帆港"},
  "entities": {
    "P1": {
      "id": "P1",
      "type": "人物",
      "name": "爱丽丝",
      "fields": {"好感度": "-63"}
    }
  }
}
```

路径：公共字段 `shared.地点`；实体字段 `entities.P1.fields.好感度`。

## 快捷 API

| 快捷入口 | 命名空间入口 | 行为 |
| --- | --- | --- |
| `lorestate` | `LoreState.state` | 本次 prepare 的深拷贝、深冻结快照；不可用时为空对象 |
| `ls(path, fallback?)` | `LoreState.get(...)` | 读原值；缺失返回 fallback/undefined |
| `lsHas(path)` | `LoreState.has(...)` | 判断字段是否存在 |
| `lsRange(path,min,max,options?)` | `LoreState.range(...)` | 默认 `[min,max)`；`includeMax:true` 可含上界 |
| `lsStage(path,stages,fallback?)` | `LoreState.stage(...)` | 按数组顺序返回第一个匹配阶段名 |
| — | `LoreState.ready` | 当前是否有可靠快照 |
| — | `LoreState.reason` | 不可用原因 |

路径可用点分字符串或字符串/非负整数数组。`__proto__`、`prototype`、`constructor` 等危险路径会被拒绝。

## 最小示例

```ejs
<% if (typeof LoreState !== "undefined" && LoreState.ready) { %>
当前地点：<%= LoreState.get("shared.地点", "未记录") %>
当前好感度：<%= LoreState.get("entities.P1.fields.好感度", "未记录") %>
<% } %>
```

## 数值区间

LoreState 字段仍是文字；`ls()` 原样返回例如 `"-63"`。`range/stage` 比较时接受有限 number 或纯数字文本。

```ejs
<% if (lsRange("entities.P1.fields.好感度", -100, -50)) { %>
当前关系处于明显敌对区间。
<% } %>
```

包含上界：

```ejs
<% if (lsRange("entities.P1.fields.好感度", -100, -50, { includeMax: true })) { %>
当前关系位于 [-100, -50]。
<% } %>
```

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

重叠时按数组顺序匹配第一个有效阶段。LoreState 不自动纠正作者的区间设计。

## 推荐：规则渐进叠加

不要把阈值直接写成“到 80 必须发生某剧情”。更稳的做法是随区间逐步开放行为倾向/许可，把具体剧情仍交给人物性格、场景和当前正文决定。

## 只读与回放保证

桥接没有 `set`、`patch`、`commit`。状态经过深冻结；EJS 读取冷档也不会发放新的 LoreState 写入凭据。

桥接以 LoreState 现有可靠回放为唯一事实源：普通生成使用当前选中分支状态；swipe/regenerate/continue 尽量使用目标回复开始前状态；旧楼层按对应楼层/分支截断；历史缺口、聊天切换、无法确认生成边界或任务重入时宁可返回空态，也不把缓存旧状态冒充当前事实。

常见 `LoreState.reason`：`ready`、`inactive`、`uninitialized`、`history-gap`、`read-error`、`chat-changed`、`generation-untracked`、`floor-unavailable`、`branch-mismatch`、`busy`。

## 名称冲突与安全

桥接不会静默覆盖同名函数/属性。短名冲突时优先使用 `LoreState.*`。

Prompt Template 的 EJS 执行属于该扩展自己的能力，不是 LoreState HTML sandbox。不要把状态文字视为可信 HTML。

## 升级边界

- `0.11.1` 及更早：没有 EJS 桥接。
- `0.12.0`：首次提供桥接。
- `0.12.1` / `0.12.2` / `0.12.3`：保持桥接接口兼容。
- `0.12.0 → 0.12.3` 不需要迁移 v3 状态、快照或合法 v2 外观。

首发证据见 [0.12.0 发布说明](发布材料/0.12.0-EJS动态世界书.md)；当前稳定版改动见 [0.13.0 发布说明](发布材料/0.13.0-更新核对与随卡导出.md)。

实机至少测试 ready、真实实体 ID、区间边界、缺字段、新回复、swipe、重生成、续写、编辑/删除、隐藏、回档、切聊天与脚本重载。自动化/模拟宿主通过不等于用户实际 Prompt Template 版本和扩展组合已经验收。
