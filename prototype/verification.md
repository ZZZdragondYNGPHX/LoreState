# LoreState 当前验证记录 · 0.12.3

本文件只维护**当前固定版**的验证入口。旧版本的发布时证据保留在 `docs/发布材料/` 与 Git 历史中，不再把多代“当前验证”全文重复堆叠在这里。

基底：`main / d7091ceccb164dbd04f440413956980a2188d682`（0.12.2）。当前固定入口为不可移动标签 **`0.12.3`**。

## 0.12.3 · 配置重置与多协议 API

当前发布记录：

- build、固定版 build、check：通过；main 与 0.12.3 的 loader/receipt/bundle 对齐。
- Node：**146 / 146** 通过。
- 浏览器：Template **29**、最终 bundle 模拟宿主 **103**、EJS **13**，合计 **145** 项通过。
- 新增回归覆盖：配置删除范围、同脚本换栏目、旧聊天配置代次隔离、默认值和 ultra 保存、当前/指定酒馆预设桥接、三种直连协议、SSE/普通响应、取消与迟到保护、重置后先绑定模型再初始化。
- 保留 0.12.2 控制中心、外观生成、快照、截断恢复、隐藏楼层与 EJS 回归。

bundle SHA-256：`80dae6047a5b0cd2f658385c0abe87b44c85184ff13be090c111b839bb6e0276`。

## 未完成的真实环境验收

自动化不等于真实宿主。当前仍应在独立测试环境核对：

1. 实际 SillyTavern / Tavern Helper 版本与真实加载 ref；
2. 非第一条世界书绑定、刷新、规则配置 ↔ 外观制作切页；
3. full → delta、冷热档、read receipt、重抽/删尾/回档/隐藏楼层；
4. 0.12.3 “彻底删除旧配置 → 重建栏目 → 重新启用”及旧聊天隔离；
5. Chat Completions、Responses、Anthropic 的真实服务、鉴权、CORS、SSE 与取消；
6. 当前/指定酒馆提示词预设桥接在真实宿主事件时序下的表现；
7. 目标模型对 `reasoning_effort` / `reasoning.effort` / Anthropic effort 的实际支持；
8. EJS 在用户实际 ST-Prompt-Template 版本、扩展顺序与 sandbox/worker 组合下的最终提示词；
9. 手机窄屏、软键盘、触控、字体放大；
10. 长聊天持久化与真实模型遵循率。

当前 receipt 保持 `realHostVerified=false`；未设置 `driver-accepted`。

## 历史发布证据

- [0.12.2 · 浅色控制中心](../docs/发布材料/0.12.2-浅色控制中心.md)
- [0.12.1 · 条目绑定修复](../docs/发布材料/0.12.1-条目绑定修复.md)
- [0.12.0 · EJS 动态世界书](../docs/发布材料/0.12.0-EJS动态世界书.md)
- [0.11.1 · 外观制作台](../docs/发布材料/0.11.1-外观制作台.md)
- [0.11.0 · Template API v2](../docs/发布材料/0.11.0-Template-API-v2.md)
- [0.10.6 · 楼层布局兼容](../docs/发布材料/0.10.6-楼层布局兼容.md)
- 更早 prototype-v0.x / 旧原生扩展：见 [历史文档归档](../docs/archive/README.md) 与 Git 历史。

当前发布详情：[0.12.3 发布说明](../docs/发布材料/0.12.3-配置重置与多协议API.md) · [文档目录](../docs/README.md) · [开发说明](../docs/开发说明.md) · [当前交接](../交接文档.md)
