# LoreState Agent Guide

- 这是 LoreState 的主仓库；当前维护线是 `prototype/` 的 Tavern Helper 远程脚本，`artifact/bundle.js` 是 `main` 分支运行代码。
- 默认用中文沟通。开始工作前先读本文件、`docs/版本管理.md`、`docs/开发说明.md` 和 `交接文档.md`，再确认目标、基底 ref、红线和验收；不要把历史交接记录当成当前指令。
- `examples/` 与 `examples/wishnote` 分支已退休，不得重新创建或把 WishNote 专用代码接回主构建。
- 根目录 `src/`、`index.js`、`manifest.json` 与 `package.json` 的 `0.2.1` 属于旧原生扩展；不得拿它当当前 Tavern Helper 脚本版本。

## 版本与分支：强制规则

- `main` 是唯一长期开发分支，也是唯一活动开发远程入口。
- 正式版本只能用不可移动的语义版本 Git tag 表示，例如 `0.10.2`、`0.10.4`。**禁止创建裸版本号 branch**，禁止移动或覆盖已发布 tag。
- 普通工作分支只允许短期使用 `fix/*`、`feat/*`、`chore/*`；针对固定版本的临时诊断只能用 `debug/<version>-<slug>`。完成后必须删除短期分支。
- 不再创建 `release-*`、`source-port*`、版本号 branch 或长期 hotfix branch。
- 历史上误建的 `0.10.3` branch 已删除，其原 SHA `08a0df5` 固化为不可移动的同名 RC/兼容 tag；不得移动该 tag，也不得用它推导今后的版本流程。下一次完整发布从 `0.10.4` 开始。

## 版本相关问题的取证要求

- 用户明确说自己在使用某个版本/ref 时，**必须先读取那个精确 ref 的源码和构建产物**；不得先用 `main` 代码解释固定版本行为。
- 在判断“某版本是否包含某修复”前，至少核对目标文件的 blob SHA 或 compare 结果。相同文件 SHA 可以视为同一源码；分支历史不同不等于文件内容不同。
- 任何临时诊断都必须明确写出“基底 ref + 基底 commit SHA”。不得用含糊的“最新版”“当前版本”代替。
- 不得把 `main`、固定 tag、历史版本 branch、临时 debug loader 混称为同一个版本。

## 每次更新/修复

- 凡涉及 `prototype/`、`scripts/`、`artifact/` 或远程分发行为的更新/修复，修改维护源后必须运行 `npm run build`。
- `artifact/bundle.js`、`prototype/dist/main/lorestate-script.json` 和 `prototype/dist/main/receipt.json` 是生成物；**禁止手工维护生成物来掩盖源代码未修改的问题**。
- 当前活动交付只有远程版：不得新增无版本根入口或离线备用产物。历史固定版本/旧离线文件只作历史复现，不得在新文档中推荐。
- 构建后运行 `npm run check`、`npm test`；涉及模板、UI 或宿主行为时再运行 `node scripts/test-browser.mjs`。测试通过不等于真实 SillyTavern 验收。

## main 构建与固定版本发布

开发版：

```sh
npm run build
```

只允许生成/更新：

- `artifact/bundle.js`
- `prototype/dist/main/lorestate-script.json`
- `prototype/dist/main/receipt.json`

`main` 远程入口必须且只能加载：

```text
@main/artifact/bundle.js
```

不得在 `main` 入口前后长期串联 `diagnostic-hook.js`、hotfix loader 或其他旁路脚本。

准备固定版本时，在**打 tag 之前**执行：

```sh
npm run build -- <version>
```

例如：

```sh
npm run build -- 0.10.4
```

固定版本的 `prototype/dist/<version>/lorestate-script.json` 必须且只能引用 `@<version>/artifact/bundle.js`。提交生成物并通过检查后，tag 再指向这个完全一致的提交。已经发布的 tag 永远不移动。

## Debug / hotfix 红线

- 临时诊断代码不得直接提交进 `main` 的活动入口或长期留在 `artifact/`。
- 排查固定版本时，从精确 tag/commit 创建 `debug/...`，诊断钩子只允许存在于该临时分支。
- 找到根因后必须把修复落回维护源、补回归测试、重新构建；不得把“额外 loader + 旧 bundle”当正式修复。
- Debug 结束后删除临时分支和临时诊断文件。若需要稳定交付，发布新的 patch 版本，而不是修改旧 tag。

## 文档与发布材料

- 活动说明统一放在 `docs/`；版本制度以 `docs/版本管理.md` 为准。
- 对外发布包统一放在 `docs/发布材料/`，历史迁移/旧扩展记录统一放在 `docs/archive/`。
- 不重新创建顶层 `release/`、`examples/` 或 `examples/wishnote`；旧版本与旧离线文件只留在历史目录/tag 中，不在新文档中推荐。
- README 中的“当前版本”“稳定版”“开发版”必须与实际 refs 一致；不得让 README 长期停留在过期版本号。

## 提交前自检

- 明确本次基底是 `main`、某个 tag，还是临时 debug 分支。
- 若用户要求修固定版本，确认没有误改 `main`，也没有从错误的 ref 取代码。
- 运行构建后确认 `git diff` / `git status` 只包含预期文件；生成物与源码一致。
- `npm run check` 必须通过版本管理守卫：禁止语义版本 branch、禁止临时诊断进入 main、禁止旧的无版本 dist 根入口。
- 固定版本发布前确认 loader ref、receipt ref、tag 名三者完全一致。

## 权限与交付

- 不擅自安装、发布 GitHub Release、修改生产配置、移动 tag 或设置人工验收状态。只有用户明确要求时才执行仓库写入、发布或破坏性操作。
- 交接中分开记录源代码、自动化、远程产物、浏览器、真实酒馆、人工验收和发布证据；自动化不得写 `driver-accepted`。
- 完工报告必须列出：基底 ref/SHA、实际修改、已验证项、未测边界、远程入口/ref、生成文件、Git 状态和下一验收门。
