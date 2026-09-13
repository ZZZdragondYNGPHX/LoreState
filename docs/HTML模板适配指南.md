# LoreState Template API v2：作者接口

> 本文对应 `0.11.0` 与后续 `main` 的 Template API v2。旧 `0.10.6` 标签保留原有模板行为；本次完整 UI 的真实 SillyTavern、真实模型及人工验收仍待完成。

Template API v2 将「存什么」和「怎么显示」分开：**模块条目定义 DataSchema，HTML 只选择展示字段和布局**。人物、物品、事件、国家可各自排版；字段可以省略、重复，整类也可以不显示。

这是一项模板破坏性变更：只接受 `<html data-lore-template="2">` 完整文档。旧 `data-lore-person/entity/module` 不执行、不转换；旧 HTML 与预设原文留在原位，可以在设置里复制。**XML 仍为 v3，config.version 仍为 4，已有状态/schema/快照不迁移、不清空。**

## 先试两套外观

两份示例共用同一个[模块条目](../prototype/module-example.txt)，无需改字段或重建存档：

- [旅途档案 HUD](../prototype/example.html)：深色多区域界面，人物卡、紧凑物品、事件与世界动向分开。
- [紧凑日志](../prototype/module-example.html)：浅色日志布局，展示同一份状态，适合偏文字的卡。

在设置选择模块条目 → 生成并复制 HTML 制作提示词 → 粘贴 HTML → 预览 → 保存。已有配置可另存、覆盖或应用样式预设；仅换布局不会触发数据 schema 变更保护。预览明确区分当前聊天状态与合成数据，不写配置、不安装正则、不请求模型。

## 可直接运行的最小多区域模板

下面配套上述模块条目：公共字段为「地点、时间」，人物字段为「身体状况、当前目标」，物品为「持有者、完好状况」，事件为「事项、进展」，国家为「政局、外交」。示例故意只显示部分字段。

```html
<!doctype html>
<html lang="zh-CN" data-lore-template="2">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--accent:#e1c185;--surface:#202e37}
body{margin:0;padding:16px;background:#11191f;color:#eaf0ef;font:1rem/1.6 system-ui}
h1{font-size:1.4rem}h2{font-size:1rem;color:var(--accent)}
main{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
section,article{min-width:0}article{padding:12px;background:var(--surface);margin:8px 0;border-radius:10px}
p,span,h3{overflow-wrap:anywhere}summary{min-height:44px;cursor:pointer}
summary:focus,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media(min-width:640px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){*{animation:none;transition:none}}
</style>
</head>
<body>
<header><h1>旅途状态</h1><p data-lore-shared="地点"></p><p data-lore-shared="时间"></p></header>
<main>
<section>
  <h2>在场人物 · <span data-lore-count="人物"></span></h2>
  <p data-lore-empty="人物">暂无在场人物</p>
  <article data-lore-each="人物"><h3 data-lore-name></h3><p data-lore-field="身体状况"></p></article>
</section>
<section>
  <h2>物品</h2><p data-lore-empty="物品">暂无物品</p>
  <article data-lore-each="物品"><h3 data-lore-name></h3><p data-lore-field="持有者"></p></article>
</section>
<section>
  <h2>事件</h2><p data-lore-empty="事件">暂无事件</p>
  <article data-lore-each="事件"><h3 data-lore-name></h3><p data-lore-field="进展"></p></article>
</section>
<section>
  <h2>世界</h2><p data-lore-empty="国家">暂无世界动向</p>
  <article data-lore-each="国家"><h3 data-lore-name></h3><p data-lore-field="外交"></p></article>
</section>
</main>
<details>
  <summary>人物冷档 · <span data-lore-count="人物" data-lore-presence="cold"></span></summary>
  <p>最多显示 5 项；完整档案请看历史与诊断。</p>
  <p data-lore-empty="人物" data-lore-presence="cold">暂无封存人物</p>
  <article data-lore-each="人物" data-lore-presence="cold" data-lore-limit="5"><b data-lore-name></b><p data-lore-identity></p></article>
</details>
</body>
</html>
```

## 查询与文字绑定

| 属性 | 位置与含义 |
| --- | --- |
| `data-lore-each="人物"` | 复制本元素；类型精确匹配已声明模块；可有同类多个区域 |
| `data-lore-presence="cold"` | each/count/empty 的修饰符；填写三者之一，默认 active；all 只联合 active 与 cold |
| `data-lore-select-id="P01"` | 可选精确 ID 过滤；仅在作者明确知道该实体编号时使用 |
| `data-lore-limit="5"` | 仅 each；1–100 的十进制整数，不带前导零；省略不作业务截断 |
| `data-lore-field="身体状况"` | each 内读取该实体所属模块字段；可重复、可省略其他字段 |
| `data-lore-shared="时间"` | 显式读取公共值；each 内外均可，与同名实体字段互不覆盖 |
| `data-lore-name/id/type/identity/confirmed` | 分别为五个独立属性；each 内显示名称/编号/类别/识别信息/最后确认时间；属性值为空 |
| `data-lore-count="人物"` | each 外的独立文字节点；显示完整查询数量，不受其他区域 limit 影响 |
| `data-lore-empty="人物"` | each 外的静态容器；同条件查询为零时保留，否则删除；内部不放查询或绑定 |


### 作用域与查询顺序

- 绑定节点只有文字，没有子元素；每个节点只使用一种输出绑定，不与 each/empty 同节点。标题与装饰放在外围。
- each/count/empty 不嵌套；未知 `data-lore-*`、孤立修饰符、未知类别或字段都会报错。诊断包含区域、类型与字段。
- 查询依次按类型、presence、可选 ID 过滤，维持 `state.entities` 的输入遍历顺序，each 最后应用 limit。count/empty 不受其他 each 的 limit 影响。
- `limit="1"` 不识别玩家，`limit="5"` 不表示最近任务。本期不排序、不推断身份、不执行表达式。
- 缺失/null 显示“尚未记录”；空串保留；有限数字/布尔显示文字；数组、对象、非有限数字显示“数据格式异常”，并生成不含原值的诊断。

## 样式、交互与预算

作者控制模板内的页面结构、CSS token、各类布局、原生折叠和冷档位置。宿主仍拥有尾部可信状态提示、历史诊断入口和展开窗口。冷档不再自动附加在 iframe 外。

- 静态标签白名单允许常用语义容器、标题、文字、列表、表格和 details/summary。元数据、文本均通过 `textContent` 绑定，不执行状态里的 HTML。
- 禁止脚本、事件属性、iframe、SVG、表单、URL 资源属性、图片、外链字体、contenteditable 与作者 http-equiv。META 只接受 UTF-8 charset 和 `width=device-width, initial-scale=1`。
- 样式先经过词法门，再检查浏览器 CSSOM 的规则及声明；CSS 转义、`@import`、`url()`、`image-set()`、`attr()`、执行型属性、未知函数/规则拒绝。符号直接使用 Unicode，避免转义式图标。
- CSS at-rule 开放 media、supports、keyframes、container、layer；容器内规则同样检查。常用函数开放 var/calc/min/max/clamp、minmax/repeat/fit-content、颜色函数、渐变、CSS 变换、cubic-bezier/steps，以及常用选择器函数。具体白名单见维护源 `prototype/template.js` 的 `V2_CSS_FUNCTIONS`。不支持的函数会明确报错。
- 重复区域不放 id、for 或 ARIA IDREF。静态 id 必须唯一；静态引用目标必须存在且不在重复区域。重复区可用 class、语义标签和静态 aria-label。
- 最终 iframe 保持 `sandbox=""`；renderer 注入 CSP：`default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`。不添加模板脚本或 postMessage 通道。

| 预算 | 上限 |
| --- | --- |
| HTML 原文 | 100000 字符（JavaScript 字符串长度） |
| 原始 DOM | 5000 元素 |
| each 区域 | 32 |
| 所有区域合计克隆 | 500 |
| 最终 DOM | 30000 元素 |
| 最终序列化 HTML | 2000000 字符，含转义后的文字和注入外壳 |

渲染逐批检查预算，超额显示可定位错误，不静默裁剪存档。大冷档建议设置 limit，同时展示完整 count；完整数据仍在“查看历史与诊断”。

建议 320px 单列、宽屏再分栏，所有收缩子项 `min-width:0`；长 CJK、无空格文本可折行。检查 200% 字体缩放、可见键盘焦点、44px 折叠热区、reduced-motion，避免仅用颜色表达状态。

本期沿用固定高度的尾部 iframe 与展开外壳，内容较多时内部滚动。新状态导致 srcdoc 更新时，details/滚动位置可能重置；同楼层、相同状态与模板不重绘。数值条、任意属性绑定、tabs、自定义排序、外部图片及自动测高均不属于本版。

## 旧模板与错误恢复

旧 HTML 不运行，也不被默认模板覆盖。在设置的 HTML 编辑区可复制当前原文；“查看所选预设原文”可读取其他预设，包括旧版模板。重新制作 v2 后预览并保存，或应用已有合法 v2 预设，即可恢复展示。

非法预览、另存、覆盖、应用或启用均在写配置之前校验。旧模板与其他模板错误仅阻止该 HUD；状态更新、full/delta、冷档读取、快照和诊断继续运行。尾部保留错误说明与“打开模板设置”，有状态缺口时仍显示宿主可信提示。

旧 `config.schema` 是存档的数据合同，不删除。真实模块字段变化仍受原有保护；只隐藏字段、重复字段或改变布局不会改 schema。样式预设只保存 id/name/html，不复制策略、聊天起点、回档或 API 绑定。

## 开发者调用

```js
const dataSchema = moduleShape(parseModules(moduleRules));
const plan = validateTemplateV2(html, dataSchema); // 只读 TemplatePlan，不是 DataSchema
const diagnostics = [];
const srcdoc = renderTemplateV2(html, state, dataSchema, DOMParser, diagnostics);
```

`inspectTemplateV2(html, Parser)` 返回解析文档、查询/绑定定位和只读计划；`validateTemplateV2` 额外检查数据字段引用。`selectEntities(state, {type, presence, selectId, limit})` 是纯查询函数。render 始终走同一校验链，既不改变 state/schema，也不复用已变异的 DOM。

## 可复用的网页 AI 请求

```text
请根据我附上的 LoreState 模块条目制作 Template API v2 完整 HTML。
模块定义存储字段，模板仅选展示；允许部分字段、重复字段和同类多个区域。
人物、物品、事件、国家分区；公共值用 data-lore-shared，实体值在 data-lore-each 内用 data-lore-field。
使用 data-lore-template="2"，提供 count/empty 和受限的冷档区域。不要猜玩家 ID 或用 limit 冒充排序。
采用静态 HTML/CSS 与 details/summary，无脚本、外链、图片、CSS url/import/转义或任意属性绑定。
320px 单列，宽屏分栏，长文字可折行，支持放大字体、焦点与 reduced-motion。
HTML 只制作一次；状态模型每轮仍只输出 XML v3。只返回完整 HTML。
```

设置中的“生成并复制 HTML 制作提示词”会自动附上实际 DataSchema、完整接口规则与可运行的部分字段示例，优先使用该入口。

[模块条目](0.9.0模块条目与试卡.md) · [开发说明](开发说明.md) · [作者文档目录](README.md)
