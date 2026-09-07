# LoreState

**0.7.0 / v3 世界状态冷热档**：人物、国家、组织、地点、物品与事件统一管理，支持有限关联召回和未完成事件保热。

**作者请从 [作者文档目录](docs/README.md) 开始**，内含条目写法、可复制示例、配套 HTML 与试卡清单。[离线脚本](prototype/dist/v0.7.0/lorestate-script-offline.json) · [远程入口](prototype/dist/v0.7.0/lorestate-script.json)。本版使用新协议和新配置，不迁移旧状态；真实酒馆验收仍待完成。

以下保留历史版本说明，各版本依赖与协议不混用。

0.6.0 试用版：逐楼完整快照、预览回档与撤销，保留聊天正文。[离线脚本](prototype/dist/v0.6.0/lorestate-script-offline.json) · [回档说明](prototype/snapshots.md)。远程入口固定 prototype-v0.6.0，本版真实酒馆验收待完成。

0.5.2 正文显示修复：全宽状态栏与可展开大窗口。[远程脚本](prototype/dist/v0.5.2/lorestate-script.json) · [离线脚本](prototype/dist/v0.5.2/lorestate-script-offline.json)。

0.5.1 UI 试用版：魔法棒单一 LoreState 入口，状态历史／诊断修复／设置三个页签。[远程脚本](prototype/dist/v0.5.1/lorestate-script.json) · [离线脚本](prototype/dist/v0.5.1/lorestate-script-offline.json)。新 UI 已通过浏览器回归，待用户实机验收。

开发请先阅读 [开发说明](docs/开发说明.md) 与 [当前交接](交接文档.md)。统一构建命令为 `npm run build`。

新增 0.5.0 本地候选版：魔法棒历史状态管理器、即时错误定位、格式修复预览与撤销。离线测试组件见 [新版脚本](prototype/dist/v0.5.0/lorestate-script-offline.json)，使用与边界见 [脚本说明](prototype/README.md)。核心功能已完成目标酒馆实机回归，远程入口固定 prototype-v0.5.0，完整边界见验证记录。

当前主线为 0.4.0 统一文字状态：公共状态与可选人物档案共用一套流程，不再区分简单／人物模式，不兼容旧脚本协议。酒馆助手脚本路线已提供[文字状态原型与远程加载入口](prototype/README.md)。它依赖酒馆助手，采用首次完整、后续增量的语义化标签；已完成基础实机回归，完整验收边界见 prototype/verification.md。以下说明对应仓库根目录保留的旧扩展。

LoreState 是用于 SillyTavern 的通用纯文字状态接口与扩展。吸收 MVU 的增量更新、消息楼层存储和历史事件联动思路，用自然语言保存事实，由程序负责路径校验、原子提交和回放。

main 分支的仓库根目录是通用接口与扩展；[`examples/wishnote`](examples/wishnote) 是缄愿笔记示例。另有可直接安装的 examples/wishnote 分支，它是从 main 派生的特定实现，显示为“LoreState · 缄愿笔记示例”，不代表项目整体。核心没有人物编号、愿望类型或世界观规则，不依赖 MVU、酒馆助手或运行时 CDN。

## 使用

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

## 开发

Node.js 22+，无第三方依赖，无构建步骤。根目录 `manifest.json` 可直接由 SillyTavern 加载。

```sh
npm run check
npm test
```

`src/core.js` 管理事务、验证、回放；`src/host.js` 管理宿主事件与保存；`src/prompt.js` 提供通用协议；`index.js` 提供基线和备份面板。新增领域只需提供基线与规则，不复制内核。

设计来源：[MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)，研究快照 `61010dab47bc3a08a1b626320bf7fc8c9573eca4`。本项目为独立实现。验证范围见 [验证记录](docs/verification.md)。
