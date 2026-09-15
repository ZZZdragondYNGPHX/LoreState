# LoreState prototype · 0.13.0 固定版与 main 开发版

当前固定安装使用 [0.13.0 远程组件](dist/0.13.0/lorestate-script.json)；持续开发使用 [main 远程组件](dist/main/lorestate-script.json) 和 [main bundle](../artifact/bundle.js)。旧固定标签保持不可移动。

作者请从 [文档目录](../docs/README.md) 与 [作者入门](../docs/作者入门.md) 开始；本目录主要面向维护者。

## 当前能力

- XML v3：首次 full、后续 delta，按聊天历史回放。
- `【LoreState模块 v1】`：公共栏目与不同实体模块拥有各自字段。
- 热档/冷档、按需读取、事件与有限一跳关联。
- Template API v2：多区域、部分/重复字段、自定义冷档布局。
- 0.11.1 起：API 辅助外观制作、条件显隐、字段值 → class 映射。
- 0.12.0 起：ST-Prompt-Template / EJS 只读桥接。
- 0.12.1 起：首次世界书条目显式确认绑定。
- 0.12.2 起：浅色控制中心与统一“更新与恢复”。
- **0.12.3**：彻底删除旧配置后重建栏目；Chat Completions / Responses / Anthropic 直连；酒馆提示词预设桥接；auto / max / ultra 等思考程度。

## 首次配置

导入固定组件 → 创建/选择模块条目 → 确认绑定 → 制作/粘贴 v2 HTML → 预览并应用 → 保存 HTML 并启用聊天 → 独立测试 full → delta。

当前 DataSchema 来自模块条目，HTML 只负责展示。模板接口见 [HTML 模板适配指南](../docs/HTML模板适配指南.md)。

## 0.12.3 重置配置

结构性增删/改名字段时，可在 **规则配置 → 聊天维护** 输入 `删除旧配置` 并执行 **彻底删除旧配置**。它会清理本脚本配置和当前聊天 LoreState 数据，但保留正文、世界书与全局 API；随后重新绑定条目和 HTML。

## 源码模块

核心运行代码位于本目录，主要模块职责见 [开发说明](../docs/开发说明.md)。`artifact/bundle.js`、`dist/main/` 与固定 `dist/<version>/` 都是构建交付物，不应代替维护源修改。

## 构建

```sh
npm run build
npm run check
npm test
```

涉及模板/UI/宿主事件时运行 `node scripts/test-browser.mjs`；EJS 相关按需运行 `node scripts/test-ejs.mjs`。

`npm run build` 只生成 main 开发入口。当前 0.13.0 已发布，下一 patch 示例：

```sh
npm run build -- 0.13.1
```

正式固定 loader 只能引用自己的 `@<version>/artifact/bundle.js`，不能引用 `@main`。

## 历史资料

`dist/v0.x/`、`people-memory.md`、早期 snapshots 设计说明等只用于复现。当前协议参考为 [world-memory.md](world-memory.md)；当前验证入口为 [verification.md](verification.md)；旧作者说明统一进入 [docs/archive](../docs/archive/README.md)。
