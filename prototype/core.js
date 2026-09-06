// Independent of SillyTavern: a small text-tag protocol for the author-flow prototype.
export const PROTO_KEY = 'lorestate_text_prototype_v1';
export const TAG_PATTERN = '<LoreState\\b[^>]*>[\\s\\S]*?<\\/LoreState>';
export function checkFields(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.length > 32 || new Set(fields).size !== fields.length) throw new Error('需要 1–32 个不同的栏目');
  for (const field of fields) if (!/^[\p{L}_][\p{L}\p{N}_-]{0,39}$/u.test(field) || ['__proto__','constructor','prototype','LoreState'].includes(field)) throw new Error(`栏目名称不支持：${field}`);
  return fields;
}
export function xmlText(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;'); }
function decode(value) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/.test(value)) throw new Error('文字里的 & 必须写成 &amp;');
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_, code) => {
    if (!code.startsWith('#')) return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[code];
    const point=code[1]==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
    if (point < 32 && ![9,10,13].includes(point) || point>0x10ffff || point>=0xd800&&point<=0xdfff) throw new Error('不支持的 XML 字符');
    return String.fromCodePoint(point);
  });
}
export function parseUpdate(source, fields) {
  checkFields(fields);
  if (typeof source!=='string' || source.length>200000) throw new Error('消息文字过长');
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if (blocks.length!==1 || (source.match(/<LoreState\b/g)||[]).length!==1) throw new Error('需要且只能有一段完整 LoreState 标签');
  const match=blocks[0][0].match(/^<LoreState\s+mode=(?:"(full|delta)"|'(full|delta)')\s*>([\s\S]*)<\/LoreState>$/);
  if(!match)throw new Error('LoreState 需要 mode="full" 或 mode="delta"');
  let rest=match[3].trim(); const changes=[];const seen=new Set();
  while(rest){
    const m=rest.match(/^<([\p{L}_][\p{L}\p{N}_-]*)(?:\s+action=(?:"(remove)"|'(remove)'))?\s*(?:\/>|>([^<]*)<\/\1>)/u);
    if(!m)throw new Error('栏目标签格式无效；原型只接受单层文字栏目');
    const name=m[1],remove=!!(m[2]||m[3]);
    if(!fields.includes(name)||seen.has(name))throw new Error(`未知或重复栏目：${name}`);
    seen.add(name);
    const value=decode(m[4]??'').trim();
    if(remove && value)throw new Error('移除标签不能同时提供新内容');
    if(!remove&&(!value||value.length>6000))throw new Error(`${name} 内容须为非空文字，最多 6000 字符`);
    changes.push({name,remove,value});rest=rest.slice(m[0].length).trim();
  }
  return {mode:match[1]||match[2],changes};
}
export function applyUpdate(previous, update, fields) {
  if(!previous && update.mode!=='full')throw new Error('尚未初始化，首次需要完整状态');
  if(previous && update.mode!=='delta')throw new Error('已有状态，请仅输出变化（delta）');
  if(update.mode==='full'&&(update.changes.length!==fields.length||update.changes.some(x=>x.remove)))throw new Error('首次完整状态必须包含全部栏目');
  const draft={...previous};
  for(const {name,remove,value} of update.changes){
    if(remove){if(!Object.hasOwn(draft,name))throw new Error(`无法移除不存在的栏目内容：${name}`);delete draft[name];}
    else draft[name]=value;
  }
  return draft;
}
export function replayText(messages, fields, start=1) {
  let state=null;const errors=[];const records=[];
  for(const message of messages){
    if(message.message_id<start||message.role!=='assistant'||message.is_hidden)continue;
    try {state=applyUpdate(state,parseUpdate(message.message,fields),fields);records.push({floor:message.message_id,state:{...state}});}
    catch(e){errors.push({floor:message.message_id,message:e.message});}
  }
  return {state,errors,records};
}
export function stateXml(state, fields) { return fields.filter(f=>Object.hasOwn(state??{},f)).map(f=>`<${f}>${xmlText(state[f])}</${f}>`).join('\n'); }
export function playPrompt(rules, fields, result) {
  const text=`LoreState 文字状态原型 v1\n以下是作者选择的状态栏规则：\n${rules}\n\n输出协议由下面的约定统一负责；作者规则中的全量复述要求仅表示显示完整，不要求每轮生成完整内容。\n正文结束后输出一个 <LoreState mode="${result.state?'delta':'full'}">…</LoreState>。栏目固定为：${fields.join('、')}。\n${result.state?'只输出变化的栏目；未提及保留。没有变化输出空的 delta 标签。':'首次必须为每个栏目提供完整文字。已知设定优先，缺少的内容允许合理补充，但不得凭空加入改变关键剧情的事实。'}\n每项写成 <栏目名>完整的新文字</栏目名>。列表暂时写成该栏目中的多行文字，变化时替换这一栏目。明确移除某项栏目内容时写 <栏目名 action="remove"/>；不使用省略表示删除。只更新剧情确实改变的内容。不要输出 HTML、JSON、脚本、旧状态栏模板或额外的状态块。文字中的 & 和 < 分别转义为 &amp; 和 &lt;。\n当前保存的状态（不代表本轮输出格式）：\n${result.state?stateXml(result.state,fields):'尚未建立'}\n${result.errors.length?'注意：之前有状态更新未应用。不要假定错误更新已经生效，依据正文与下列有效状态继续。':''}`;
  if(text.length>24000)throw new Error('状态与规则超过原型的 24000 字符预算');return text;
}
export function authorPrompt(rules) {
  return `请根据以下世界书状态栏条目，制作 LoreState 的完整 HTML 外观。只返回 HTML，不需要替我制作存储脚本。\n接口约定：每个文字栏目的展示节点使用 data-lore-field="中文栏目名"。名字须为文字开头，随后只含文字、数字、下划线或连字符，不能含空格。最多32个栏目。脚本将以 textContent 填入完整状态，因此绑定节点中不要放标签标题或嵌套的绑定节点；标题放在旁边。可用 CSS 和 details/summary 折叠，不使用 JavaScript、事件属性、外部资源、表单、iframe、SVG、网络请求。CSS 写在 style 标签中，适应窄屏，文字可换行。数值作为文字展示即可。不要使用 {{变量}} 或要求 AI 每轮重写 HTML。人物/物品等列表在本原型中作为一个栏目的多行文字展示。除 data-lore-field 外，不需要额外配置。\n最小例子：<section><h3>地点</h3><p data-lore-field="地点"></p></section>\n以下是状态栏条目：\n${rules}`;
}
