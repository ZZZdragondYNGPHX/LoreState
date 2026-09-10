# LoreState

LoreState 为 SillyTavern 文字角色卡保存持续状态。AI 在正文后输出状态更新，脚本负责校验、合并、历史回放与状态栏展示。人物、国家、组织、地点、物品和事件可以使用各自的栏目；冷档按需读取。

当前维护的是 **0.9.0 模块条目脚本**，依赖酒馆助手。`main` 已加入 **2026-09-10 隐藏楼层兼容修复**：旧楼层不发送给 AI 时，其中的状态更新仍参与本地回放。隐藏助手可以继续使用。

## 从这里开始

- **[作者文档目录](docs/README.md)**：入门顺序、模块条目、HTML 与试卡清单。
- [0.9.0 模块条目与试卡](docs/0.9.0模块条目与试卡.md)：新卡配置和可复制示例。
- **[隐藏助手兼容与更新](docs/隐藏助手兼容与更新.md)**：已有聊天恢复、脚本更新和验收。
- [当前脚本代码](artifact/bundle.js)：用于替换现有脚本代码，保留脚本 ID 和配置。
- [常见问题与试卡清单](docs/常见问题与试卡清单.md)。

## 下载与版本边界

| 入口 | 内容 |
| --- | --- |
| [main 脚本代码](artifact/bundle.js) | 包含隐藏兼容修复；分支会继续变化 |
| [0.9.2 离线组件](prototype/dist/v0.9.2/lorestate-script-offline.json) | 固定 0.9.2，包含隐藏楼层兼容修复 |
| [0.9.2 远程入口](prototype/dist/v0.9.2/lorestate-script.json) | 固定 `prototype-v0.9.2`，稳定版本 |
| [main 分支脚本代码](https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/artifact/bundle.js) | 最新开发版，可能随主分支变化 |

已有 **0.9.0** 配置和聊天可以保留，只更新脚本代码后重新读取状态。跨旧版本升级到模块结构仍须按 0.9.0 指南使用新配置、新聊天；这次修复没有增加旧协议迁移。

目标环境沿用 SillyTavern 1.18.0 / 酒馆助手 4.9.5。修复通过 92 项 Node 测试、11 项模板浏览器检查和 33 项模拟宿主检查；实际酒馆安装、真实模型及游玩验收仍待完成。详见[验证记录](prototype/verification.md)。

## 开发

Node.js 22+。从[开发说明](docs/开发说明.md)和[当前交接](交接文档.md)进入。源码在 `prototype/`，分发代码在 `artifact/bundle.js`；发布前须核对构建版本和固定标签，不能覆盖旧标签或把旧分发目录当作最新修复版。

## 历史：旧原生扩展

以下说明属于仓库根目录 `src/`、`index.js` 和 `manifest.json` 的旧原生扩展，不是上面的酒馆助手脚本安装流程。旧协议与当前 v3 不混用。

LoreState 是用于 SillyTavern 的通用纯文字状态接口与扩展。吸收 MVU 的增量更新、消息楼层存储和历史事件联动思路，用自然语言保存事实，由程序负责路径校验、原子提交和回放。

main 分支的仓库根目录是通用接口与扩展；[`examples/wishnote`](examples/wishnote) 是缄愿笔记示例。另有可直接安装的 examples/wishnote 分支，它是从 main 派生的特定实现，显示为“LoreState · 缄愿笔记示例”，不代表项目整体。核心没有人物编号、愿望类型或世界观规则，不依赖 MVU、酒馆助手或运行时 CDN。

## 旧原生扩展使用

需要 SillyTavern 1.18.0 或更高版本及 manifest 声明的宿主能力。将本仓库安装为 UI 扩展，刷新后打开角色聊天，点击输入框旁的 **魔法棒 → LoreState**。在“基线设置”中粘贴基线 JSON，或选择示例的 `baseline.json`，预览并确认。

```json
{
  "schemaVersion": 1,
  "profile": {"id": "my-world", "instructions": "记录地点和长期有效的事实。"},
  "data": {"places": {"harbor": {"description": "商会管理的潮汐港"}}}
}
```

`data` 接受对象和非空文字。金额可写“拥有一百枚银币”，不需要数值变量。对象键作为稳定路径；不用数组下标，减少删除引起的编号漂移。`profile.instructions` 是用户定义的领域提示规则，**不是可执行校验器**。当前版本验证结构与操作安全，不自动验证叙事因果、跨记录引用或愿望语义。

模型每轮在正文后输出：

```text
<LoreStatePatch>{"base":"复制注入提示中的标识","ops":[{"op":"replace","path":"/places/harbor/description","value":"居民议会接管的潮汐港"}]}</LoreStatePatch>
```

路径相对于 `data`。支持 `add`、`replace`、`remove`；替换和删除限于文字叶子，删除需要 `reason`。新增对象时父路径必须存在。无变化时 `ops: []`。整批操作全部成功才提交，遗漏字段保持原样。不是完整 JSON Patch 实现，也不执行模型代码。

如需隐藏正文中的更新块，可手动导入 `assets/display-regex.json`；它仅作用于显示侧，原始消息协议仍保留。

## 历史与恢复

- 数据只写 `chatMetadata.lorestate_v1` 和消息 `extra.lorestate_v1`，按当前选中回复回放。
- 删除尾部回退；编辑历史使后续 base 失效，错误轮停止提交和生成。可修正回复或明确忽略该轮。
- 导出备份包含校验和；恢复先预览，再在当前最后一层建立新基线。新基线之前的更新不再重放。
- 完整文字注入上下文；超过 48000 字符停止生成，不静默压缩。暂不提供按需冷档投影。
- 不支持同一回复“继续生成”；使用下一轮或重抽。状态提示里的领域规则应与角色卡和世界书保持一致。
- 宿主保存接口返回不等于磁盘持久化保证；重要节点导出，并刷新核对。

旧 WishNote 扩展使用不同命名空间。迁移时先导出旧备份，运行示例转换工具，在旧面板停用本聊天，再在 LoreState 导入。主扩展不会自动改写旧数据。

## 旧原生扩展开发

Node.js 22+，无第三方依赖，无构建步骤。根目录 `manifest.json` 可直接由 SillyTavern 加载。

```sh
npm run check
npm test
```

`src/core.js` 管理事务、验证、回放；`src/host.js` 管理宿主事件与保存；`src/prompt.js` 提供通用协议；`index.js` 提供基线和备份面板。新增领域只需提供基线与规则，不复制内核。

设计来源：[MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)，研究快照 `61010dab47bc3a08a1b626320bf7fc8c9573eca4`。本项目为独立实现。验证范围见 [验证记录](docs/verification.md)。
