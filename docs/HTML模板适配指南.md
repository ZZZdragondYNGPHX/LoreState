> 本文保留 0.7.0 基础写法。当前作者请以[0.9.0 模块条目与试卡](0.9.0模块条目与试卡.md)为配置入口；版本差异见[作者目录](README.md)。

# 从条目生成状态栏

HTML 决定显示方式，也决定可保存的栏目名单。先确定条目里的栏目，再制作模板。下方模板与旅行示例完全配套，可以直接粘贴到 LoreState 的 HTML 输入框。

## 完整模板

```html
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#f5efdf;color:#353b30;font:14px/1.65 system-ui}
h2,h3,p{margin:4px 0}header{border-bottom:1px solid #a9b393;padding-bottom:12px}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:12px;margin-top:12px}
article{border:1px solid #c5ccb6;border-radius:10px;padding:12px;min-width:0}
small{display:block;color:#5d684e}h4{margin:10px 0 2px}p{overflow-wrap:anywhere}
</style></head>
<body>
<header><h2>旅途状态</h2>
<h3>地点</h3><p data-lore-field="地点"></p>
<h3>时间</h3><p data-lore-field="时间"></p></header>
<main><article data-lore-entity>
<h3 data-lore-name></h3>
<small data-lore-type></small><small data-lore-id></small>
<h4>概况</h4><p data-lore-field="概况"></p>
<h4>当前状态</h4><p data-lore-field="当前状态"></p>
<h4>最后确认的剧情时间</h4><small data-lore-confirmed></small>
</article></main>
</body></html>
```

模板会为每个热档实体复制一张卡片，不需要自己写循环。冷档通过脚本的“本地冷档”折叠区查看。确认时间未知时显示“未知”；事实更新楼层可以在管理器和本地档案中查看。

## 绑定规则

| 写法 | 含义 |
| --- | --- |
| 容器外 `data-lore-field="时间"` | 公共、常驻栏目 |
| `data-lore-entity` | 唯一的实体重复容器 |
| 容器内 `data-lore-field="当前状态"` | 所有实体共用的栏目 |
| `data-lore-name` / `data-lore-id` | 实体名称 / 稳定编号 |
| `data-lore-identity` / `data-lore-type` | 稳定识别信息 / 类别 |
| `data-lore-confirmed` | 最后确认的剧情时间 |

只能有一个实体容器，不能为人物、国家、物品分别写三个重复容器。只做常驻状态时，删除整个 `<main>…</main>`，保留地点和时间即可；对应示例一。

每个绑定节点只放待填文字，标题另放。例如 `<h4>概况</h4><p data-lore-field="概况"></p>`。不要把标题、按钮或其他绑定节点塞进这个 `p`；脚本会用状态文字替换其内容。

栏目名以文字或下划线开头，后续只用文字、数字、下划线或连字符，最长 40 字符。不要使用空格、斜杠、冒号或 `Entity`、`Shared`、`LoreState` 等协议名称。公共和实体每组最多 32 项；至少一组要有栏目。

## 交给网页 AI 的简短要求

```text
请制作 LoreState v3 静态 HTML 状态栏。
公共栏目只有：地点、时间。实体栏目只有：概况、当前状态。
公共字段放在 data-lore-entity 容器外；实体字段放在唯一的 data-lore-entity 容器内。
每个字段使用独立文字节点 data-lore-field="准确栏目名"，标题另放。
实体名称、类别、编号使用 data-lore-name、data-lore-type、data-lore-id。
只用 HTML、内联 style 中的 CSS 和 details/summary；适应窄屏与长文字。
不要 JavaScript、事件属性、外部字体、图片、链接、表单、iframe 或网络请求。
只返回完整 HTML，不增加栏目，不把 data-lore-entity 写成旧 data-lore-person。
```

脚本设置中的 **生成并复制 HTML 制作提示词** 会带上你实际选择的条目，比手动拼接更省事。生成完成后仍要预览，确认没有多出或漏掉栏目。

## 外观与数据分别修改

颜色、边距和标题样式可以作为预设切换，公共与实体栏目集合必须分别保持一致。栏目名称也是数据键；“改名”属于 schema 变化，不是普通换肤。新栏目请用独立脚本配置和新聊天试做。

这是静态展示模板，不支持脚本、表单、远程资源、任意网络请求，也不会执行字段里的 HTML。需要交互式业务系统时应另行设计，不能直接往模板加 JavaScript。
