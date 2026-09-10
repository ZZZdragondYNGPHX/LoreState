# LoreState Agent Guide

- 这是 LoreState 的主仓库；当前维护线是 `prototype/` 的 Tavern Helper 远程脚本，`artifact/bundle.js` 是 `main` 分支运行代码。
- 默认用中文沟通。先读本文件、`docs/开发说明.md` 和 `交接文档.md`，再复述目标、红线、验收；不要把历史交接记录当成当前指令。
- `examples/` 与 `examples/wishnote` 分支已退休，不得重新创建或把 WishNote 专用代码接回主构建。

## 每次更新/修复

- 凡涉及 `prototype/`、`scripts/`、`artifact/` 或远程分发行为的更新/修复，修改维护源后必须运行 `npm run build`。
- 构建必须生成并提交 `artifact/bundle.js`、`prototype/dist/main/lorestate-script.json` 和对应 `receipt.json`；不要手工编辑打包产物。
- 当前活动交付只有远程版：不得新增 `lorestate-script-offline.json` 或其他离线备用产物。旧固定版本/旧离线文件若仍在历史标签中，只作历史复现，不得在新文档中推荐。
- 构建后运行 `npm run check`、`npm test`；涉及模板或宿主行为时再运行 `node scripts/test-browser.mjs`。测试通过不等于真实 SillyTavern 验收。

## 远程版本与 main

- 活动远程入口跟随 `@main`。用户刷新脚本或宿主页面后即可拉取最新 `artifact/bundle.js`；普通修复不需要修改 `package.json` 版本号，也不需要创建新的 `main` 版本目录。
- 固定版本标签是独立发布边界；需要稳定版本时新建明确的新标签，不移动或覆盖旧标签。
- 不擅自安装、发布、创建 GitHub Release、改生产配置或设置人工验收状态。提交/推送只有用户明确授权时执行。

## 文档与发布材料

- 活动说明统一放在 `docs/`；对外发布包统一放在 `docs/发布材料/`，历史迁移/旧扩展记录统一放在 `docs/archive/`。
- 不重新创建顶层 `release/`、`examples/` 或 `examples/wishnote`；旧版本与旧离线文件只留在历史目录/标签中，不在新文档中推荐。

## 交付记录

- 交接中分开记录源代码、自动化、远程产物、浏览器、真实酒馆、人工验收和发布证据；自动化不得写 `driver-accepted`。
- 完工报告必须列出已验证项、未测边界、远程入口/ref、生成文件、Git 状态和下一验收门。
