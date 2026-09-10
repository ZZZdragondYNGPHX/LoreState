import { parseModules, moduleShape, moduleSignature, entityFields, modulePrompt } from './modules.js';
// Independent of SillyTavern: a small text-tag protocol for the author-flow prototype.
export const PROTO_KEY = 'lorestate_world_v3';
export const TAG_PATTERN = '<LoreState\\b[^>]*>[\\s\\S]*?<\\/LoreState>';
export function checkFields(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.length > 32 || new Set(fields).size !== fields.length) throw new Error('需要 1–32 个不同的栏目');
  for (const field of fields) if (!/^[\p{L}_][\p{L}\p{N}_-]{0,39}$/u.test(field) || ['__proto__','constructor','prototype','LoreState','Shared','Entity'].includes(field)) throw new Error(`栏目名称不支持：${field}`);
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
function applyFields(previous, update, fields, constraints={}) {
  if(!previous && update.mode!=='full')throw new Error('尚未初始化，首次需要完整状态');
  if(previous && update.mode!=='delta')throw new Error('已有状态，请仅输出变化（delta）');
  if(update.mode==='full'&&(update.changes.length!==fields.length||update.changes.some(x=>x.remove)))throw new Error('首次完整状态必须包含全部栏目');
  const draft={...previous};
  for(const {name,remove,value} of update.changes){
    const rule=constraints[name]??{};
    if(remove&&(rule.required||rule.noRemove))throw new Error(`${name} 不允许删除`);
    if(!remove&&rule.enum&&!rule.enum.includes(value))throw new Error(`${name} 必须为允许取值：${rule.enum.join('、')}`);
    if(remove){if(!Object.hasOwn(draft,name))throw new Error(`无法移除不存在的栏目内容：${name}`);delete draft[name];}
    else draft[name]=value;
  }
  for(const [name,rule] of Object.entries(constraints))if(rule.required&&!Object.hasOwn(draft,name))throw new Error(`${name} 为必填栏目`);
  return draft;
}
function isRecord(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function checkConstraints(constraints,schema){
  if(!isRecord(constraints)||Object.keys(constraints).some(k=>!['shared','entity'].includes(k)))throw new Error('字段规则仅接受 shared 和 entity');
  for(const [scope,rules] of Object.entries(constraints)){
    if(!isRecord(rules))throw new Error('栏目规则必须是对象');
    for(const [name,rule] of Object.entries(rules)){
      if(!schema[scope].includes(name)||!isRecord(rule)||Object.keys(rule).some(k=>!['required','noRemove','enum'].includes(k)))throw new Error(`未知栏目或规则：${scope}.${name}`);
      for(const key of ['required','noRemove'])if(rule[key]!==undefined&&typeof rule[key]!=='boolean')throw new Error(`${name}.${key} 必须是布尔值`);
      if(rule.enum!==undefined&&(!Array.isArray(rule.enum)||!rule.enum.length||rule.enum.length>32||new Set(rule.enum).size!==rule.enum.length||rule.enum.some(v=>typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>200)))throw new Error(`${name}.enum 需要 1–32 个不同的非空文字值，每项最多 200 字符`);
    }
  }
  return constraints;
}
export function checkSchema(schema) {
  if(!schema || !Array.isArray(schema.shared) || !Array.isArray(schema.entity))throw new Error('需要公共栏目与实体栏目定义');
  for(const fields of [schema.shared,schema.entity])if(fields.length)checkFields(fields);
  if(!schema.shared.length&&!schema.entity.length)throw new Error('至少需要一个文字栏目');
  if(schema.modules!==undefined){
    if(!isRecord(schema.modules)||!Object.keys(schema.modules).length||Object.keys(schema.modules).length>16)throw new Error('模块结构无效');
    for(const [type,fields] of Object.entries(schema.modules)){checkFields([type]);checkFields(fields);}
    const union=[...new Set(Object.values(schema.modules).flat())];
    if(union.length!==schema.entity.length||union.some(f=>!schema.entity.includes(f)))throw new Error('模块栏目与实体栏目不一致');
  }
  if(schema.constraints!==undefined)checkConstraints(schema.constraints,schema);
  if(schema.initial!==undefined&&(typeof schema.initial!=='string'||schema.initial.length>200000))throw new Error('初始档案须为不超过 200000 字符的完整状态标签');
  return schema;
}
export function authorPolicy(schema,initial='',constraints={}){
  checkSchema(schema);checkConstraints(constraints,schema);
  const policy={};if(Object.values(constraints).some(r=>Object.keys(r).length))policy.constraints=structuredClone(constraints);
  if(initial.trim()){policy.initial=initial.trim();applyState(null,policy.initial,{...schema,...policy});}
  return policy;
}
export function initialResult(schema){
  checkSchema(schema);
  return {state:schema.initial?applyState(null,schema.initial,schema):null,errors:[],lastGoodFloor:null,lastAppliedFloor:null,tainted:false};
}
export function stateXml(state, fields) { return fields.filter(f=>Object.hasOwn(state??{},f)).map(f=>`<${f}>${xmlText(state[f])}</${f}>`).join('\n'); }
const ENTITY_LIMIT=500;
const validId=id=>/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id)&&!['constructor','prototype','__proto__'].includes(id);
function entityAttributes(source){
  const attrs={};let rest=source.trim();
  while(rest){
    const m=rest.match(/^([a-z]+)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')(?:\s+|$)/);
    if(!m||!['id','name','identity','mode','presence','type','links','pending','confirmed'].includes(m[1])||Object.hasOwn(attrs,m[1]))throw new Error('实体属性无效或重复');
    attrs[m[1]]=decode(m[2]??m[3]);rest=rest.slice(m[0].length);
  }
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(attrs.id??'')||['constructor','prototype','__proto__'].includes(attrs.id))throw new Error('实体编号无效');
  if(attrs.presence!==undefined&&!['active','cold'].includes(attrs.presence))throw new Error('实体出入场值无效');
  if(attrs.type!==undefined&&(!attrs.type.trim()||attrs.type.length>40))throw new Error('实体类别须为 1–40 字符');
  if(attrs.pending!==undefined&&!['true','false'].includes(attrs.pending))throw new Error('活动事件标记须为 true 或 false');
  if(attrs.confirmed!==undefined&&(!attrs.confirmed.trim()||attrs.confirmed.length>80))throw new Error('确认时间须为 1–80 字符');
  if(attrs.links!==undefined){attrs.links=attrs.links.trim()?attrs.links.trim().split(/\s+/):[];if(attrs.links.length>8||new Set(attrs.links).size!==attrs.links.length||attrs.links.some(id=>!validId(id)||id===attrs.id))throw new Error('关联须为最多 8 个不同的其他实体编号');}
  for(const [key,limit] of [['name',80],['identity',200]])if(attrs[key]!==undefined&&(!attrs[key].trim()||attrs[key].length>limit))throw new Error('名称或识别信息长度无效');
  return attrs;
}
function applyStateInternal(previous,source,schema,floor,receipt){
  checkSchema(schema);
  if(previous&&previous.version!==3)throw new Error('需要 v3 世界状态；不迁移旧状态');
  if(typeof source!=='string'||source.length>200000)throw new Error('消息过长');
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.length!==1||(source.match(/<LoreState\b/g)||[]).length!==1)throw new Error('需要且只能有一个 LoreState 更新块');
  const wrapper=blocks[0][0].match(/^<LoreState\s+version="3"\s+mode="(full|delta)"(?:\s+read="([a-f\d-]{36})")?>([\s\S]*)<\/LoreState>$/);
  if(!wrapper||wrapper[1]!== (previous?'delta':'full'))throw new Error('需要 version="3" 的统一协议：首次 full，之后 delta');
  if(wrapper[2]&&(!receipt||receipt.token!==wrapper[2]||receipt.schema!==JSON.stringify(schema)||JSON.stringify(receipt.state)!==JSON.stringify(previous)))throw new Error('本轮读取凭据缺失或已失效，请核对历史编辑、回档与配置');
  const readIds=wrapper[2]?receipt.ids:[];
  const draft=structuredClone(previous??{version:3,shared:{},entities:{}}),seen=new Set();let rest=wrapper[3].trim(), sharedSeen=false;
  while(rest){
    try {
    if(rest.startsWith('<Shared>')){
      const shared=rest.match(/^<Shared>([\s\S]*?)<\/Shared>/);
      if(!shared||sharedSeen||!schema.shared.length)throw new Error('公共状态重复、未配置或格式错误');
      draft.shared=applyFields(previous?draft.shared:null,parseFields(shared[1],schema.shared,wrapper[1]),schema.shared,schema.constraints?.shared);
      sharedSeen=true;rest=rest.slice(shared[0].length).trim();continue;
    }
    if(!schema.entity.length)throw new Error('未配置实体栏目');
    const m=rest.match(/^<Entity\s+([^<>]*?)(?:\/>|>([\s\S]*?)<\/Entity>)/);
    if(!m)throw new Error('实体更新格式无效');
    const attrs=entityAttributes(m[1]),body=m[2]??'',old=draft.entities[attrs.id];
    const expectedMode=old?'delta':'full';
    if(attrs.mode!==expectedMode){
      const status=old?'已有实体':'新实体',actualMode=attrs.mode?.slice(0,40)??null;
      const error=new Error(`${status} ${attrs.id} ${attrs.mode===undefined?'缺少 mode 属性':`mode="${actualMode}" 无效`}；需要 mode="${expectedMode}"${old?'；已有编号不能重新 full 覆盖':''}`);
      Object.assign(error,{code:'ENTITY_MODE',entityId:attrs.id,entityExists:!!old,actualMode,expectedMode,
        hint:`在该 Entity 起始标签中${attrs.mode===undefined?'补充':'改为'} mode="${expectedMode}"。${old?'已有实体只写变化栏目。':'新实体须填写名称、稳定识别信息及所属类别全部栏目。'}外层 LoreState 的 mode 不会被实体继承；full、delta 必须小写。`});
      throw error;
    }
    if(seen.has(attrs.id))throw new Error('同轮实体编号重复');seen.add(attrs.id);
    const fields=entityFields(schema,old?.type??attrs.type??'通用');
    const constraints=Object.fromEntries(Object.entries(schema.constraints?.entity??{}).filter(([name])=>fields.includes(name)));
    const patch=parseFields(body,fields,attrs.mode);
    if(!old){
      if(!attrs.name||!attrs.identity)throw new Error('新实体需要名称与稳定识别信息');
      draft.entities[attrs.id]={id:attrs.id,name:attrs.name,identity:attrs.identity,type:attrs.type??'通用',links:attrs.links??[],pending:attrs.pending==='true',confirmed:attrs.confirmed??null,presence:attrs.presence??'active',fields:applyFields(null,patch,fields,constraints)};
    }else{
      if(attrs.name!==undefined&&attrs.name!==old.name||attrs.identity!==undefined&&attrs.identity!==old.identity)throw new Error('已有编号的名称与识别信息不能被重新指派');
      if(attrs.type!==undefined&&attrs.type!==old.type)throw new Error('已有编号的类别不能重新指派');
      // A waking character's old memory must survive the turn that requests retrieval.
      if(old.presence==='cold'&&patch.changes.length&&!readIds.includes(attrs.id))throw new Error('冷档实体先用空 delta 唤醒，下一轮读取资料后再更新；当轮更新需有效读取凭据');
      old.fields=applyFields(old.fields,patch,fields,constraints);old.presence=attrs.presence??old.presence;
      if(attrs.links!==undefined)old.links=attrs.links;
      if(attrs.pending!==undefined)old.pending=attrs.pending==='true';
      if(attrs.confirmed!==undefined){if(!patch.changes.length)throw new Error('仅切换冷热不能刷新事实确认时间');old.confirmed=attrs.confirmed;}
    }
    const entity=draft.entities[attrs.id];
    if(!old||patch.changes.length){entity.confirmedFloor=floor??null;if(old&&attrs.confirmed===undefined)entity.confirmed=null;}
    if(entity.pending&&entity.type!=='事件')throw new Error('只有事件实体可标记 pending');
    if(entity.pending&&entity.presence==='cold')throw new Error('未完成事件必须保持热档；完成后用 pending="false" 转冷');
    rest=rest.slice(m[0].length).trim();
    } catch(error) {
      error.scope=rest.startsWith('<Shared>')?'Shared':`Entity ${rest.match(/\bid=["']([^"']+)/)?.[1]??'未知编号'}`;
      error.fragment??=rest.slice(0,160);
      error.offset=source.indexOf(rest)+Math.max(0,rest.indexOf(error.fragment));throw error;
    }
  }
  if(!previous&&schema.shared.length&&!sharedSeen)throw new Error('首次需要完整 Shared 公共状态');
  for(const entity of Object.values(draft.entities))if(entity.links.some(id=>!Object.hasOwn(draft.entities,id)))throw new Error(`实体 ${entity.id} 关联了尚未建档的编号`);
  if(Object.keys(draft.entities).length>ENTITY_LIMIT||JSON.stringify(draft).length>1000000)throw new Error('实体记忆超过本地容量限制');
  return draft;
}
export function applyState(previous,source,schema,floor=null,receipt=null){
  try{return applyStateInternal(previous,source,schema,floor,receipt);}catch(error){
    const blockStart=typeof source==='string'?source.indexOf('<LoreState'):-1;
    const offset=error.offset??blockStart;
    if(offset>=0){const lines=source.slice(0,offset).split('\n');error.line=lines.length;error.column=lines.at(-1).length+1;}
    throw error;
  }
}
export function repairHint(message){
  if(message.includes('&'))return '文字中的独立 & 应转义为 &amp;。可预览基础格式修复。';
  if(message.includes('未知或重复栏目'))return '核对栏目名称与 HTML 配置；同一范围内每个栏目只能出现一次。';
  if(message.includes('冷档'))return '先用空 delta 唤醒实体，下一轮读取旧资料后再更新。';
  if(message.includes('full')||message.includes('完整'))return '首次使用 version="3" mode="full"；已初始化后使用 delta。新实体须填写全部实体栏目。';
  if(message.includes('更新块'))return '检查是否缺失、未闭合或重复输出 LoreState 更新块；保留唯一完整更新块。';
  return '核对错误位置附近的标签、实体编号与栏目内容，修正原始消息后重新校验。';
}
export function replayState(messages,schema,start=1,seed=null){
  checkSchema(schema);seed??=initialResult(schema);let state=structuredClone(seed.state),lastGoodFloor=seed.lastGoodFloor??null,lastAppliedFloor=seed.lastAppliedFloor??null;const errors=structuredClone(seed.errors??[]);
  // Prompt visibility does not remove a message from the local state ledger.
  for(const m of messages){if(m.message_id<start||m.role!=='assistant')continue;
    try{state=applyState(state,m.message,schema,m.message_id,m.readReceipt);lastAppliedFloor=m.message_id;if(!errors.length)lastGoodFloor=m.message_id;}
    catch(e){errors.push({floor:m.message_id,message:e.message,scope:e.scope??'LoreState',line:e.line??null,column:e.column??null,hint:e.hint??repairHint(e.message),...(e.code==='ENTITY_MODE'?{code:e.code,entityId:e.entityId,entityExists:e.entityExists,actualMode:e.actualMode,expectedMode:e.expectedMode}:{})});}}
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
  for(const scope of ['shared','entities'])visit(before?.[scope],after?.[scope],[scope]);return changes;
}
export function inspectFloor(messages,schema,start,floor){
  const target=messages.find(m=>m.message_id===floor&&m.role==='assistant');
  if(!target)throw new Error('目标 AI 楼层不存在，请刷新楼层列表');
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
export function projectEntities(state,text=''){
  const entities=Object.values(state?.entities??{}),selected=new Set(),retrieved=[],deferred=[];
  for(const entity of entities){
    const idPattern=new RegExp('(^|[^A-Za-z0-9_-])'+entity.id+'($|[^A-Za-z0-9_-])');
    const uniqueName=entities.filter(p=>p.name===entity.name).length===1;
    if(entity.presence==='active'||entity.pending||idPattern.test(text)||(uniqueName&&entity.name.length>=2&&text.includes(entity.name)))selected.add(entity.id);
  }
  // One outgoing hop only. Never recursively traverse an entire world graph.
  const roots=[...selected];let related=0;
  for(const id of roots)for(const link of state.entities[id].links??[]){
    if(selected.has(link))continue;
    if(related<8){selected.add(link);related++;}else if(!deferred.includes(link))deferred.push(link);
  }
  const full=entities.filter(e=>selected.has(e.id));
  for(const entity of full)if(entity.presence==='cold')retrieved.push(entity.id);
  const candidates=entities.filter(e=>!selected.has(e.id));
  const index=candidates.slice(0,24).map(({id,name,identity,type,confirmed})=>({id,name,identity,type,confirmed}));
  return {full,index,retrieved,deferred,omitted:candidates.length-index.length,roots};
}
export function preparePrompt(rules,schema,result,text='',readToken='',purpose='combined'){
  checkSchema(schema);const projection=projectEntities(result.state,text);
  const parsed=rules?parseModules(rules):null;
  if(parsed){const declared=moduleShape(parsed);checkSchema(declared);if(moduleSignature(declared)!==moduleSignature(schema)||JSON.stringify(declared.shared)!==JSON.stringify(schema.shared))throw new Error('模块声明与保存配置不一致，请使用新配置和新聊天');}
  else if(schema.modules&&rules)throw new Error('模块配置需要模块格式的状态栏条目');
  const compose=()=>`LoreState 统一文字状态 v3。作者规则：\n${parsed?modulePrompt(parsed,projection,text,!result.state):rules}

${purpose==='narration'?'本轮只续写剧情正文。以下状态为只读记忆，状态由独立模型在正文结束后更新；忽略作者规则中要求输出状态标签的指令，不输出 LoreState、EntityRecord 或其他状态更新块。':`下面的协议负责状态存储，替代规则内旧的全量复述要求。正文末尾仅输出一个 <LoreState version="3" mode="${result.state?'delta':'full'}"${readToken?` read="${readToken}"`:''}>…</LoreState>。外层 mode 只决定整轮状态：尚无状态时 full，已有状态（含作者初始档案）时 delta；已有状态且没有变化才输出空 delta。${readToken?'本轮 read 凭据必须原样复制，不沿用历史凭据。':''}
每个 Entity 必须独立填写 mode，不能继承外层：编号尚未建档用 mode="full"，已建档（包括冷档）用 mode="delta"。因此外层 delta 内可以同时包含新实体 full 和已有实体 delta。所有 mode 值严格小写，不能写 Delta 或 Full。是否新实体由本地档案编号决定，不由本轮是否出场决定；未加载不等于新实体。
${schema.shared.length?`公共栏目：${schema.shared.join('、')}。写在 <Shared>栏目标签</Shared> 内。首次包含所有公共栏目，之后仅写变化栏目；没变化可省略整个 Shared。`:'本卡没有公共栏目，不输出 Shared。'}
${schema.entity.length?`${schema.modules?'实体栏目按模块目录分别定义':'实体栏目：'+schema.entity.join('、')}。新实体用 <Entity id="P01" name="名称" type="人物" identity="稳定识别信息" mode="full" presence="active">所属类别全部栏目标签</Entity>。已有编号用 <Entity id="P01" mode="delta">变化栏目</Entity>。编号稳定唯一，名称与识别信息不能重新指派；无实体时可省略 Entity。
实体离场用 <Entity id="P01" mode="delta" presence="cold"/>，回归用 <Entity id="P01" mode="delta" presence="active"/>。${readToken?'下方完整取回且列入当轮可更新清单的冷档允许本轮更新；未加载冷档先空 delta 唤醒，下一轮再改。':'冷档唤醒这一轮不修改栏目，下一轮读取完整资料后再改。'}出入场默认由剧情决定；不另建编号替代旧人。`:'本卡没有实体栏目，不输出 Entity。'}
实体 type 可为人物、国家、组织、地点、物品、事件或作者指定类别，类别建立后不可改。${schema.modules?'只允许模块目录中已声明的类别，各类别只使用自己的栏目。':'所有实体共用上述文字栏目；类别差异写入栏目文字。'}Shared 是每轮提供的常驻状态，只按变化更新。
冷热表示加载状态。当前无关实体用 presence="cold" 完整保存在本地；不要删除内容来节省提示空间。links="P01 N01" 是最多 8 个已建档实体编号的有向关联，可用 links="" 清空；仅填写与当前行为有关的关联。本轮最多额外取回 8 个一跳关联，不递归。
${schema.modules&&!Object.hasOwn(schema.modules,'事件')?'本卡未声明事件模块，不建立事件实体；相关事实记入已有类别适用栏目，不模拟到期结果。':'未完成承诺、追杀、战争影响、倒计时必须单独建 type="事件" pending="true" 的热档实体，links 指向参与者；即使参与者转冷，事件仍每轮提供。结束时 pending="false"，之后允许转冷。截止时间与触发条件写入事件栏目；每轮结合常驻时间检查，但不得自动假定已经完成。'}
事实更新时可用 confirmed="剧情内已知时间" 记录最后确认时间。未记录时为未知；冷热切换和预取不刷新事实时间。重新取回后核对已知事件，缺少证据的离场变化保持未知，不模拟后台故事。索引可能省略部分冷档；精确编号或唯一名称仍可从完整本地档案召回。
每项写成 <栏目名>完整新文字</栏目名>；一个栏目可包含多行文字，不嵌套标签。遗漏保留；明确移除栏目内容用 <栏目名 action="remove"/>。只更新剧情确实改变的内容；作者或剧情没有明确的初值写“未知”，不擅自补造事实。不要输出 HTML、JSON、脚本或其他状态块。文字中的 & 和 < 转义为 &amp; 和 &lt;，属性中的引号也要转义。
${schema.constraints?`字段约束：${JSON.stringify(schema.constraints)}。required 为必填，noRemove 禁止删除，enum 限定完整栏目文字取值；未知值也须在允许列表内。`:''}`}
当前有效公共状态：
${result.state?stateXml(result.state.shared,schema.shared)||'无公共栏目':'尚未建立'}
在场及本轮取回的完整实体资料（EntityRecord 为只读资料，不是输出模板；不要复制为更新块）：
${projection.full.map(p=>`<EntityRecord id="${p.id}" name="${xmlText(p.name)}" identity="${xmlText(p.identity)}" type="${xmlText(p.type)}" presence="${p.presence}" pending="${!!p.pending}" links="${(p.links??[]).join(' ')}"${p.confirmed?` confirmed="${xmlText(p.confirmed)}"`:''}>\n最后事实更新楼层：${p.confirmedFloor??'未知'}（只读来源信息，不输出为标签属性）。\n${stateXml(p.fields,entityFields(schema,p.type))}\n</EntityRecord>`).join('\n')||'无'}
冷档实体索引：${JSON.stringify(projection.index)}\n索引未展示数量：${projection.omitted}；受关联数量或提示预算限制未加载：${projection.deferred.join('、')||'无'}。未加载不等于不存在。
本轮按输入或关联取回：${projection.retrieved.join('、')||'无'}（不自动改变在场状态）。索引不是完整记忆，不可据此编造旧事实。临时召回未提供资料的实体时，本轮只登记唤醒，依赖旧事实的情节留到下一轮，不得声称已读冷档。
${readToken?`当轮可更新的冷档编号：${projection.retrieved.join('、')||'无'}；该权限只对应本次完整资料和 read 凭据。`:''}
${result.errors.length?'之前存在未应用更新，以这份有效状态为准。':''}
${purpose==='narration'?'仅输出剧情正文，不输出状态标签。':'输出前检查：唯一 LoreState 外层使用本轮指定 mode；每个 Entity 都有自己的小写 mode；新编号 full 且栏目齐全，旧编号 delta；不输出 EntityRecord 或只读来源信息。'}`;
  let prompt=compose();
  // Shed optional context as complete records; never truncate facts or hide required events.
  while(prompt.length>24000&&projection.index.length){projection.index.pop();projection.omitted++;prompt=compose();}
  while(prompt.length>24000){
    const optional=projection.full.findLastIndex(p=>!projection.roots.includes(p.id));
    if(optional<0)throw new Error('常驻状态、热档、活动事件或明确召回超过 24000 字符预算，请缩短规则或将无关实体转冷；完整状态未截断');
    const [removed]=projection.full.splice(optional,1);projection.retrieved=projection.retrieved.filter(id=>id!==removed.id);projection.deferred.push(removed.id);prompt=compose();
  }
  return {content:prompt,readIds:readToken?[...projection.retrieved]:[]};
}
export function playPrompt(rules,schema,result,text=''){return preparePrompt(rules,schema,result,text).content;}
export function authorPrompt(rules){
  const parsed=parseModules(rules);if(!parsed)throw new Error('请使用以【LoreState模块 v1】开头的模块条目，不转换旧条目');checkSchema(moduleShape(parsed));
  return `请根据以下状态栏条目制作 LoreState 的完整静态 HTML，只返回 HTML。
公共栏目直接用 data-lore-field="栏目名"。需要逐个实体展示时，使用一个 data-lore-entity 容器（覆盖人物、国家、组织、地点、物品、事件等所有类别），容器内的 data-lore-field 属于实体栏目；脚本按在场实体自动复制容器，不需要写循环。公共和实体可以只选其一，也可以并用，无需选择脚本模式。
实体容器内可用独立文字节点 data-lore-name、data-lore-id、data-lore-identity、data-lore-type、data-lore-confirmed 展示名称、编号、识别信息、类别、最后确认时间。每个绑定节点只放文字，不包含标题或其他绑定节点。实体容器只能有一个，不能嵌套。栏目名以文字或下划线开头，其后仅文字、数字、下划线或连字符，每类最多 32 个；栏目值为普通文字。
示例：<section><h3>地点</h3><p data-lore-field="地点"></p></section><article data-lore-entity><h3 data-lore-name></h3><p data-lore-field="近况"></p></article>
使用 CSS 和 details/summary，适应窄屏和长文字。CSS 放 style 中，不使用 JavaScript、事件属性、外部资源、表单、iframe、SVG 或网络请求。不使用双花括号占位符，也不要求 AI 每轮重写 HTML。内容由脚本以 textContent 填入。
模块条目存在时，栏目以声明为准，必须展示所有公共与各类栏目。在唯一实体容器内用 <section data-lore-module="人物"> 包住人物专用栏目，其他模块同理；这些分区不可嵌套。脚本只保留当前类别分区。不可增删或改名声明栏目。\n状态栏条目：\n${rules}`;
}
