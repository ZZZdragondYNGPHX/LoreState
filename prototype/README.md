# 当前入口：0.12.2 固定版与 main 开发版

当前固定安装使用 [0.12.2 远程组件](dist/0.12.2/lorestate-script.json)；持续开发使用 [main 远程组件](dist/main/lorestate-script.json) 和 [main 脚本代码](../artifact/bundle.js)。旧固定标签保持不可移动。

作者请从 [文档目录](../docs/README.md) 和 [作者入门](../docs/作者入门.md) 开始。

## 当前能力

- XML v3 状态：首次 full，后续 delta；状态随聊天历史回放。
- `【LoreState模块 v1】`：公共栏目与人物/物品/国家/事件等模块可拥有不同字段。
- 热档/冷档、按需读取、事件与有限关联召回。
- Template API v2：多区域布局、部分/重复字段、自定义冷档区域。
- 0.11.1 起：API 辅助外观制作、条件显隐、字段值 → class 映射。
- 0.12.0 起：可选 ST-Prompt-Template / EJS 只读桥接。
- **0.12.1：修复首次设置时条目选择在刷新/切页后丢失；新增独立“确认绑定状态栏条目”。**

本版控制中心使用浅色界面；更新/取消/撤销集中在“更新与恢复”，API 配置位于“模型连接”。详见 [0.12.2 发布说明](../docs/发布材料/0.12.2-浅色控制中心.md)。

## 首次配置（0.12.1 起保留明确绑定）

1. 导入固定组件，只启用一份 LoreState。
2. 在角色/聊天世界书建立模块条目，可直接使用 [module-example.txt](module-example.txt)。
3. 打开 LoreState 设置，选择世界书与状态栏条目。
4. 点击 **确认绑定状态栏条目**。
5. 打开外观制作，使用 API 生成/修改 v2 HTML，或直接粘贴 [example.html](example.html) / [module-example.html](module-example.html)。
6. 预览并应用外观；首次使用回设置点击 **保存 HTML 并启用本聊天**。
7. 用独立测试聊天验证 full → delta、刷新恢复、切聊天与导出。

0.12.1 会在刷新世界书和设置/外观页切换后保留选择；已确认条目消失时留空并要求重新选择，不自动改用第一条。

## 当前模板接口

Template API v2 根节点：

```html
<html lang="zh-CN" data-lore-template="2">
```

公共值：

```html
<span data-lore-shared="地点"></span>
```

实体模块：

```html
<article data-lore-each="人物">
  <h3 data-lore-name></h3>
  <p data-lore-field="身体状况"></p>
</article>
```

DataSchema 来自模块条目，HTML 只负责展示。完整 API 见 [HTML 模板适配指南](../docs/HTML模板适配指南.md)。

旧 `0.10.6` 及更早 HTML 属于 Template API v1，当前不会自动转换；旧原文保留，但需要重制 v2 外观。已有 `0.11.0+` 合法 v2 模板升级到 0.12.2 无需重制。

## 外观制作

外观制作台复用已保存的 API 连接，但使用独立 HTML 任务。模型只自动收到 DataSchema、风格要求和改稿时的 HTML，不自动收到聊天正文、真实状态或整段世界书。

生成结果先是草稿；通过校验、预览并显式应用后才改变外观。详见 [外观制作台](../docs/外观制作台.md)。

## EJS / 动态世界书

0.12.0 起可以让 ST-Prompt-Template 在 EJS 中只读访问当前 LoreState 快照：

- `lorestate` / `LoreState.state`
- `ls` / `LoreState.get`
- `lsHas` / `LoreState.has`
- `lsRange` / `LoreState.range`
- `lsStage` / `LoreState.stage`

桥接不内置 EJS、不写状态、不创建第二套变量、不绕过冷档读取校验。当前固定版仍是 `0.12.2`；0.12.0 只表示本功能的首发版本。详见 [EJS 指南](../docs/EJS动态世界书.md)。

## 隐藏楼层

隐藏助手只改变旧正文是否进入模型上下文；属于当前回复分支的隐藏 AI 楼层仍参与 LoreState 本地状态回放。当前 0.12.2 已包含该修复。详见 [隐藏助手兼容与更新](../docs/隐藏助手兼容与更新.md)。

## 构建

在仓库根目录：

```sh
npm run build
npm run check
npm test
```

涉及模板/UI/宿主事件时：

```sh
node scripts/test-browser.mjs
```

EJS 相关可额外运行：

```sh
node scripts/test-ejs.mjs
```

`npm run build` 只生成 main 开发入口。准备新的固定 tag 时，在打 tag 前使用版本参数，例如下一 patch：

```sh
npm run build -- 0.12.3
```

正式固定版本的 loader 只能引用自己的 `@<version>`，不能引用 `@main`。

## 历史资料

`dist/v0.x/`、早期协议说明以及旧版模板/组件保留用于复现，不代表当前安装方式。版本历史与发布证据见 [版本管理](../docs/版本管理.md)、[发布材料](../docs/发布材料/README.md) 与 [验证记录](verification.md)。