# LoreState Template API v2 · 当前 0.12.3

Template API v2 从 `0.11.0` 引入，`0.11.1` 增加条件显隐、class 映射和外观制作台；当前固定版 **`0.12.3`** 继续兼容合法 v2 模板。

核心原则：**模块条目定义“存什么”，HTML 只定义“怎么显示”。**

## 第一次使用

1. 在 **规则配置** 选择世界书与 `【LoreState模块 v1】` 条目。
2. 点击 **确认绑定状态栏条目**。
3. 在 **外观制作** 生成/修改 HTML 草稿，或直接粘贴合法 v2 HTML。
4. 预览并显式应用。
5. 首次启用时点击 **保存 HTML 并启用本聊天**。

可直接参考 [旅途档案 HUD](../prototype/example.html)、[紧凑日志](../prototype/module-example.html) 和 [配套模块条目](../prototype/module-example.txt)。

## 文档根

模板必须是完整 HTML 文档：

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

## 公共字段

```html
<p>地点：<b data-lore-shared="地点"></b></p>
```

`data-lore-shared` 引用的字段必须由当前模块条目声明。

## 实体模块

```html
<article data-lore-each="人物">
  <h3 data-lore-name></h3>
  <p>身体：<b data-lore-field="身体状况"></b></p>
  <p>目标：<b data-lore-field="当前目标"></b></p>
</article>
```

`data-lore-field` 只能在对应 `data-lore-each` 区域中读取该模块声明的字段。

## 查询与元数据

| 属性 | 用途 |
| --- | --- |
| `data-lore-each="人物"` | 为指定模块实体重复当前元素 |
| `data-lore-presence="active"` | 只查询热档；省略时默认 active |
| `data-lore-presence="cold"` | 只查询冷档 |
| `data-lore-presence="all"` | active + cold |
| `data-lore-select-id="P01"` | 精确筛选稳定实体 ID |
| `data-lore-limit="5"` | 限制该区域展示数量，不删除数据 |
| `data-lore-count="人物"` | 显示匹配数量 |
| `data-lore-empty="人物"` | 同条件结果为 0 时保留静态容器 |

`each` 内还可使用 `data-lore-name`、`data-lore-id`、`data-lore-type`、`data-lore-identity`、`data-lore-confirmed`。

## 条件显隐与 class 映射

0.11.1 起可根据已声明字段是否存在/是否等于指定文字控制静态容器：

```html
<section data-lore-if-field="当前目标">
  <p data-lore-field="当前目标"></p>
</section>
```

精确匹配可配合 `data-lore-equals`。

字段值也可映射到受控静态 class：

```html
<article
  data-lore-each="人物"
  data-lore-class-field="身体状况"
  data-lore-class-map='{"健康":"is-healthy","危险":"is-danger"}'>
  <p data-lore-field="身体状况"></p>
</article>
```

映射只添加白名单格式 class，不允许把状态文字写入 style、URL、事件属性或表达式。

## 冷档布局

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

大冷档建议设置 `limit`，同时显示完整 `count`。

## 安全边界

外观是受限静态 HTML/CSS：禁止 `<script>`、事件属性、iframe、SVG、表单、contenteditable、远程图片/字体及其他 URL 资源；CSS 禁止 `@import`、`url()`、`image-set()`、`attr()` 等逃逸式资源加载。状态文字按文本填充，不作为 HTML 执行。

允许常见静态布局、媒体查询、container/layer/keyframes、渐变、CSS 变量、calc/min/max/clamp、原生 `details/summary` 等；准确白名单以 `prototype/template.js` 为准。

响应式模板应至少检查 320px 单列、`min-width:0`、长文本折行、200% 字体、键盘焦点和 `prefers-reduced-motion`。

## 升级与改 schema

从 `0.11.0`～`0.12.2` 升级到 `0.12.3`，合法 v2 HTML 无需重制；v3 状态、schema 和快照也不因升级迁移。

从 `0.10.6` 或更早版本升级，旧 HTML 原文可保留，但旧 v1 展示接口不会作为当前 v2 模板运行，需要重新制作 v2 外观。

如果增删/改名模块或字段，这不是“换皮肤”，而是 DataSchema 结构变化。0.12.3 可先按 [作者入门](作者入门.md) 的“彻底删除旧配置”流程重建 schema，再制作匹配的新 HTML。

[外观制作台](外观制作台.md) · [状态栏条目创作指南](状态栏条目创作指南.md) · [0.12.3 发布说明](发布材料/0.12.3-配置重置与多协议API.md)
