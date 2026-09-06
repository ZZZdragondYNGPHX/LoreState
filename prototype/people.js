import { TAG_PATTERN, checkFields, decode, parseUpdate, applyUpdate, stateXml, xmlText } from './core.js';

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
export function applyPeople(previous,source,fields){
  checkFields(fields);
  if(typeof source!=='string'||source.length>200000)throw new Error('消息过长');
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.length!==1||(source.match(/<LoreState\b/g)||[]).length!==1)throw new Error('需要且只能有一个 LoreState 更新块');
  const wrapper=blocks[0][0].match(/^<LoreState\s+mode="(full|delta)">([\s\S]*)<\/LoreState>$/);
  if(!wrapper||wrapper[1]!== (previous?'delta':'full'))throw new Error('人物记忆首次 full，之后 delta');
  const draft=structuredClone(previous??{version:1,people:{}}),seen=new Set();let rest=wrapper[2].trim();
  while(rest){
    const m=rest.match(/^<Person\s+([^<>]*?)(?:\/>|>([\s\S]*?)<\/Person>)/);
    if(!m)throw new Error('人物更新格式无效');
    const attrs=personAttributes(m[1]),body=m[2]??'',old=draft.people[attrs.id];
    if(seen.has(attrs.id))throw new Error('同轮人物编号重复');seen.add(attrs.id);
    const patch=parseUpdate(`<LoreState mode="${attrs.mode}">${body}</LoreState>`,fields);
    if(!old){
      if(!attrs.name||!attrs.identity)throw new Error('新人物需要姓名与稳定识别信息');
      draft.people[attrs.id]={id:attrs.id,name:attrs.name,identity:attrs.identity,presence:attrs.presence??'active',fields:applyUpdate(null,patch,fields)};
    }else{
      if(attrs.mode!=='delta')throw new Error('已有编号不能重新 full 覆盖');
      if(attrs.name!==undefined&&attrs.name!==old.name||attrs.identity!==undefined&&attrs.identity!==old.identity)throw new Error('已有编号的姓名与识别信息不能被重新指派');
      // A waking character's old memory must survive the turn that requests retrieval.
      if(old.presence==='cold'&&patch.changes.length)throw new Error('冷档人物先用空 delta 唤醒，下一轮读取资料后再更新');
      old.fields=applyUpdate(old.fields,patch,fields);old.presence=attrs.presence??old.presence;
    }
    rest=rest.slice(m[0].length).trim();
  }
  if(Object.keys(draft.people).length>PERSON_LIMIT||JSON.stringify(draft).length>1000000)throw new Error('人物记忆超过本地容量限制');
  return draft;
}
export function replayPeople(messages,fields,start=1){
  let state=null;const errors=[];
  for(const m of messages){if(m.message_id<start||m.role!=='assistant'||m.is_hidden)continue;
    try{state=applyPeople(state,m.message,fields);}catch(e){errors.push({floor:m.message_id,message:e.message});}}
  return {state,errors};
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
export function peoplePrompt(rules,fields,result,text=''){
  const projection=projectPeople(result.state,text);
  const prompt=`LoreState 人物记忆 v1。作者规则：\n${rules}\n\n状态输出协议由以下约定负责，替代作者条目内的旧存储协议。正文末尾仅输出一个 <LoreState mode="${result.state?'delta':'full'}"> 人物更新 </LoreState>。\n栏目为 ${fields.join('、')}。新人物用 <Person id="P01" name="姓名" identity="稳定识别信息" mode="full" presence="active">全部栏目标签</Person>，编号可自行选择但稳定唯一，不因离场改变。每个栏目是完整文字，不嵌套标签。\n已有人物用 <Person id="P01" mode="delta">变化的栏目标签</Person>，没提及的栏目保留，空更新合法。外层首次 full 后一律 delta；新人物内层仍 full。不得重新指派已有编号。无人物/无变化允许空外层标签。\n人物离场或不再影响当前因果时输出 <Person id="P01" mode="delta" presence="cold"/>，资料保留在本地。人物回归时输出 <Person id="P01" mode="delta" presence="active"/>；冷档唤醒这一轮不得修改该人物栏目，下一轮读取完整资料后再修改。不要删除人物或以新人编号替代旧人。移除栏目内容用 action="remove"。文本中的 &、<、引号按 XML 转义。\n以下完整资料才是本轮可读取的状态；简短索引不是完整记忆，不能据此编造旧事实。若临时召回未提供完整资料的人物，本轮仅登记唤醒并把依赖旧事实的情节留到下一轮；不得声称已经查到其冷档。出入场默认由剧情决定。\n完整资料：\n${projection.full.map(p=>`<Person id="${p.id}" name="${xmlText(p.name)}" identity="${xmlText(p.identity)}" presence="${p.presence}">\n${stateXml(p.fields,fields)}\n</Person>`).join('\n')||'尚无'}\n离场人物索引：\n${JSON.stringify(projection.index)}\n本轮按输入预取（不自动改变在场状态）：${projection.retrieved.join('、')||'无'}\n${result.errors.length?'之前存在未应用的更新，以这份有效状态为准。':''}`;
  if(prompt.length>24000)throw new Error('本轮人物资料超过提示词预算，请减少在场人物或缩短栏目');
  return prompt;
}
