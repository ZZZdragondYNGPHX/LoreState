// Independent of SillyTavern: a small text-tag protocol for the author-flow prototype.
export const PROTO_KEY = 'lorestate_unified_v1';
export const TAG_PATTERN = '<LoreState\\b[^>]*>[\\s\\S]*?<\\/LoreState>';
export function checkFields(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.length > 32 || new Set(fields).size !== fields.length) throw new Error('需要 1–32 个不同的栏目');
  for (const field of fields) if (!/^[\p{L}_][\p{L}\p{N}_-]{0,39}$/u.test(field) || ['__proto__','constructor','prototype','LoreState','Shared','Person'].includes(field)) throw new Error(`栏目名称不支持：${field}`);
  return fields;
}
export function xmlText(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;'); }
export function decode(value) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/.test(value)) throw new Error('文字里的 & 必须写成 &amp;');
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_, code) => {
    if (!code.startsWith('#')) return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[code];
    const point=code[1]==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
    if (point < 32 && ![9,10,13].includes(point) || point>0x10ffff || point>=0xd800&&point<=0xdfff) throw new Error('不支持的 XML 字符');
    return String.fromCodePoint(point);
  });
}
function parseFields(source, fields, mode) {
  checkFields(fields);
  let rest=source.trim(); const changes=[];const seen=new Set();
  while(rest){
    try {
    const m=rest.match(/^<([\p{L}_][\p{L}\p{N}_-]*)(?:\s+action=(?:"(remove)"|'(remove)'))?\s*(?:\/>|>([^<]*)<\/\1>)/u);
    if(!m)throw new Error('栏目标签格式无效；原型只接受单层文字栏目');
    const name=m[1],remove=!!(m[2]||m[3]);
    if(!fields.includes(name)||seen.has(name))throw new Error(`未知或重复栏目：${name}`);
    seen.add(name);
    const value=decode(m[4]??'').trim();
    if(remove && value)throw new Error('移除标签不能同时提供新内容');
    if(!remove&&(!value||value.length>6000))throw new Error(`${name} 内容须为非空文字，最多 6000 字符`);
    changes.push({name,remove,value});rest=rest.slice(m[0].length).trim();
    } catch(error) { error.fragment=rest.slice(0,160); throw error; }
  }
  return {mode,changes};
}
function applyFields(previous, update, fields) {
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
export function checkSchema(schema) {
  if(!schema || !Array.isArray(schema.shared) || !Array.isArray(schema.person))throw new Error('需要公共栏目与人物栏目定义');
  for(const fields of [schema.shared,schema.person])if(fields.length)checkFields(fields);
  if(!schema.shared.length&&!schema.person.length)throw new Error('至少需要一个文字栏目');
  return schema;
}
export function stateXml(state, fields) { return fields.filter(f=>Object.hasOwn(state??{},f)).map(f=>`<${f}>${xmlText(state[f])}</${f}>`).join('\n'); }
const PERSON_LIMIT=100;
function personAttributes(source){
  const attrs={};let rest=source.trim();
  while(rest){
    const m=rest.match(/^([a-z]+)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')(?:\s+|$)/);
    if(!m||!['id','name','identity','mode','presence'].includes(m[1])||Object.hasOwn(attrs,m[1]))throw new Error('人物属性无效或重复');
    attrs[m[1]]=decode(m[2]??m[3]);rest=rest.slice(m[0].length);
  }
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(attrs.id??'')||['constructor','prototype','__proto__'].includes(attrs.id))throw new Error('人物编号无效');
  if(!['full','delta'].includes(attrs.mode))throw new Error('人物需要 full 或 delta');
  if(attrs.presence!==undefined&&!['active','cold'].includes(attrs.presence))throw new Error('人物出入场值无效');
  for(const [key,limit] of [['name',80],['identity',200]])if(attrs[key]!==undefined&&(!attrs[key].trim()||attrs[key].length>limit))throw new Error('姓名或识别信息长度无效');
  return attrs;
}
function applyStateInternal(previous,source,schema){
  checkSchema(schema);
  if(typeof source!=='string'||source.length>200000)throw new Error('消息过长');
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.length!==1||(source.match(/<LoreState\b/g)||[]).length!==1)throw new Error('需要且只能有一个 LoreState 更新块');
  const wrapper=blocks[0][0].match(/^<LoreState\s+version="2"\s+mode="(full|delta)">([\s\S]*)<\/LoreState>$/);
  if(!wrapper||wrapper[1]!== (previous?'delta':'full'))throw new Error('需要 version="2" 的统一协议：首次 full，之后 delta');
  const draft=structuredClone(previous??{version:2,shared:{},people:{}}),seen=new Set();let rest=wrapper[2].trim(), sharedSeen=false;
  while(rest){
    try {
    if(rest.startsWith('<Shared>')){
      const shared=rest.match(/^<Shared>([\s\S]*?)<\/Shared>/);
      if(!shared||sharedSeen||!schema.shared.length)throw new Error('公共状态重复、未配置或格式错误');
      draft.shared=applyFields(previous?draft.shared:null,parseFields(shared[1],schema.shared,wrapper[1]),schema.shared);
      sharedSeen=true;rest=rest.slice(shared[0].length).trim();continue;
    }
    if(!schema.person.length)throw new Error('未配置人物栏目');
    const m=rest.match(/^<Person\s+([^<>]*?)(?:\/>|>([\s\S]*?)<\/Person>)/);
    if(!m)throw new Error('人物更新格式无效');
    const attrs=personAttributes(m[1]),body=m[2]??'',old=draft.people[attrs.id];
    if(seen.has(attrs.id))throw new Error('同轮人物编号重复');seen.add(attrs.id);
    const patch=parseFields(body,schema.person,attrs.mode);
    if(!old){
      if(!attrs.name||!attrs.identity)throw new Error('新人物需要姓名与稳定识别信息');
      draft.people[attrs.id]={id:attrs.id,name:attrs.name,identity:attrs.identity,presence:attrs.presence??'active',fields:applyFields(null,patch,schema.person)};
    }else{
      if(attrs.mode!=='delta')throw new Error('已有编号不能重新 full 覆盖');
      if(attrs.name!==undefined&&attrs.name!==old.name||attrs.identity!==undefined&&attrs.identity!==old.identity)throw new Error('已有编号的姓名与识别信息不能被重新指派');
      // A waking character's old memory must survive the turn that requests retrieval.
      if(old.presence==='cold'&&patch.changes.length)throw new Error('冷档人物先用空 delta 唤醒，下一轮读取资料后再更新');
      old.fields=applyFields(old.fields,patch,schema.person);old.presence=attrs.presence??old.presence;
    }
    rest=rest.slice(m[0].length).trim();
    } catch(error) {
      error.scope=rest.startsWith('<Shared>')?'Shared':`Person ${rest.match(/\bid=["']([^"']+)/)?.[1]??'未知编号'}`;
      error.fragment??=rest.slice(0,160);
      error.offset=source.indexOf(rest)+Math.max(0,rest.indexOf(error.fragment));throw error;
    }
  }
  if(!previous&&schema.shared.length&&!sharedSeen)throw new Error('首次需要完整 Shared 公共状态');
  if(Object.keys(draft.people).length>PERSON_LIMIT||JSON.stringify(draft).length>1000000)throw new Error('人物记忆超过本地容量限制');
  return draft;
}
export function applyState(previous,source,schema){
  try{return applyStateInternal(previous,source,schema);}catch(error){
    const blockStart=typeof source==='string'?source.indexOf('<LoreState'):-1;
    const offset=error.offset??blockStart;
    if(offset>=0){const lines=source.slice(0,offset).split('\n');error.line=lines.length;error.column=lines.at(-1).length+1;}
    throw error;
  }
}
export function repairHint(message){
  if(message.includes('&'))return '文字中的独立 & 应转义为 &amp;。可预览基础格式修复。';
  if(message.includes('未知或重复栏目'))return '核对栏目名称与 HTML 配置；同一范围内每个栏目只能出现一次。';
  if(message.includes('冷档'))return '先用空 delta 唤醒人物，下一轮读取旧资料后再更新。';
  if(message.includes('full')||message.includes('完整'))return '首次使用 version="2" mode="full"；已初始化后使用 delta。新人物须填写全部人物栏目。';
  if(message.includes('更新块'))return '检查是否缺失、未闭合或重复输出 LoreState 更新块；保留唯一完整更新块。';
  return '核对错误位置附近的标签、人物编号与栏目内容，修正原始消息后重新校验。';
}
export function replayState(messages,schema,start=1,seed=null){
  checkSchema(schema);let state=structuredClone(seed?.state??null),lastGoodFloor=seed?.lastGoodFloor??null,lastAppliedFloor=seed?.lastAppliedFloor??null;const errors=structuredClone(seed?.errors??[]);
  for(const m of messages){if(m.message_id<start||m.role!=='assistant'||m.is_hidden)continue;
    try{state=applyState(state,m.message,schema);lastAppliedFloor=m.message_id;if(!errors.length)lastGoodFloor=m.message_id;}
    catch(e){errors.push({floor:m.message_id,message:e.message,scope:e.scope??'LoreState',line:e.line??null,column:e.column??null,hint:repairHint(e.message)});}}
  return {state,errors,lastGoodFloor,lastAppliedFloor,tainted:errors.length>0};
}
export function stateChanges(before,after){
  const changes=[];
  function visit(a,b,path){
    if(JSON.stringify(a)===JSON.stringify(b))return;
    if((a&&typeof a==='object')||(b&&typeof b==='object')){
      for(const key of new Set([...Object.keys(a??{}),...Object.keys(b??{})]))visit(a?.[key],b?.[key],[...path,key]);
    }else changes.push({path:path.join(' / '),kind:a===undefined?'新增':b===undefined?'删除':'修改',before:a??null,after:b??null});
  }
  for(const scope of ['shared','people'])visit(before?.[scope],after?.[scope],[scope]);return changes;
}
export function inspectFloor(messages,schema,start,floor){
  const target=messages.find(m=>m.message_id===floor&&m.role==='assistant'&&!m.is_hidden);
  if(!target)throw new Error('目标 AI 楼层不存在或已隐藏，请刷新楼层列表');
  const before=replayState(messages.filter(m=>m.message_id<floor),schema,start);
  const result=replayState(messages.filter(m=>m.message_id<=floor),schema,start);
  return {...result,floor,source:target.message,changes:stateChanges(before.state,result.state),error:result.errors.find(e=>e.floor===floor)??null,excluded:floor<start};
}
// Only repair unescaped ampersands in text nodes of one complete update block.
// The caller must preview, validate and explicitly apply; never guess missing facts.
export function proposeRepair(source){
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.length!==1)return null;
  const block=blocks[0],fixed=block[0].replace(/>([^<]*)</g,(_,text)=>'>'+text.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/g,'&amp;')+'<');
  return fixed===block[0]?null:source.slice(0,block.index)+fixed+source.slice(block.index+block[0].length);
}
export function projectPeople(state,text=''){
  const people=Object.values(state?.people??{}),full=[],index=[],retrieved=[];
  for(const person of people){
    const idPattern=new RegExp(`(^|[^A-Za-z0-9_-])${person.id}($|[^A-Za-z0-9_-])`);
    const uniqueName=people.filter(p=>p.name===person.name).length===1;
    const mentioned=idPattern.test(text)||(uniqueName&&person.name.length>=2&&text.includes(person.name));
    if(person.presence==='active'||mentioned){full.push(person);if(person.presence==='cold')retrieved.push(person.id);}
    else index.push({id:person.id,name:person.name,identity:person.identity});
  }
  return {full,index,retrieved};
}
export function playPrompt(rules,schema,result,text=''){
  checkSchema(schema);const projection=projectPeople(result.state,text);
  const prompt=`LoreState 统一文字状态 v2。作者规则：\n${rules}

下面的协议负责状态存储，替代规则内旧的全量复述要求。正文末尾仅输出一个 <LoreState version="2" mode="${result.state?'delta':'full'}">…</LoreState>。首次 full，以后 delta；没有变化输出空的 delta 外层。
${schema.shared.length?`公共栏目：${schema.shared.join('、')}。写在 <Shared>栏目标签</Shared> 内。首次包含所有公共栏目，之后仅写变化栏目；没变化可省略整个 Shared。`:'本卡没有公共栏目，不输出 Shared。'}
${schema.person.length?`人物栏目：${schema.person.join('、')}。新人物用 <Person id="P01" name="姓名" identity="稳定识别信息" mode="full" presence="active">全部人物栏目标签</Person>。已有编号用 <Person id="P01" mode="delta">变化栏目</Person>。编号稳定唯一，姓名与识别信息不能重新指派；无人物时可省略 Person。
人物离场用 <Person id="P01" mode="delta" presence="cold"/>，回归用 <Person id="P01" mode="delta" presence="active"/>。离场资料保留本地，冷档唤醒这一轮不修改栏目，下一轮读取完整资料后再改。出入场默认由剧情决定；不另建编号替代旧人。`:'本卡没有人物栏目，不输出 Person。'}
每项写成 <栏目名>完整新文字</栏目名>；一个栏目可包含多行文字，不嵌套标签。遗漏保留；明确移除栏目内容用 <栏目名 action="remove"/>。只更新剧情确实改变的内容，缺少初值可在符合设定的情况下合理补充。不要输出 HTML、JSON、脚本或其他状态块。文字中的 & 和 < 转义为 &amp; 和 &lt;，属性中的引号也要转义。
当前有效公共状态：
${result.state?stateXml(result.state.shared,schema.shared)||'无公共栏目':'尚未建立'}
在场及本轮取回的完整人物资料：
${projection.full.map(p=>`<Person id="${p.id}" name="${xmlText(p.name)}" identity="${xmlText(p.identity)}" presence="${p.presence}">\n${stateXml(p.fields,schema.person)}\n</Person>`).join('\n')||'无'}
离场人物索引：${JSON.stringify(projection.index)}
本轮按输入取回：${projection.retrieved.join('、')||'无'}（不自动改变在场状态）。索引不是完整记忆，不可据此编造旧事实。临时召回未提供资料的人物时，本轮只登记唤醒，依赖旧事实的情节留到下一轮，不得声称已读冷档。
${result.errors.length?'之前存在未应用更新，以这份有效状态为准。':''}`;
  if(prompt.length>24000)throw new Error('规则与当前状态超过 24000 字符预算，请缩短栏目或减少在场人物');return prompt;
}
export function authorPrompt(rules){
  return `请根据以下状态栏条目制作 LoreState 的完整静态 HTML，只返回 HTML。
公共栏目直接用 data-lore-field="栏目名"。需要逐个人物展示时，使用一个 data-lore-person 容器，容器内的 data-lore-field 属于人物栏目；脚本按在场人物自动复制容器，不需要写循环。公共和人物可以只选其一，也可以并用，无需选择脚本模式。
人物容器内可用独立文字节点 data-lore-name、data-lore-id、data-lore-identity 展示姓名、编号、识别信息。每个绑定节点只放文字，不包含标题或其他绑定节点。人物容器只能有一个，不能嵌套。栏目名以文字或下划线开头，其后仅文字、数字、下划线或连字符，每类最多 32 个；栏目值为普通文字。
示例：<section><h3>地点</h3><p data-lore-field="地点"></p></section><article data-lore-person><h3 data-lore-name></h3><p data-lore-field="近况"></p></article>
使用 CSS 和 details/summary，适应窄屏和长文字。CSS 放 style 中，不使用 JavaScript、事件属性、外部资源、表单、iframe、SVG 或网络请求。不使用 {{变量}}，也不要求 AI 每轮重写 HTML。内容由脚本以 textContent 填入。
状态栏条目：\n${rules}`;
}
