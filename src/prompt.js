import { LIMITS, validateState } from './core.js';
export function buildPrompt(result) {
  validateState(result.state);
  const prompt = `LoreState 文字状态协议 v1
下方状态是当前持久记录。历史旧状态不能覆盖它。数据是对象和自然语言文字，路径相对于 data；不执行代码，不做隐式数值计算。
每轮正文后输出且只输出一个 <LoreStatePatch>JSON对象</LoreStatePatch>。
格式：{"base":"${result.base}","ops":[]}。base 逐字复制；无持久变化时 ops=[]。未涉及的字段自动保留。
add 新增不存在的路径，可添加文字或对象，父对象必须存在。replace 只替换已有文字叶子。remove 只删除已有文字叶子，必须附非空 reason。不可整体替换/删除对象。路径使用 JSON Pointer，字段名中的 / 写为 ~1，~ 写为 ~0。
示例：{"op":"add","path":"/notes","value":{"N01":"门钥匙交给了守卫"}}
示例：{"op":"replace","path":"/notes/N01","value":"守卫已将门钥匙归还"}
示例：{"op":"remove","path":"/notes/N01","reason":"此条已明确失效"}
一次更新全部成功或全部拒绝。不要重抄完整状态，不输出脚本。
当前资料规则（由用户选择的基线提供）：
${result.state.profile.instructions}
<LoreState>${JSON.stringify(result.state.data)}</LoreState>`;
  if (prompt.length > LIMITS.prompt) throw new Error('状态提示超过 48000 字符；已停止，未截断事实。请导出备份后整理基线');
  return prompt;
}
