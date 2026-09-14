# LoreState Template API v2 · 当前作者接口

Template API v2 从 `0.11.0` 引入；`0.11.1` 增加条件显隐、class 映射和外观制作台；当前固定版 **`0.12.1`** 继续兼容现有 v2 模板，并修复首次条目绑定与首次 HTML 制作流程。

Template API v2 的核心原则是：**模块条目定义“存什么”，HTML 只定义“怎么显示”。** 人物、物品、国家、事件等模块可以拥有不同字段；模板可以只显示部分字段、重复字段、同类多个区域或冷档区域，而不会改变 DataSchema。

旧 `0.10.6` 及更早模板不自动转换。旧 HTML/预设原文会保留，但当前展示层要求完整 v2 文档。

## 第一次使用

当前 0.12.1 推荐顺序：

1. 在设置选择世界书与 `【LoreState模块 v1】` 状态栏条目。
2. 点击 **确认绑定状态栏条目**。
3. 打开 **外观制作**，生成/修改 HTML 草稿；或直接粘贴合法 v2 HTML。
4. 预览、校验并应用草稿/预设。
5. 首次启用回设置点击 **保存 HTML 并启用本聊天**。

可直接试用：

- [旅途档案 HUD](../prototype/example.html)
- [紧凑日志](../prototype/module-example.html)
- [配套模块条目](../prototype/module-example.txt)

## 文档根

v2 模板必须是完整 HTML 文档，并在根节点声明：

```html
<!doctype html>
<html lang="zh-CN" data-lore-template="2">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>/* 静态 CSS */</style>
</head>
<body>...</body>
</html>
```

HTML 不负责定义状态字段。模板中引用的字段必须已经由当前模块条目声明。

## 公共字段

公共状态使用 `data-lore-shared`：

```html
<p>地点：<b data-lore-shared="地点"></b></p>
<p>时间：<b data-lore-shared="时间"></b></p>
```

公共字段可以在任意非重复上下文中显示，也可以重复显示。

## 实体模块

`data-lore-each="模块名"` 会为匹配实体复制该元素；区域内部才能使用该模块字段：

```html
<section>
  <h2>在场人物 · <span data-lore-count="人物"></span></h2>
  <p data-lore-empty="人物">暂无人物</p>

  <article data-lore-each="人物">
    <h3 data-lore-name></h3>
    <p>身体：<b data-lore-field="身体状况"></b></p>
    <p>目标：<b data-lore-field="当前目标"></b></p>
  </article>
</section>
```

模板可以只显示人物的“身体状况”而不显示“当前目标”；这只是视觉选择，不会删除未显示字段。

## 查询接口

| 属性 | 用途 |
| --- | --- |
| `data-lore-each="人物"` | 为指定模块的实体重复当前元素 |
| `data-lore-presence="active"` | 只查询热档；省略时默认 active |
| `data-lore-presence="cold"` | 只查询冷档 |
| `data-lore-presence="all"` | 查询 active + cold |
| `data-lore-select-id="P01"` | 精确筛选稳定实体 ID |
| `data-lore-limit="5"` | each 最多展示 5 项；不会删除数据 |
| `data-lore-count="人物"` | 显示匹配数量，不受其他 each 的 limit 影响 |
| `data-lore-empty="人物"` | 同条件查询为 0 时保留该静态容器 |

`each`、`count`、`empty` 可以分别带相同的 presence 条件。不要用 `limit="1"` 猜玩家身份，也不要把 limit 当作“最近/最重要”的业务排序；当前接口不自动排序。

## 实体元数据与字段

`data-lore-each` 内可使用：

| 属性 | 显示内容 |
| --- | --- |
| `data-lore-name` | 名称 |
| `data-lore-id` | 稳定 ID |
| `data-lore-type` | 模块/类别 |
| `data-lore-identity` | 识别信息 |
| `data-lore-confirmed` | 最后确认信息 |
| `data-lore-field="字段名"` | 当前模块声明的字段值 |

输出节点只接收文字。缺失/null 显示“尚未记录”；对象、数组等异常值不会被当作 HTML 执行。

## 条件显隐 · 0.11.1 起

可以根据某个已声明字段是否存在/是否等于指定文字，保留或移除一个静态容器：

```html
<section data-lore-if-shared="地点">
  <p>地点：<span data-lore-shared="地点"></span></p>
</section>
```

实体区域内：

```html
<article data-lore-each="人物">
  <h3 data-lore-name></h3>
  <section data-lore-if-field="当前目标">
    <p data-lore-field="当前目标"></p>
  </section>
</article>
```

需要精确匹配时在同一个条件节点添加：

```html
<section data-lore-if-field="身体状况" data-lore-equals="危险">...</section>
```

条件只控制展示，不改变状态，也不参与 entity count。

## 字段值映射 class · 0.11.1 起

模板可以把**精确字段文字**映射到受控的静态 class：

```html
<article
  data-lore-each="人物"
  data-lore-class-field="身体状况"
  data-lore-class-map='{"健康":"is-healthy","危险":"is-danger"}'>
  <h3 data-lore-name></h3>
  <p data-lore-field="身体状况"></p>
</article>
```

公共字段使用 `data-lore-class-shared`。映射只添加白名单格式的 class，不允许把状态值写入 `style`、URL、事件属性或表达式。

## 冷档布局

冷档不再由宿主在 iframe 外硬编码追加；作者可以自己安排：

```html
<details>
  <summary>人物冷档 · <span data-lore-count="人物" data-lore-presence="cold"></span></summary>
  <p data-lore-empty="人物" data-lore-presence="cold">暂无封存人物</p>
  <article data-lore-each="人物" data-lore-presence="cold" data-lore-limit="5">
    <b data-lore-name></b>
    <p data-lore-identity></p>
  </article>
</details>
```

大冷档建议设置 limit，同时显示完整 count。完整状态仍可在 LoreState 管理/诊断界面查看。

## 安全边界

模板是受限静态 HTML/CSS：

- 禁止 `<script>`、事件属性、iframe、SVG、表单、contenteditable；
- 禁止远程图片、字体和其他 URL 资源；
- CSS 禁止 `@import`、`url()`、`image-set()`、`attr()`、执行型/未知函数与逃逸式资源加载；
- 最终 iframe 保持空 sandbox，并使用限制资源的 CSP；
- 状态文字通过 `textContent` 一类的可信路径填入，不作为 HTML 执行；
- 重复 each 区域不要放会重复的静态 `id`、`for` 或 ARIA IDREF。

允许常见静态布局、媒体查询、container/layer/keyframes、渐变、CSS 变量、calc/min/max/clamp、原生 `details/summary` 等；准确白名单以 `prototype/template.js` 为准。

## 预算

当前实现对 HTML 原文、原始/最终 DOM、each 区域、总克隆数和最终序列化大小都有硬上限。超限会报错，不会静默删状态。

大致设计原则：保持模板结构简洁；冷档使用 limit；不要为每个字段制造大量重复包装；移动端优先单列、宽屏再分栏。

## 响应式建议

- 320px 左右保持单列；
- grid/flex 子项设置 `min-width:0`；
- 长中文和无空格文本使用 `overflow-wrap:anywhere`；
- 检查 200% 字体缩放；
- 原生折叠热区建议至少 44px；
- 提供可见键盘焦点；
- 尊重 `prefers-reduced-motion`；
- 不要仅靠颜色表达危险/完成等状态。

## 外观制作台与外部 AI

当前推荐直接使用 [外观制作台](外观制作台.md)：它会根据真实 DataSchema 组装 HTML 制作任务，生成结果先进入草稿并走本地校验。

如果要交给外部网页 AI，可以复制类似要求：

```text
请根据我附上的 LoreState 模块条目制作 Template API v2 完整 HTML。
模块条目定义 DataSchema，HTML 只选择展示字段和布局。
公共值使用 data-lore-shared；实体使用 data-lore-each，区域内用 data-lore-field。
允许部分字段、重复字段、多个同类区域，以及受限的 cold 档案区域。
只使用静态 HTML/CSS 和 details/summary；禁止脚本、外链、图片、URL 资源和任意属性绑定。
320px 单列，宽屏可分栏，长文字可折行，支持放大字体、键盘焦点和 reduced-motion。
根节点必须包含 data-lore-template="2"。只返回完整 HTML。
```

脚本仍保留制作提示词能力时，可以把它作为外部 AI 的辅助入口；但当前首选是外观制作台，因为它直接使用已确认绑定的真实条目/schema。

## 旧模板升级

从 `0.11.0` / `0.11.1` / `0.12.0` 升级到 `0.12.1`，合法 v2 模板无需重制，状态/schema/快照也不迁移。

从 `0.10.6` 或更早版本升级，旧 HTML 原文和预设文本会保留，但旧 `data-lore-person/entity/module` 等接口不在 v2 展示层运行。重新制作 v2 模板并应用即可；状态引擎与已有数据不会因为换皮肤而被清空。

[作者入门](作者入门.md) · [模块条目指南](状态栏条目创作指南.md) · [外观制作台](外观制作台.md) · [0.12.1 发布说明](发布材料/0.12.1-条目绑定修复.md)