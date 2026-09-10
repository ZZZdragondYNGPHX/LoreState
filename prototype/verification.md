# 隐藏楼层兼容修复与 v0.9.2 分发 · 2026-09-10

代码已推送 main，提交 `32df550`；`prototype-v0.9.1` 保留为仅脚本代码标签，完整远程/离线组件固定标签为 `prototype-v0.9.2`。旧标签未改写。

- 92 项 Node、11 项模板浏览器、33 项最终 bundle 模拟宿主检查通过；JavaScript 语法与组件格式校验通过。
- 隐藏初始化、连续隐藏增量、历史诊断、快照去重、隐藏切换后的回档、旧前缀读取、编辑/删除/分支变化校验均有覆盖。
- 问题聊天保持隐藏标记与凭据，离线回放至第 8 楼零错误；私人原文未纳入仓库。
- 真实酒馆安装、实际隐藏助手联动、模型生成与长聊天性能未验收；未设置 driver-accepted。
- [更新与验收说明](../docs/隐藏助手兼容与更新.md)。以下为历史阶段记录。

---

# 0.9.0 分发授权补充 · 2026-09-08

用户授权推送 main 与本版固定标签 prototype-v0.9.0。构建收据改为 published=true，仅指 Git 版本分发；realHostVerified=false，不设置 driver-accepted。源码与 bundle 内容不变，前述自动测试及 SHA-256 仍适用。下方未发布描述为本地实施阶段记录。未进行真实酒馆安装或 GitHub Release 发布。

---

# 0.9.0 模块条目 · 本地自动验证（2026-09-08）

- 授权：用户批准“模块格式规范＋分类栏目＋按需规则＋同轮统一更新”的第一版，并明确不需要兼容任何旧数据。交付模式 component；不做旧条目/旧配置转换和旧聊天迁移。
- 实现：modules.js 解析显式分区；声明决定分类栏目；core 按 Entity.type 校验字段；模板分类分区与声明双向核对；运行时保存、预览、提示注入、冷档详情、预设与历史配置签名均接通模块结构。
- 规则：目录与通用规则常驻；初轮加载全部规则；后续按完整档案类别和输入模块名加载；预算裁掉可选档案时重新计算规则和读取权限。未声明事件模块时不强制建事件。
- 自动证据：npm test 89/89；npm run check 通过；npm run build 通过；node scripts/test-browser.mjs 模板 11/11，最终 bundle 模拟宿主 32/32。新模块测试覆盖分类建档、跨模块原子提交、非法字段整批拒绝、冷档凭据、规则选择、预算回退、模块变更中止及作者入口拒绝非模块格式。
- 组件证据：TavernWeave component plan/build 在本地临时目录完成，无 full-card 输出；离线和远程入口 JSON 均通过 validate-importable-component；最终离线 content 与 artifact/bundle.js 字节一致，receipt SHA-256 一致；ID、enabled、button、data、export_with、name 与 0.8.0 组件一致。远程入口仅为未发布配置。
- 原构建 SHA-256：2fae633b72dc083a97d4fb063de8217e95b3b0e0849706d7e03c76a1e26d2c50。
- 本次 bundle SHA-256：376c33c5fe19b8c7a4a6b906e2a629820822987b5b60664e620de5518965ffea。
- 资料收据：consult-tavernweave-library snapshot 2026-08-18；路线 tavern-card-builder、sillytavern-embedded-ui、sillytavern-component-update；实际读取 A0、B1、C2 的相关段及 variable-systems、component-update-contract、importable-formats。未采用设计候选，未引入新宿主 API、模型或外部依赖。运行目标沿用项目固定的酒馆助手 4.9.5 / SillyTavern 1.18.0，未声称已在该宿主运行。
- 未测边界：真实酒馆导入、实际模型是否稳定遵守模块规则、跨模块语义一致性、真实重抽/删尾/回档及主题下展示。突然新建未选中的类别只按目录、通用规则和机器约束建档，详细规则下一轮生效；建档当轮必需限制需放通用规则/约束。实体栏目同名约束暂为全局，全部实体栏目去重后最多 32 个。
- 交付：prototype/dist/v0.9.0/；[使用与试卡](../docs/0.9.0模块条目与试卡.md)、module-example.txt、module-example.html。published=false / realHostVerified=false，未设置 driver-accepted。未安装、调用模型、提交、推送或发布；已有 release/ 未触碰。
- 下一关：用户在独立测试卡、新配置和新聊天中进行真实试卡；模型表现与最终验收由用户确认。

---

# 0.8.0 远端分发 · 2026-09-08

用户已授权推送本次实现；分发目标为 origin/main 与固定标签 prototype-v0.8.0。构建 published=true 表示本次 Git 版本分发，realHostVerified=false 保留。实机测试仍由用户统一完成；未创建 GitHub Release，也未安装脚本。旧 release/ 为既有未跟踪材料，不包含在本次提交中。下方保留本地实施阶段的历史记录。

---

# 0.8.0 批次改进 · 2026-09-08

用户明确授权继续实装，真实宿主测试留待全部实装后统一进行。本轮交付 component：源码、回归、作者操作说明与 0.8.0 本地组件；未安装、调用模型、提交、推送或发布。保留原有 0.7.1 未提交改动和用户 release/。

**Gate 与范围：** 续写入口为 Local Fix / Local Fix Only；存储边界、作者配置/校验、冷档读取凭据分别按 Staged Refactor 实施，每个实现阶段以约 200 行维护代码为预算（测试、构建与说明另列），没有重写旧扩展或引入依赖。证据来自上一轮双更新块冲突、200 层约 30 MB 重复快照，以及已有初值/字段/冷档约束边界。目标是五项已讨论的功能；红线是保留历史版本、原子更新和用户配置，不安装、不调用模型、不发布。基线为 67 项 Node、9 项模板和 22 项模拟宿主检查。

**行为合同：** continue 在读世界书前中止；相同状态与配置正文共享，所有旧快照、分支、错误元数据无损转存；作者初值先于首轮生效，规则按聊天冻结；只允许有有效本地凭据、且确实进入最终提示的冷档当轮更新。凭据以 UUID 标识，保存对应的完整前态及配置，回放进行精确比较，无纯文本“自报已读”旁路。预算裁掉的档案不授予权限。旧无 read 标签保持原有空唤醒行为。错误规则或更新整轮不提交。

**实现边界：** core.js 增加作者配置、初值、声明式校验和 preparePrompt；snapshot-store.js 管理正文/配置去重及读取凭据；runtime.js 接入存储、设置控件、生成和失败清理。HTML 模板结构与旧扩展未变。新快照存档替代旧数组，原数据可通过 readSnapshots 完整还原；不会自动删除历史。无持久化分支迁移器，旧版本不能直接解释新存档与 read 标签，回退需旧脚本及升级前聊天备份。当前历史变化仍全量重放，未声称解决全部长聊天性能问题。

**自动证据：** 79/79 Node 测试通过，新增覆盖作者初值/来源楼层、必填/禁止删除/枚举整批验证、配置冻结、200 层去重、旧快照/分支/删尾恢复、JSON 重载、缺失正文拒绝、凭据权限/前态/配置校验、预算撤档、回放编辑失效、文档示例实解析。Edge headless 9/9 模板和 29/29 最终 bundle 模拟宿主检查通过，包括预览不写、默认配置隔离、首轮 delta、冷档同轮更新、重抽前态、保存/清理异常中止、存档与凭据重载、容量显示。此次未执行真实 SillyTavern。

**容量测量：** 10 个冷档共 50,000 字，首轮 full 后 199 个空 delta。原完整快照 JSON 为 30,413,477 字节；去重后连同 200 条测试读取凭据为 261,307 字节，1 份状态正文、200 份历史记录，减少约 99.14%。这是资料不变的合成场景；持续事实更新会增加完整正文，凭据元数据也会增长。实机耗时和磁盘保存能力仍待用户验收。

**组件证据：** npm run build / npm run check 通过；离线 content 加末尾换行与 bundle 完全一致；与 0.7.1 对比，除 content/info 外稳定 ID、启用状态、按钮、data、export_with 等字段逐项相等。组件工具在 artifacts/component-v0.8.0 进行 plan/build/validate，仓库离线和预留远程组件另行校验。bundle SHA-256：`2fae633b72dc083a97d4fb063de8217e95b3b0e0849706d7e03c76a1e26d2c50`。

**API 与指南：** code-quality-workflow / sillytavern-component-update，库快照 2026-08-18；读取 A0、组件合同，沿用已核对的 SillyTavern 1.18.0 stopGeneration 与事件源码（提交 51ad27fb86d39a3daca3adaa970375c9670c12df）。本地 helper variables.d.ts 证明同步 updater 的 updateVariablesWith 同步返回变量表；本轮仍用已有脚本/聊天变量接口，无新宿主接口。目标酒馆助手 4.9.5 沿用项目基线，未重新发现运行实例。读源、类型声明和模拟不能代替真实运行证据。

**下一关：** [统一实机测试清单](../docs/0.8.0使用与统一验收.md)。真实流式/非流式请求取消、输入框恢复、模型复制 read、聊天导出再导入、长聊天响应时间由用户测试；published=false / realHostVerified=false，未设置 driver-accepted。完整工作区预算检查包含 0.7.1 累积改动、新增组件与文档、原有 release/，不以减少统计范围取得预算通过。

最终 `git diff --check` 通过；全工作区 `check_patch_scope.py --preset staged-refactor --fail-on-warning` 返回超出默认 5 文件/200 行的告警，预算检查未通过。逐项复核改动均属于已授权批次、回归和交付记录，原有 release/ 仍未修改；该结果作为多阶段累计交付的预算例外保留，不宣称自动范围门通过。

---

# 0.7.1 状态准备失败中止生成 · 2026-09-08

交付模式 component；用户授权第一项局部修复。Gate 为 Local Fix / Local Fix Only：只改变生成准备失败分支，不改变解析协议、聊天数据、历史回放和冷热策略。维护代码限 runtime.js、现有浏览器回归与构建版本，另有验证/交接记录和自动生成组件；不改旧扩展、旧发布目录或用户原有未跟踪 release/。功能与测试约 80 行，产物与记录另计；全工作区预算检查包含原有 release/，不将其计数误报为本次改动。回退为撤回本次源码/构建改动并继续使用保留的 0.7.0 组件，不回滚聊天数据。

**API 证据（本机源码，未运行宿主）：** SillyTavern 1.18.0，提交 `51ad27fb86d39a3daca3adaa970375c9670c12df`。public/scripts/st-context.js 暴露 stopGeneration；public/script.js:5548 的实现中止当前 AbortController 并发出 GENERATION_STOPPED。GENERATION_AFTER_COMMANDS 在创建控制器之后触发；public/lib/eventemitter.js:148 会捕获监听器异常，因此只 throw 不能证明生成会中止。通过 owning helper script 的 window.parent.SillyTavern.getContext() 调用核心接口，无新增依赖。目标酒馆助手 4.9.5 沿用既有项目基线；本轮未重新发现其运行实例。该依据证明接口与源代码行为，不代替实际网络请求验收。

**自动证据：** 67/67 Node 测试、9/9 模板浏览器、22/22 模拟宿主浏览器检查通过。新增 9 项浏览器检查覆盖五类失败（世界书读取/关联、预算、回档、注入）、正常恢复/旧注入清理、预览/暂停/特殊生成、过期聊天失败、停止接口失败。五类失败检查在修复前均失败；修复后宿主模拟 AbortSignal 被中止，消息与聊天状态不被改写。重启测试现在仍加载实际 bundle，避免后半段悄然切到源码。中止接口返回 false 或抛错时只提示手动停止，不声称已成功。

`npm run build`、`npm run check`、`git diff --check` 通过；组件工具 plan/build/validate 使用 artifacts/component-v0.7.1 临时 staging。仓库离线/远程 JSON 均通过 helper-script 校验；离线 content 加结尾换行与 bundle 完全一致。与 0.7.0 对比，除 content/info 外所有组件元数据逐项相等。

完整工作区 `check_patch_scope.py --preset local-fix --fail-on-warning` 返回预算告警，未通过默认 2 文件/80 行门槛；范围包含新版本组件、文档及用户已有 release/。人工逐项确认本次新增范围仅为上述单行为修复及其测试/交付记录；这是有说明的交付文件预算例外，不是自动预算通过，也未删除或隐藏原有未跟踪文件来取得通过。

- bundle SHA-256：`eb7532906f851026d096f1179342a1d4583b94645fd3c43329c058b65bfe865e`。
- 旧 0.7.0 离线组件 SHA-256：`366ed4eb89f1f736140d986267e43ba5e73bbfadff7eab372d40ddb7dbfaafba`；旧产物未修改。
- 指南收据：code-quality-workflow / sillytavern-component-update，库快照 2026-08-18；读取 A0 与组件格式合同，沿用上轮 ST-B1 / MVU 概念导航。没有采用设计候选。

**边界与下一关：** 未运行真实 SillyTavern、导入用户卡、调用模型、验证流式/非流式网络取消与宿主 UI 恢复；不保证其他插件主动发起的独立请求会停止。宿主中止能力缺失时需要用户手动停止。远程标签尚未发布，必须使用同版离线组件测试；published=false / realHostVerified=false，未设置 driver-accepted。续写与存储优化不在本次实施范围。独立测试聊天中验证失败不发出有效模型请求、修复后恢复正常生成，是下一验收关。

---

# 0.7.0 作者文档与版本分发验证 · 2026-09-07

本次用户授权推送 main 与实现版本。新增 docs 导航、作者入门、条目创作指南、条目与连续更新示例、HTML 模板及常见问题。67 项 Node 测试通过（含教程 XML 连续回放与链接校验）；9 项模板浏览器和 13 项模拟宿主检查通过，作者模板栏目与渲染经过验证。程序 bundle 与上一轮验证保持一致。

指南：tavern-card-builder 路由，库快照 2026-08-18；沿用 A0、A2、A6，补读 A3/A4/B1/C10 相关范围，采用 text-cards 与 lorebook-and-prompts 的职责拆分。没有新增 MVU 或宿主 API 用法。

固定标签 prototype-v0.7.0；Git 分发不代表 CDN 已可访问，也不代表真实酒馆或作者验收通过。未安装至用户卡、未调用模型，realHostVerified=false / driverAccepted=false。下方保存本地实装阶段的验证记录。

---

# 0.7.0 世界实体冷热档 · 本地候选验证

2026-09-07；component 模式。用户授权实装且无需旧数据兼容。

65 项 Node 测试通过；Edge headless 的 8 项模板与 13 项模拟宿主检查通过，运行的是最终 artifact/bundle.js。覆盖国家/人物/物品/组织/地点、事件保热、一跳召回和上限、预算下可选档案撤出、冷热事实原文、确认时间与来源楼层、快照回档、模板类别绑定、冷档展开与提示注入、quiet/impersonate 不注入、修复撤销和聊天隔离。JavaScript 语法、构建、TavernWeave helper-script 格式校验通过。bundle 与离线脚本内容逐字一致。

组件稳定 ID、启用状态、按钮与导出策略保留；新配置命名空间 lorestate_world_v3，不迁移旧状态。旧 Wishnote 转换器固定旧引擎且不参与 v3 构建。旧发布目录和用户既有 release/ 未改动。

最终 bundle SHA-256：`8fb3fe30779cdda09bfafca105f24c71a8133a0d73ceadc2710570df3de1cf8b`。详细源与产物哈希见 [validation.json](dist/v0.7.0/validation.json)。

指南收据：sillytavern-component-update，库快照 2026-08-18；读取 A0 与 A2/A6/B2 相关范围；无设计候选采用。本次不改变宿主 API 签名，目标版本沿用 SillyTavern 1.18.0 / Tavern Helper 4.9.5 的仓库记录，没有新增真实宿主兼容性证据。组件工具完成临时 spec 的 plan/build/validate，最终仓库离线组件另行格式验证。

未执行真实酒馆导入、真实模型调用、用户游玩、安装、Git 提交/推送或发布；published=false、realHostVerified=false、driverAccepted=false。下一关为新测试聊天使用离线组件验证实际冷热决策、事件到期、重抽、编辑、回档与刷新。普通字段仍共用文字栏目，暂不支持单个实体内部的字段冷热；无代词语义检索或后台模拟。

---

# 原型验证边界

## prototype-v0.5.2 · 2026-09-07

正文状态 iframe 从固定 260px 改为全宽、360–640px 响应式高度，显式固定正常文档流和禁止 flex 收缩；新增居中大窗口（最大 1000×780px，按视口收缩），支持关闭后焦点返回、状态更新同步及聊天切换时关闭。设置中的 HTML 预览共用同一尺寸实现。保留 opaque sandbox 和 CSP，不增加模板脚本执行权限。

52 项 Node 测试、语法检查和最终 bundle 的 10 项模拟宿主浏览器检查通过；新增全宽尺寸、最低高度、展开后尺寸、正文一致性及关闭焦点回归。浏览器 error 日志为空。未在用户实际主题中重现左下角缩小现象，真实酒馆样式组合仍待用户复测；本版 realHostVerified=false。用户明确授权修复后直接推送 main 与 prototype-v0.5.2。

## prototype-v0.5.1 UI 候选版 · 2026-09-07

范围为 component，单一魔法棒 LoreState 入口、同一控制中心的状态历史／诊断修复／设置三页签。设置按世界书、模板、预设、维护分组；原文与提示词折叠，状态字段自适应排布，逐轮变化折叠。UI 导航不写聊天变量，切页保留未保存 HTML，关闭窗口恢复焦点。

源码为 prototype/runtime.js 与 prototype/control-center.js；构建输出 prototype/dist/v0.5.1/，保留 0.5.0 已发布组件。用户已授权推送 main 与 prototype-v0.5.1 标签；发布不改变本版实机验收待完成的结论。宿主依赖与消息协议不变。

自动化：52 项 Node 回归、JavaScript 语法检查通过。最终 bundle 在模拟宿主浏览器中 9 项检查通过：告警直达错误层、历史查看、单入口与三页签、设置草稿保留、键盘页签导航、336px 容器三页均无横向溢出、修复／备份／撤销、告警去重、分支变化保护、生成中暂停刷新及聊天切换隔离。浏览器 error 日志为空。窄容器测试不代表真实手机键盘／触控验收。

本版真实酒馆安装、宿主样式干扰、移动设备、用户验收尚未执行；0.5.0 的实机证据不自动覆盖本版 UI。构建收据 realHostVerified=false。下一步使用离线候选在专用聊天检查单入口、页签、长内容与窗口关闭，再由用户游玩验收。

指南收据：沿用 consult-tavernweave-library，sillytavern-embedded-ui 路由，快照 2026-08-18；A0 目标／边界／验收已确认，本次选读 C2 控制中心与 D7 响应式相关段落，不采用检索返回的不相关打印设计候选。界面实现保持原生 DOM 与 textContent。


## prototype-v0.5.0 本地候选版 · 2026-09-07

范围：component，仅通用酒馆助手脚本；保留脚本 ID、按钮、数据导出策略。旧版本组件及缄愿笔记世界书未升级；无 Git 提交、安装、推送或远程发布。构建入口输出 `dist/v0.5.0/` 与 `artifact/bundle.js`。主测试入口为离线组件；远程入口是待发布配置。

最终源码 SHA-256：core.js `BFC405156AD9107E51AC641A4C9F8B8FBBC181377668CC966929D3A56EF70D06`；runtime.js `14310ACCEE1E03E3A5D09671234595220A4EE347457DC5AC22D13262C24CFA3F`。最终 bundle 哈希见新目录 receipt.json。

自动化：52 项 Node 测试通过。新增覆盖错误人物／行列、历史缺口、原文修复后重算、历史与未来隔离、删尾／选中分支替换、初始化前楼层、文字实体修复与正文保护、差异类型。

模拟宿主浏览器：Edge headless，tests/runtime-browser.html 的 7 项交互检查通过，覆盖立即告警、魔法棒旧楼层、格式修复／撤销、告警去重、预览后分支变化拒绝、生成中快照不更新、切换聊天隔离；tests/template-browser.html 原有 8 项检查通过。模拟 API 不能证明真实酒馆持久化或事件时序。

最终构建复验：`tests/runtime-browser.html?bundle=1` 使用实际 artifact/bundle.js，7 项交互再次通过、无 pageerror。390px 视口内管理器 clientWidth/scrollWidth 均为 350，无内部横向溢出，截图已人工目视检查（本地 artifacts/diagnostics-mobile.png）。JavaScript 语法、组件格式、git diff --check 通过；新旧组件除 content/info 外所有原有元数据逐项相等。离线脚本内容与 bundle 一致，最终 SHA-256 `F8C44E3B1A1ECBBCF80288B490EF8205EE50F0A4DAFB398AD4F13A5FE78CC46A`。

参考：MVU commit `61010dab47bc3a08a1b626320bf7fc8c9573eca4` 的 src/function/update_variables.ts（具体操作错误和通知）、src/button.ts（重处理／回放）；其酒馆助手子模块 `c1d0953` 的 src/panel/toolbox/variable_manager/Message.vue 和 MessageItem.vue（楼层浏览与消息变量）。本次为独立实现，没有引入 MVU、Vue 或变量编辑器依赖。

API 依据：已安装酒馆助手 4.9.5 的 `@types/function/chat_message.d.ts` 与 `src/function/chat_message.ts`，核对 `getChatMessages(...,{include_swipes:true})`、`swipe_id/swipes`、`setChatMessages([{message_id,message}],{refresh:'affected'})`；修复写回已实测。实机发现单靠生成事件配对会在宿主命令／编辑路径产生假忙碌，最终按已安装 `src/function/builtin.ts` 使用 `TavernHelper.builtin.duringGenerating()` 读取 SillyTavern `is_send_press`，事件状态仅作旧宿主回退。目标为 ST 1.18.0／酒馆助手 4.9.5，置信度 high。

指南收据：sillytavern-component-update 路由，快照 2026-08-18；A0 完整阅读并取得用户开工确认，A2/A6/B2 仅查阅入口适用边界，未从其旧版快照推定新 API。无设计／动效候选采用。

实机：SillyTavern 1.18.0／酒馆助手 4.9.5，专用 `LoreState-Unified-20260907` 角色与独立聊天，未调用模型。验证第 2、3、4 楼完整历史状态与逐轮差异；向第 4 楼注入独立 `&` 后，弹窗准确报告 `第 4 楼 · Shared · 原文第 1 行 53 列`，错误轮整批不应用并回退到第 3 楼。验证“查看诊断”直达错误楼层、`&amp;` 修复预览、真实消息写回、一次撤销备份、重载后状态与备份保留、撤销后错误恢复；最后用酒馆原生编辑恢复第 4 楼正确原文，确认状态重新回到森林且无 LoreState 控制台警告。测试结束时停用角色测试脚本和额外导入副本，恢复原有全局脚本开关。

实机过程中发现并修复两项问题：告警“查看诊断”原先保留上次浏览楼层；生成事件在宿主编辑路径中可能不配对，导致修复按钮永久误报忙碌。修正版重新装入同一角色脚本后，上述完整链路通过。

仍未实测：真实模型流式输出／中止、原生重抽与删尾组合、未加载的超长历史定位、聊天导出再导入、真实窄屏触控、长聊天性能、用户游玩卡。`realHostVerified` 表示本版新增核心诊断和修复链路已在目标宿主通过，不代表这些边界已完成，也不代表 driver-accepted。

## prototype-v0.4.0 · 2026-09-07

交付为 component 构建，远程导入固定 prototype-v0.4.0 标签，同时提供离线版。新版不兼容旧平面/人物协议或旧配置。

自动化：47 项 Node 测试通过，涵盖公共＋人物混合提交、失败整批回退、仅公共、仅人物、同名栏目作用域隔离、冷档与预取、回放、旧协议拒绝、预设 schema 比较与缄愿笔记构建。JavaScript 语法检查通过，离线脚本组件格式校验通过。

浏览器：tests/template-browser.html 的 8 项检查通过，包括一个公共区域、多个人物重复、冷档隐藏、无人状态、文本安全、非法 HTML 拒绝，以及通用/缄愿笔记模板 schema。320px 内嵌预览可显示换行内容；不替代完整移动端验收。

实机：SillyTavern 1.18.0 / 酒馆助手 4.9.5，专用 LoreState-Unified-20260907 角色，未调用模型。验证公共地点＋两人物初始化、同轮地点和衣着增量、人物离场及本地原文查阅、魔法棒无模式选择、保存后两条正则隐藏标签并保留正文、提示预览含公共＋在场完整文字＋冷档简短索引、另存/应用预设、重新读取、刷新后打开聊天恢复。磁盘快照包含统一 shared/people 结构，start 保持 1。

最终 bundle 已在测试卡重新加载，核对安装脚本内容与最终离线构建完全相等。随后实测错误人物字段导致公共地点也不提交，原生编辑 AI 标签后整轮重算成功。测试角色脚本结束时停用，旧全局脚本恢复原开关。未覆盖用户游玩卡。

未测：实际模型请求最终组装和语义服从、完整导出再导入、原生重抽/删尾的组合矩阵、长聊天、多设备。缄愿笔记专用组件只做构建/叙事保留/模板检查，尚未实装完整剧情。下一步验收为新聊天游玩。发布构建统一使用 LF 换行，避免跨平台 Git 换行转换导致校验和不一致。

以下各版本是历史证据，不代表 0.4.0 保持兼容。

## prototype-v0.3.0

40 项测试通过，覆盖新增人物、不同编号隔离、冷档保留、索引不泄漏完整字段、按编号/唯一姓名预取、同名歧义、冷档唤醒保护、原子批次、编辑/删尾回放与空档初始化。普通平面状态及预设原有测试继续通过。

实机：SillyTavern 1.18.0 / 酒馆助手 4.9.5，本地专用角色 LoreState-Memory-20260906。使用手工消息验证两人物显示、离场转入本地折叠区、唤醒保留原文、下一轮增量更新、刷新后重新打开聊天恢复、重新保存配置不改变回放起点。保存生成正则后，历史及新回复均保留正文并隐藏协议。磁盘聊天快照核对了完整冷热字段。

宿主提示词预览验证：无输入时冷档仅索引；输入 P01 后完整旧资料出现。尚未通过实际模型请求验证最终提示词组装或剧情服从性；没有调用模型。新增编辑/重抽/删除组合有离线回归，未逐项实机操作。角色卡和聊天导出再导入、移动端、长会话仍待验证。原有全局脚本设置已恢复，测试角色脚本在测试结束后停用，避免重复运行。

生成前若无法预取，冷档唤醒轮只恢复本地旧资料，下一轮再更新；不声称同轮补读。缄愿笔记和旧 WishBook 迁移继续后置。

## prototype-v0.2.0

新增随卡 HTML 预设管理；33 项自动测试和语法检查通过，两种脚本组件格式校验通过。旧配置迁移、栏目集合比较、重名拒绝、覆盖及删除保护有离线回归覆盖。切换不写聊天状态，只刷新现有状态的展示。

用户已反馈 v0.1.0 实机运行正常，保存时会自动添加正则。此反馈不代替 v0.2.0 新增预设按钮、重启保存及随卡导出再导入的真实宿主验收；后者仍待验证。升级时只替换原脚本 import 地址，保留脚本数据和 ID。

交付模式：component，仅酒馆助手脚本；未重打包角色卡。构建产物保留相同脚本 ID、按钮配置、数据随卡导出配置。

本地协议回归与 JavaScript 语法检查已通过。远程版只导入固定版本的 bundle；离线版包含同一份核心代码。两条局部正则分别过滤显示与提示词副本，不修改原始消息。

尚未完成：真实酒馆导入、远程模块执行、魔法棒交互、完整/增量消息显示、提示词实际发送、刷新恢复及角色卡导出再导入。这些不由本地测试或 CDN 下载成功代替。未进行真实模型调用。

原型使用单份 HTML、单层文字栏目，不含多预设和复杂人物取回。继续生成同一条消息可能产生多个更新块，目前不作为受支持流程。


## 0.6.0 快照候选验证（2026-09-07）

- `npm test`：56/56 通过；新增覆盖完整快照序列化、111 层无裁剪、去重、分支与编辑版本保留、删除后恢复、回档后的增量续写、损坏与不兼容快照拒绝、历史前缀变化检测。
- `npm run build`、`npm run check`、`git diff --check` 通过。
- 本地真实浏览器加载 `tests/runtime-browser.html?bundle=1&run=060b`，模拟宿主集成 12/12 通过；包括旧 UI 回归、回档不改正文、撤销、过期预览拒绝、保护续写后的进度、JSON 序列化后重启恢复且不重复归档。
- 本轮未执行真实 SillyTavern 导入或磁盘重载验证；不能将模拟宿主重启结果解释为宿主持久化保证。0.6.0 未推送、未发布远程标签，driver-accepted 未设置。

发布记录：用户已授权推送 0.6.0，主分支与 prototype-v0.6.0 标签同步发布；本版 realHostVerified 仍为 false。
