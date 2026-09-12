# LoreState｜让纯文字状态栏记住上一轮 · 0.10.4 原型试用

做纯文字卡时，我遇到过一个问题：状态栏明明只变了一两项，AI 却要每轮把整张状态表重新写一遍。越写越长，也容易漏掉前面的内容。

于是做了 LoreState：第一次写完整状态，以后只写变化，由脚本保存并合并，在最新 AI 回复旁显示完整状态栏。

比如上一轮是「地点：酒馆，衣着：斗篷，身体状况：有些疲惫」，这一轮只换了雨衣，AI 就只更新衣着。地点和身体状况仍然保留。

**作者可以把心思放在状态栏写什么、长什么样。** 用文字写好世界书中的状态规则，再把脚本提供的提示词交给网页 AI 制作 HTML，粘贴回来即可预览、保存。随帖附了一份能直接使用的模板。

**当前能做什么**

- 首次完整记录，后续按栏目增量更新；内容以自然语言保存。
- 最新 AI 回复旁显示完整状态，历史正文继续保留。
- 保存时自动添加两条正则，分别隐藏显示标签、过滤历史提示词标签；当前状态单独提供给模型，HTML 不发送给模型。
- 最多 20 份随卡 HTML 预设，在相同栏目之间换样式。
- 更新格式错误时保留有效状态；可编辑原始 AI 消息里的标签进行纠错。

增量减少的是反复生成状态栏和携带历史标签的冗余；当前完整文字状态仍会进入上下文，实际 token 变化取决于卡和聊天内容。

当前稳定脚本为不可移动标签 `0.10.4`；`main` 是持续更新的开发入口。稳定安装不会随 `main` 的后续提交变化。

**安装**

需要酒馆助手。可以导入下面的远程脚本 JSON，也可以在酒馆助手中新建角色脚本，填入：

```js
import 'https://cdn.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@0.10.4/artifact/bundle.js';
```

**main 分支（最新开发版）**

```js
import 'https://cdn.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@main/artifact/bundle.js';
```

启用后从 **魔法棒 → LoreState · 原型设置** 打开。手动新建脚本的作者需要开启脚本数据随卡导出；导入版已配置。

[远程版脚本 JSON · 0.10.4](https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/tags/0.10.4/prototype/dist/0.10.4/lorestate-script.json)
[main 远程版脚本 JSON · 持续更新](https://github.com/ZZZdragondYNGPHX/LoreState/raw/refs/heads/main/prototype/dist/main/lorestate-script.json)
[main 分支脚本代码 · 持续更新](https://github.com/ZZZdragondYNGPHX/LoreState/blob/main/artifact/bundle.js)
[项目仓库](https://github.com/ZZZdragondYNGPHX/LoreState)

**适用范围**

适合地点、衣着、身体状况、待办、关系描述等文字栏目，也支持按模块记录人物、物品、国家等实体并按需读取冷档。当前 HTML 支持静态 HTML/CSS 和折叠；不支持自定义 JavaScript、外部图片与字体、复杂嵌套变量、自动数值计算、语义召回或后台模拟。列表按一个栏目的多行文字保存，变化时更新整项。

这是原型试用版。隐藏楼层兼容已通过本地自动化及模拟宿主回归，真实酒馆和实际模型仍需作者验收。欢迎先用测试卡尝试，反馈时附上脚本版本、操作步骤和去除隐私后的错误标签。

配套附件：状态栏模板 HTML、世界书条目文本、作者改造教程。
