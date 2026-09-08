(()=>{
'use strict';
// Independent of SillyTavern: a small text-tag protocol for the author-flow prototype.
const PROTO_KEY = 'lorestate_world_v3';
const TAG_PATTERN = '<LoreState\\b[^>]*>[\\s\\S]*?<\\/LoreState>';
function checkFields(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.length > 32 || new Set(fields).size !== fields.length) throw new Error('需要 1–32 个不同的栏目');
  for (const field of fields) if (!/^[\p{L}_][\p{L}\p{N}_-]{0,39}$/u.test(field) || ['__proto__','constructor','prototype','LoreState','Shared','Entity'].includes(field)) throw new Error(`栏目名称不支持：${field}`);
  return fields;
}
function xmlText(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;'); }
function decode(value) {
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
function checkConstraints(constraints,schema){
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
function checkSchema(schema) {
  if(!schema || !Array.isArray(schema.shared) || !Array.isArray(schema.entity))throw new Error('需要公共栏目与实体栏目定义');
  for(const fields of [schema.shared,schema.entity])if(fields.length)checkFields(fields);
  if(!schema.shared.length&&!schema.entity.length)throw new Error('至少需要一个文字栏目');
  if(schema.constraints!==undefined)checkConstraints(schema.constraints,schema);
  if(schema.initial!==undefined&&(typeof schema.initial!=='string'||schema.initial.length>200000))throw new Error('初始档案须为不超过 200000 字符的完整状态标签');
  return schema;
}
function authorPolicy(schema,initial='',constraints={}){
  checkSchema(schema);checkConstraints(constraints,schema);
  const policy={};if(Object.values(constraints).some(r=>Object.keys(r).length))policy.constraints=structuredClone(constraints);
  if(initial.trim()){policy.initial=initial.trim();applyState(null,policy.initial,{...schema,...policy});}
  return policy;
}
function initialResult(schema){
  checkSchema(schema);
  return {state:schema.initial?applyState(null,schema.initial,schema):null,errors:[],lastGoodFloor:null,lastAppliedFloor:null,tainted:false};
}
function stateXml(state, fields) { return fields.filter(f=>Object.hasOwn(state??{},f)).map(f=>`<${f}>${xmlText(state[f])}</${f}>`).join('\n'); }
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
  if(!['full','delta'].includes(attrs.mode))throw new Error('实体需要 full 或 delta');
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
    if(seen.has(attrs.id))throw new Error('同轮实体编号重复');seen.add(attrs.id);
    const patch=parseFields(body,schema.entity,attrs.mode);
    if(!old){
      if(!attrs.name||!attrs.identity)throw new Error('新实体需要名称与稳定识别信息');
      draft.entities[attrs.id]={id:attrs.id,name:attrs.name,identity:attrs.identity,type:attrs.type??'通用',links:attrs.links??[],pending:attrs.pending==='true',confirmed:attrs.confirmed??null,presence:attrs.presence??'active',fields:applyFields(null,patch,schema.entity,schema.constraints?.entity)};
    }else{
      if(attrs.mode!=='delta')throw new Error('已有编号不能重新 full 覆盖');
      if(attrs.name!==undefined&&attrs.name!==old.name||attrs.identity!==undefined&&attrs.identity!==old.identity)throw new Error('已有编号的名称与识别信息不能被重新指派');
      if(attrs.type!==undefined&&attrs.type!==old.type)throw new Error('已有编号的类别不能重新指派');
      // A waking character's old memory must survive the turn that requests retrieval.
      if(old.presence==='cold'&&patch.changes.length&&!readIds.includes(attrs.id))throw new Error('冷档实体先用空 delta 唤醒，下一轮读取资料后再更新；当轮更新需有效读取凭据');
      old.fields=applyFields(old.fields,patch,schema.entity,schema.constraints?.entity);old.presence=attrs.presence??old.presence;
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
function applyState(previous,source,schema,floor=null,receipt=null){
  try{return applyStateInternal(previous,source,schema,floor,receipt);}catch(error){
    const blockStart=typeof source==='string'?source.indexOf('<LoreState'):-1;
    const offset=error.offset??blockStart;
    if(offset>=0){const lines=source.slice(0,offset).split('\n');error.line=lines.length;error.column=lines.at(-1).length+1;}
    throw error;
  }
}
function repairHint(message){
  if(message.includes('&'))return '文字中的独立 & 应转义为 &amp;。可预览基础格式修复。';
  if(message.includes('未知或重复栏目'))return '核对栏目名称与 HTML 配置；同一范围内每个栏目只能出现一次。';
  if(message.includes('冷档'))return '先用空 delta 唤醒实体，下一轮读取旧资料后再更新。';
  if(message.includes('full')||message.includes('完整'))return '首次使用 version="3" mode="full"；已初始化后使用 delta。新实体须填写全部实体栏目。';
  if(message.includes('更新块'))return '检查是否缺失、未闭合或重复输出 LoreState 更新块；保留唯一完整更新块。';
  return '核对错误位置附近的标签、实体编号与栏目内容，修正原始消息后重新校验。';
}
function replayState(messages,schema,start=1,seed=null){
  checkSchema(schema);seed??=initialResult(schema);let state=structuredClone(seed.state),lastGoodFloor=seed.lastGoodFloor??null,lastAppliedFloor=seed.lastAppliedFloor??null;const errors=structuredClone(seed.errors??[]);
  for(const m of messages){if(m.message_id<start||m.role!=='assistant'||m.is_hidden)continue;
    try{state=applyState(state,m.message,schema,m.message_id,m.readReceipt);lastAppliedFloor=m.message_id;if(!errors.length)lastGoodFloor=m.message_id;}
    catch(e){errors.push({floor:m.message_id,message:e.message,scope:e.scope??'LoreState',line:e.line??null,column:e.column??null,hint:repairHint(e.message)});}}
  return {state,errors,lastGoodFloor,lastAppliedFloor,tainted:errors.length>0};
}
function stateChanges(before,after){
  const changes=[];
  function visit(a,b,path){
    if(JSON.stringify(a)===JSON.stringify(b))return;
    if((a&&typeof a==='object')||(b&&typeof b==='object')){
      for(const key of new Set([...Object.keys(a??{}),...Object.keys(b??{})]))visit(a?.[key],b?.[key],[...path,key]);
    }else changes.push({path:path.join(' / '),kind:a===undefined?'新增':b===undefined?'删除':'修改',before:a??null,after:b??null});
  }
  for(const scope of ['shared','entities'])visit(before?.[scope],after?.[scope],[scope]);return changes;
}
function inspectFloor(messages,schema,start,floor){
  const target=messages.find(m=>m.message_id===floor&&m.role==='assistant'&&!m.is_hidden);
  if(!target)throw new Error('目标 AI 楼层不存在或已隐藏，请刷新楼层列表');
  const before=replayState(messages.filter(m=>m.message_id<floor),schema,start);
  const result=replayState(messages.filter(m=>m.message_id<=floor),schema,start);
  return {...result,floor,source:target.message,changes:stateChanges(before.state,result.state),error:result.errors.find(e=>e.floor===floor)??null,excluded:floor<start};
}
// Only repair unescaped ampersands in text nodes of one complete update block.
// The caller must preview, validate and explicitly apply; never guess missing facts.
function proposeRepair(source){
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.length!==1)return null;
  const block=blocks[0],fixed=block[0].replace(/>([^<]*)</g,(_,text)=>'>'+text.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/g,'&amp;')+'<');
  return fixed===block[0]?null:source.slice(0,block.index)+fixed+source.slice(block.index+block[0].length);
}
function projectEntities(state,text=''){
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
function preparePrompt(rules,schema,result,text='',readToken=''){
  checkSchema(schema);const projection=projectEntities(result.state,text);
  const compose=()=>`LoreState 统一文字状态 v3。作者规则：\n${rules}

下面的协议负责状态存储，替代规则内旧的全量复述要求。正文末尾仅输出一个 <LoreState version="3" mode="${result.state?'delta':'full'}"${readToken?` read="${readToken}"`:''}>…</LoreState>。尚无状态时 full，已有状态（含作者初始档案）时 delta；没有变化输出空的 delta 外层。${readToken?'本轮 read 凭据必须原样复制，不沿用历史凭据。':''}
${schema.shared.length?`公共栏目：${schema.shared.join('、')}。写在 <Shared>栏目标签</Shared> 内。首次包含所有公共栏目，之后仅写变化栏目；没变化可省略整个 Shared。`:'本卡没有公共栏目，不输出 Shared。'}
${schema.entity.length?`实体栏目：${schema.entity.join('、')}。新实体用 <Entity id="P01" name="名称" type="人物" identity="稳定识别信息" mode="full" presence="active">全部实体栏目标签</Entity>。已有编号用 <Entity id="P01" mode="delta">变化栏目</Entity>。编号稳定唯一，名称与识别信息不能重新指派；无实体时可省略 Entity。
实体离场用 <Entity id="P01" mode="delta" presence="cold"/>，回归用 <Entity id="P01" mode="delta" presence="active"/>。${readToken?'下方完整取回且列入当轮可更新清单的冷档允许本轮更新；未加载冷档先空 delta 唤醒，下一轮再改。':'冷档唤醒这一轮不修改栏目，下一轮读取完整资料后再改。'}出入场默认由剧情决定；不另建编号替代旧人。`:'本卡没有实体栏目，不输出 Entity。'}
实体 type 可为人物、国家、组织、地点、物品、事件或作者指定类别，类别建立后不可改。所有实体共用上述文字栏目；类别差异写入栏目文字。Shared 是每轮提供的常驻状态，只按变化更新。
冷热表示加载状态。当前无关实体用 presence="cold" 完整保存在本地；不要删除内容来节省提示空间。links="P01 N01" 是最多 8 个已建档实体编号的有向关联，可用 links="" 清空；仅填写与当前行为有关的关联。本轮最多额外取回 8 个一跳关联，不递归。
未完成承诺、追杀、战争影响、倒计时必须单独建 type="事件" pending="true" 的热档实体，links 指向参与者；即使参与者转冷，事件仍每轮提供。结束时 pending="false"，之后允许转冷。截止时间与触发条件写入事件栏目；每轮结合常驻时间检查，但不得自动假定已经完成。
事实更新时可用 confirmed="剧情内已知时间" 记录最后确认时间。未记录时为未知；冷热切换和预取不刷新事实时间。重新取回后核对已知事件，缺少证据的离场变化保持未知，不模拟后台故事。索引可能省略部分冷档；精确编号或唯一名称仍可从完整本地档案召回。
每项写成 <栏目名>完整新文字</栏目名>；一个栏目可包含多行文字，不嵌套标签。遗漏保留；明确移除栏目内容用 <栏目名 action="remove"/>。只更新剧情确实改变的内容；作者或剧情没有明确的初值写“未知”，不擅自补造事实。不要输出 HTML、JSON、脚本或其他状态块。文字中的 & 和 < 转义为 &amp; 和 &lt;，属性中的引号也要转义。
${schema.constraints?`字段约束：${JSON.stringify(schema.constraints)}。required 为必填，noRemove 禁止删除，enum 限定完整栏目文字取值；未知值也须在允许列表内。`:''}
当前有效公共状态：
${result.state?stateXml(result.state.shared,schema.shared)||'无公共栏目':'尚未建立'}
在场及本轮取回的完整实体资料：
${projection.full.map(p=>`<Entity id="${p.id}" name="${xmlText(p.name)}" identity="${xmlText(p.identity)}" type="${xmlText(p.type)}" presence="${p.presence}" pending="${!!p.pending}" links="${(p.links??[]).join(' ')}" confirmed="${xmlText(p.confirmed??'未知')}">\n最后事实更新楼层：${p.confirmedFloor??'未知'}（只读来源信息，不输出为标签属性）。\n${stateXml(p.fields,schema.entity)}\n</Entity>`).join('\n')||'无'}
冷档实体索引：${JSON.stringify(projection.index)}\n索引未展示数量：${projection.omitted}；受关联数量或提示预算限制未加载：${projection.deferred.join('、')||'无'}。未加载不等于不存在。
本轮按输入或关联取回：${projection.retrieved.join('、')||'无'}（不自动改变在场状态）。索引不是完整记忆，不可据此编造旧事实。临时召回未提供资料的实体时，本轮只登记唤醒，依赖旧事实的情节留到下一轮，不得声称已读冷档。
${readToken?`当轮可更新的冷档编号：${projection.retrieved.join('、')||'无'}；该权限只对应本次完整资料和 read 凭据。`:''}
${result.errors.length?'之前存在未应用更新，以这份有效状态为准。':''}`;
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
function playPrompt(rules,schema,result,text=''){return preparePrompt(rules,schema,result,text).content;}
function authorPrompt(rules){
  return `请根据以下状态栏条目制作 LoreState 的完整静态 HTML，只返回 HTML。
公共栏目直接用 data-lore-field="栏目名"。需要逐个实体展示时，使用一个 data-lore-entity 容器（覆盖人物、国家、组织、地点、物品、事件等所有类别），容器内的 data-lore-field 属于实体栏目；脚本按在场实体自动复制容器，不需要写循环。公共和实体可以只选其一，也可以并用，无需选择脚本模式。
实体容器内可用独立文字节点 data-lore-name、data-lore-id、data-lore-identity、data-lore-type、data-lore-confirmed 展示名称、编号、识别信息、类别、最后确认时间。每个绑定节点只放文字，不包含标题或其他绑定节点。实体容器只能有一个，不能嵌套。栏目名以文字或下划线开头，其后仅文字、数字、下划线或连字符，每类最多 32 个；栏目值为普通文字。
示例：<section><h3>地点</h3><p data-lore-field="地点"></p></section><article data-lore-entity><h3 data-lore-name></h3><p data-lore-field="近况"></p></article>
使用 CSS 和 details/summary，适应窄屏和长文字。CSS 放 style 中，不使用 JavaScript、事件属性、外部资源、表单、iframe、SVG 或网络请求。不使用 {{变量}}，也不要求 AI 每轮重写 HTML。内容由脚本以 textContent 填入。
状态栏条目：\n${rules}`;
}

// Declarative HTML/CSS only. Opaque sandbox + CSP contain styles and prevent code/network access.
function inspectTemplate(html, Parser=DOMParser) {
  if(typeof html!=='string'||!html.trim()||html.length>100000)throw new Error('HTML 必须为非空文字，最多 100000 字符');
  const doc=new Parser().parseFromString(html,'text/html');
  if(doc.querySelector('[data-lore-person]'))throw new Error('v3 模板请使用 data-lore-entity；不迁移旧人物模板');
  const allowed=new Set('HTML HEAD BODY TITLE META STYLE DIV SECTION ARTICLE HEADER FOOTER MAIN ASIDE NAV P SPAN H1 H2 H3 H4 H5 H6 STRONG EM B I SMALL BR HR UL OL LI DL DT DD TABLE THEAD TBODY TFOOT TR TH TD CAPTION DETAILS SUMMARY LABEL BLOCKQUOTE PRE CODE'.split(' '));
  for(const el of doc.querySelectorAll('*')){
    if(!allowed.has(el.tagName))throw new Error(`HTML 原型不接受 ${el.tagName}，请使用静态 HTML/CSS`);
    for(const attr of el.attributes)if(/^on/i.test(attr.name)||['src','href','srcdoc','action','formaction','http-equiv','contenteditable'].includes(attr.name.toLowerCase()))throw new Error(`HTML 不接受属性 ${attr.name}`);
  }
  const regions=[...doc.querySelectorAll('[data-lore-entity]')];
  const forbidden=['HTML','HEAD','BODY','STYLE','META','TITLE'];
  if(regions.length>1||regions.some(el=>forbidden.includes(el.tagName)))throw new Error('只允许一个正文实体容器');
  const bindings='[data-lore-field],[data-lore-name],[data-lore-id],[data-lore-identity],[data-lore-type],[data-lore-confirmed]';
  for(const el of doc.querySelectorAll(bindings)){
    if(forbidden.includes(el.tagName)||el.hasAttribute('data-lore-entity')||el.querySelector(bindings)||['data-lore-field','data-lore-name','data-lore-id','data-lore-identity','data-lore-type','data-lore-confirmed'].filter(a=>el.hasAttribute(a)).length!==1)throw new Error('绑定须位于独立文字节点');
    if(!el.hasAttribute('data-lore-field')&&!el.closest('[data-lore-entity]'))throw new Error('实体信息必须放在实体容器中');
  }
  const nodes=[...doc.querySelectorAll('[data-lore-field]')];
  const schema={shared:[],entity:[]};
  for(const el of nodes){const fields=schema[el.closest('[data-lore-entity]')?'entity':'shared'],name=el.getAttribute('data-lore-field');if(!fields.includes(name))fields.push(name);}
  checkSchema(schema);
  if(regions.length&&!schema.entity.length)throw new Error('实体容器至少需要一个实体栏目');
  return {doc,schema};
}
function renderTemplate(html,state,Parser=DOMParser){
  const {doc}=inspectTemplate(html,Parser);
  function fill(root,fields){for(const el of root.querySelectorAll('[data-lore-field]')){const field=el.getAttribute('data-lore-field');el.textContent=Object.hasOwn(fields??{},field)?fields[field]:'尚未记录';}}
  const region=doc.querySelector('[data-lore-entity]');
  if(region){
    for(const entity of Object.values(state?.entities??{}).filter(p=>p.presence==='active')){
      const clone=region.cloneNode(true);fill(clone,entity.fields);
      for(const key of ['name','id','identity','type','confirmed'])for(const el of clone.querySelectorAll(`[data-lore-${key}]`))el.textContent=entity[key]??'未知';
      // Repeated HTML must not create duplicate document IDs.
      clone.removeAttribute('id');for(const el of clone.querySelectorAll('[id]'))el.removeAttribute('id');
      region.before(clone);
    }
    region.remove();
  }
  for(const el of doc.querySelectorAll('[data-lore-field]'))if(!el.closest('[data-lore-entity]')){const field=el.getAttribute('data-lore-field');el.textContent=Object.hasOwn(state?.shared??{},field)?state.shared[field]:'尚未记录';}
  const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";doc.head.prepend(csp);
  const base=doc.createElement('style');base.textContent='*{box-sizing:border-box}body{margin:0;padding:12px;color:#e5dfd3;background:#242421;font:14px/1.6 system-ui} [data-lore-field]{white-space:pre-wrap;overflow-wrap:anywhere}';doc.head.insertBefore(base,csp.nextSibling);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}

// Presets contain presentation only; rules and chat state are never copied here.
function listPresets(config) {
  if(Array.isArray(config.presets)&&config.presets.length)return config.presets.map(p=>({...p}));
  return [];
}
function sameFields(a,b){return a.length===b.length&&a.every(f=>b.includes(f));}
function savePreset(config,name,html,id){
  name=name.trim();if(!name||name.length>40)throw new Error('预设名称需为 1～40 个字符');
  const presets=listPresets(config);
  if(presets.some(p=>p.name===name&&p.id!==id))throw new Error('已有同名预设，请换个名称或选择覆盖');
  const index=presets.findIndex(p=>p.id===id);
  if(index<0&&presets.length>=20)throw new Error('最多保存 20 份预设');
  const preset={id,name,html};if(index<0)presets.push(preset);else presets[index]=preset;
  return {...config,presets};
}
function deletePreset(config,id){
  if(id===(config.activePresetId))throw new Error('请先切换到其他预设，再删除当前样式');
  return {...config,presets:listPresets(config).filter(p=>p.id!==id)};
}

function sameSchema(a,b){return !!a&&!!b&&sameFields(a.shared,b.shared)&&sameFields(a.entity,b.entity);}

// Presentation only: no host data writes or persisted navigation state.
function createControlCenter({doc,manager,panel,summary,status,floorSelect,details,diagnostics,repairBox,snapshotPanel,actions,loadSettings,settingsGroups}) {
  const make=(tag,text,parent)=>{const el=doc.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;};
  manager.replaceChildren();manager.removeAttribute('style');manager.setAttribute('aria-label','LoreState 控制中心');
  panel.removeAttribute('style');
  const style=make('style',null,manager);style.textContent=`
  #lorestate-state-manager{--ls-bg:#20251f;--ls-surface:#2a3028;--ls-line:#485343;--ls-muted:#b6c0b0;--ls-accent:#d5e5ae;box-sizing:border-box;width:min(880px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--ls-line);border-radius:16px;background:var(--ls-bg);color:#f1f3ed;font:15px/1.6 system-ui,sans-serif;overflow:auto;color-scheme:dark}
  #lorestate-state-manager::backdrop{background:#10150fc9}
  #lorestate-state-manager *{box-sizing:border-box;min-width:0}
  #lorestate-state-manager [hidden]{display:none!important}
  #lorestate-state-manager h2,#lorestate-state-manager h3,#lorestate-state-manager h4,#lorestate-state-manager p{margin:0 0 12px;overflow-wrap:anywhere}
  #lorestate-state-manager h2{font-size:21px;letter-spacing:.02em}#lorestate-state-manager h3{font-size:17px}#lorestate-state-manager h4{font-size:13px;color:var(--ls-muted);margin:16px 0 4px}
  #lorestate-state-manager .ls-header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 12px;gap:16px}
  #lorestate-state-manager .ls-header p{font-size:13px;color:var(--ls-muted);margin:0}
  #lorestate-state-manager .ls-tabs{display:flex;gap:6px;padding:0 24px 12px;border-bottom:1px solid var(--ls-line);position:sticky;top:0;background:var(--ls-bg);z-index:2}
  #lorestate-state-manager button{font:inherit;line-height:1.3;min-height:44px;max-width:100%;margin:0;padding:10px 14px;border:1px solid var(--ls-line);border-radius:8px;background:var(--ls-surface);color:inherit;cursor:pointer}
  #lorestate-state-manager button:hover{border-color:var(--ls-accent)}#lorestate-state-manager button:disabled{opacity:.45;cursor:default}
  #lorestate-state-manager button[aria-selected=true],#lorestate-state-manager .ls-primary{background:var(--ls-accent);color:#202719;border-color:var(--ls-accent)}
  #lorestate-state-manager :is(button,select,input,textarea,summary):focus-visible{outline:2px solid var(--ls-accent);outline-offset:3px}
  #lorestate-state-manager .ls-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:16px 24px 0}
  #lorestate-state-manager .ls-toolbar label{display:flex;gap:10px;align-items:center;margin-right:auto}
  #lorestate-state-manager .ls-body{padding:20px 24px 24px}
  #lorestate-state-manager .ls-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
  #lorestate-state-manager select,#lorestate-state-manager input,#lorestate-state-manager textarea{font:inherit;width:100%;max-width:100%;min-height:44px;border:1px solid var(--ls-line);border-radius:8px;background:#171c16;color:inherit;padding:10px}
  #lorestate-state-manager select{width:auto}#lorestate-state-manager label{display:block;margin:12px 0 6px;color:var(--ls-muted)}
  #lorestate-state-manager label :is(select,textarea,input){display:block;width:100%;margin-top:6px}
  #lorestate-state-manager textarea{display:block;min-height:140px;resize:vertical;font:13px/1.6 ui-monospace,monospace;margin:12px 0}
  #lorestate-state-manager details{margin:16px 0;padding:12px 0;border-top:1px solid var(--ls-line)}
  #lorestate-state-manager summary{cursor:pointer;font-weight:600;min-height:32px}
  #lorestate-state-manager .ls-section{margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid var(--ls-line)}
  #lorestate-state-manager .ls-health{padding:12px 16px;background:var(--ls-surface);border-left:3px solid var(--ls-accent);border-radius:6px;margin-bottom:20px}
  #lorestate-state-manager .ls-health[data-error=true]{border-color:#efb06a}
  #lorestate-state-manager pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
  #lorestate-state-manager .ls-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:16px;margin:16px 0}
  #lorestate-state-manager dt{font-size:13px;color:var(--ls-muted)}#lorestate-state-manager dd{margin:4px 0 0;overflow-wrap:anywhere}
  @media(max-width:520px){#lorestate-state-manager .ls-header{padding:16px}#lorestate-state-manager .ls-tabs{padding:0 16px 12px}#lorestate-state-manager .ls-tabs button{flex:1;padding:10px 6px}#lorestate-state-manager .ls-toolbar{padding:12px 16px 0}#lorestate-state-manager .ls-body{padding:16px}#lorestate-state-manager .ls-toolbar label{width:100%}#lorestate-state-manager .ls-toolbar select{flex:1}#lorestate-state-manager .ls-actions button{flex:1 1 140px}}
  `;
  const header=make('header',null,manager);header.className='ls-header';
  const brand=make('div',null,header);make('h2','LoreState',brand);make('p','文字状态 · 历史与维护',brand);
  const exit=make('button','关闭',header);exit.type='button';exit.onclick=()=>manager.close();
  const nav=make('div',null,manager);nav.className='ls-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','LoreState 功能');
  const toolbar=make('div',null,manager);toolbar.className='ls-toolbar';const floorLabel=make('label','AI 楼层',toolbar);floorLabel.append(floorSelect);
  for(const title of ['上一 AI 层','下一 AI 层','返回最新','定位聊天消息'])toolbar.append(actions.get(title));
  const body=make('div',null,manager);body.className='ls-body';
  summary.className='ls-health';body.append(summary);
  const statePage=make('section',null,body),repairPage=make('section',null,body);body.append(panel);
  statePage.append(details);repairPage.append(diagnostics);if(snapshotPanel){make('h3','历史快照与回档',repairPage);repairPage.append(snapshotPanel);}
  const group=(parent,title,controls)=>{const section=make('section',null,parent);section.className='ls-section';make('h3',title,section);const row=make('div',null,section);row.className='ls-actions';for(const el of controls.filter(Boolean))row.append(el);return section;};
  group(repairPage,'检查与报告',['重新校验全部楼层','复制诊断报告'].map(x=>actions.get(x)));
  const repair=group(repairPage,'基础格式修复',['预览基础格式修复','应用预览修复'].map(x=>actions.get(x)));make('p','先预览并核对原文，再应用修复。只处理可确定的格式问题。',repair);repair.append(repairBox);
  group(repairPage,'修复备份',['查看格式修复备份','撤销最近一次格式修复'].map(x=>actions.get(x)));
  // Move the original controls; handlers and unconfirmed drafts stay intact.
  panel.replaceChildren(status);status.className='ls-health';
  for(const [title,controls] of settingsGroups){
    const section=make('section',null,panel);section.className='ls-section';make('h3',title,section);
    let row;
    for(const el of controls){if(el.tagName==='BUTTON'){if(!row){row=make('div',null,section);row.className='ls-actions';}row.append(el);}else{row=null;section.append(el);}}
  }
  for(const title of ['保存 HTML 并启用本聊天','应用预览修复'])actions.get(title)?.classList.add('ls-primary');
  const pages={state:statePage,diagnostics:repairPage,settings:panel},tabs={};let active='state';
  function select(id,focus=false){active=id;for(const [key,page] of Object.entries(pages)){page.hidden=key!==id;tabs[key].setAttribute('aria-selected',String(key===id));tabs[key].tabIndex=key===id?0:-1;}toolbar.hidden=id==='settings';summary.hidden=id==='settings';if(focus)tabs[id].focus();}
  for(const [id,title] of [['state','状态历史'],['diagnostics','诊断修复'],['settings','设置']]){
    const tab=make('button',title,nav);tab.type='button';tab.id='ls-tab-'+id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','ls-page-'+id);tabs[id]=tab;
    pages[id].id=id==='settings'?'lorestate-prototype-settings':'ls-page-'+id;tab.setAttribute('aria-controls',pages[id].id);pages[id].setAttribute('role','tabpanel');pages[id].setAttribute('aria-labelledby',tab.id);
    tab.onclick=()=>{select(id);if(id==='settings')void loadSettings();};
    tab.onkeydown=e=>{const keys=Object.keys(pages),i=keys.indexOf(active);let next;if(e.key==='ArrowRight')next=keys[(i+1)%3];if(e.key==='ArrowLeft')next=keys[(i+2)%3];if(e.key==='Home')next=keys[0];if(e.key==='End')next=keys[2];if(next){e.preventDefault();tabs[next].click();tabs[next].focus();}};
  }
  let returnFocus;
  manager.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
  select('state');
  return {select,open(id){if(!manager.open){returnFocus=doc.activeElement;manager.showModal();}select(id);tabs[id].focus();},get active(){return active;}};
}

// Both inline and expanded state views retain the opaque, script-free sandbox.
function createStateFrame(doc,title,{expanded=false}={}){
  const frame=doc.createElement('iframe');frame.title=title;frame.setAttribute('sandbox','');
  frame.className='lorestate-state-frame';
  // Host themes and iframe renderers may supply generic sizing/position rules.
  // Keep the owned frame in normal flow and prevent flex shrink to a thumbnail.
  const styles={display:'block',position:'relative',inset:'auto',transform:'none',float:'none',width:'100%',minWidth:'0',maxWidth:'100%',height:expanded?'100%':'clamp(360px, 60vh, 640px)',minHeight:expanded?'0':'360px',maxHeight:'none',flex:expanded?'1 1 0':'0 0 auto',border:'0',borderRadius:'10px',boxSizing:'border-box',margin:'0'};
  for(const [key,value] of Object.entries(styles))frame.style.setProperty(key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),value,'important');
  return frame;
}

function createStateWindow(doc){
  const dialog=doc.createElement('dialog');dialog.id='lorestate-state-window';dialog.setAttribute('aria-label','LoreState 状态窗口');
  dialog.style.cssText='position:fixed;inset:0;margin:auto;width:min(1000px,calc(100vw - 24px));height:min(780px,calc(100dvh - 32px));max-width:none;max-height:none;box-sizing:border-box;padding:16px;border:1px solid #59634d;border-radius:14px;background:#20251f;color:#f1f3ed;overflow:hidden';
  const style=doc.createElement('style');style.textContent='#lorestate-state-window[open]{display:flex;flex-direction:column;gap:12px}#lorestate-state-window::backdrop{background:#10150fc9}#lorestate-state-window button:focus-visible{outline:2px solid #d5e5ae;outline-offset:2px}';dialog.append(style);
  const header=doc.createElement('header');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 auto';
  const heading=doc.createElement('h2');heading.textContent='LoreState · 当前状态';heading.style.cssText='font:600 18px/1.5 system-ui;margin:0';
  const close=doc.createElement('button');close.type='button';close.textContent='关闭状态窗口';close.style.cssText='font:inherit;min-height:44px;padding:8px 12px;border:1px solid #59634d;border-radius:8px;background:#2a3028;color:inherit;cursor:pointer';close.onclick=()=>dialog.close();
  header.append(heading,close);dialog.append(header);const frame=createStateFrame(doc,'LoreState 展开状态',{expanded:true});dialog.append(frame);doc.body.append(dialog);
  let opener;dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
  return {open(source){frame.srcdoc=source;if(!dialog.open){opener=doc.activeElement;dialog.showModal();}close.focus();},update(source){if(dialog.open)frame.srcdoc=source;},close(){dialog.close();},dispose(){dialog.remove();}};
}


function historyIdentity(messages){
  return JSON.stringify(messages.map(m=>[m.message_id,m.role,!!m.is_hidden,m.swipe_id??0,m.message]));
}
function snapshotSchema(schema,start){return JSON.stringify([schema,start]);}
async function snapshotHash(text){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function checkpointSeed(checkpoint,schema,start,messages){
  if(!checkpoint)return null;
  if(checkpoint.schema!==snapshotSchema(schema,start))throw new Error('回档后的栏目或初始化起点发生变化，请先撤销回档');
  if(historyIdentity(messages.filter(m=>m.message_id<=checkpoint.cutoff))!==checkpoint.prefix)throw new Error('回档前保留的消息或回复分支已变化。为避免错用状态，已停止回放；请重新预览一个快照');
  return structuredClone(checkpoint.result);
}
function replaySnapshots(messages,schema,start,checkpoint){
  const seed=checkpointSeed(checkpoint,schema,start,messages);
  return replayState(checkpoint?messages.filter(m=>m.message_id>checkpoint.cutoff):messages,schema,start,seed);
}
async function collectSnapshots(messages,schema,start,checkpoint,existing=[]){
  const schemaKey=snapshotSchema(schema,start),known=new Set(existing.map(s=>s.id)),added=[];
  let result=checkpointSeed(checkpoint,schema,start,messages),chain=await snapshotHash(JSON.stringify([schemaKey,checkpoint?.id??null]));
  for(const m of messages){
    chain=await snapshotHash(chain+historyIdentity([m]));
    if(checkpoint&&m.message_id<=checkpoint.cutoff)continue;
    if(m.message_id<start||m.role!=='assistant'||m.is_hidden)continue;
    result=replayState([m],schema,start,result);
    if(!known.has(chain)){
      added.push({id:chain,floor:m.message_id,swipe:m.swipe_id??0,schema:schemaKey,createdAt:new Date().toISOString(),result:structuredClone(result)});
      known.add(chain);
    }
  }
  return [...existing,...added];
}
function planRestore(snapshot,messages,schema,start,previousCheckpoint=null){
  if(!snapshot||snapshot.schema!==snapshotSchema(schema,start))throw new Error('快照与当前栏目或初始化起点不兼容');
  if(!snapshot.result?.state||snapshot.result.tainted||snapshot.result.errors?.length)throw new Error('该快照存在历史缺口，不能作为可靠回档点，请选择正常快照');
  const prefix=historyIdentity(messages),cutoff=messages.at(-1)?.message_id??-1;
  return {checkpoint:{id:crypto.randomUUID(),snapshotId:snapshot.id,floor:snapshot.floor,swipe:snapshot.swipe,schema:snapshot.schema,prefix,cutoff,result:structuredClone(snapshot.result)},undo:{checkpoint:structuredClone(previousCheckpoint),prefix},snapshot:structuredClone(snapshot)};
}


// Snapshots and generation receipts share immutable, content-addressed state bodies.
// Every historical version stays addressable; only identical bodies are stored once.
function emptySnapshotStore(){return {version:1,states:{},schemas:{},snapshots:[],receipts:{}};}
function readSnapshots(saved){
  const store=saved.snapshotStore;
  if(!store)return saved.snapshots??[];
  if(store.version!==1||!store.states||!store.schemas||!Array.isArray(store.snapshots)||!store.receipts)throw new Error('状态存档格式无效');
  return store.snapshots.map(s=>{
    if(!Object.hasOwn(store.states,s.stateId))throw new Error('快照正文缺失，已停止读取；请恢复备份');
    if(!Object.hasOwn(store.schemas,s.schemaId))throw new Error('快照配置缺失，请恢复备份');
    const {stateId,schemaId,...metadata}=s;
    return {...metadata,schema:store.schemas[schemaId],result:{...s.result,state:store.states[stateId]}};
  });
}
async function packSnapshots(snapshots,previous=emptySnapshotStore()){
  const states={...previous.states},schemas={...previous.schemas},records=[],seen=new Map(),schemaKeys=new Map();
  for(const s of snapshots){
    const {state,...result}=s.result,text=JSON.stringify(state);
    let stateId=seen.get(text);
    if(!stateId){stateId=await snapshotHash(text);seen.set(text,stateId);}
    if(Object.hasOwn(states,stateId)&&JSON.stringify(states[stateId])!==text)throw new Error('状态正文校验冲突');
    states[stateId]??=structuredClone(state);
    let schemaId=schemaKeys.get(s.schema);
    if(!schemaId){schemaId=await snapshotHash(s.schema);schemaKeys.set(s.schema,schemaId);schemas[schemaId]=s.schema;}
    const {schema,...metadata}=s;records.push({...metadata,result,stateId,schemaId});
  }
  return {version:1,states,schemas,snapshots:records,receipts:{...previous.receipts}};
}
async function addReadReceipt(store,token,state,schema,ids){
  const stateId=await snapshotHash(JSON.stringify(state)),schemaText=JSON.stringify(schema),schemaId=await snapshotHash(schemaText);
  return {...store,states:{...store.states,[stateId]:structuredClone(state)},schemas:{...store.schemas,[schemaId]:schemaText},receipts:{...store.receipts,[token]:{stateId,schemaId,ids:[...ids]}}};
}
function readReceipt(source,store){
  const token=source.match(/<LoreState\b[^>]*\bread="([a-f\d-]+)"/)?.[1],entry=store?.receipts?.[token];
  if(!entry)return null;
  if(!Object.hasOwn(store.states,entry.stateId))throw new Error('读取凭据的状态正文缺失，请恢复备份');
  if(!Object.hasOwn(store.schemas,entry.schemaId))throw new Error('读取凭据的配置缺失，请恢复备份');
  return {...entry,token,schema:store.schemas[entry.schemaId],state:store.states[entry.stateId]};
}
function snapshotStorageInfo(saved){
  const store=saved.snapshotStore;
  return {count:store?.snapshots.length??saved.snapshots?.length??0,bodies:store?Object.keys(store.states).length:saved.snapshots?.length??0,bytes:new TextEncoder().encode(JSON.stringify(store??saved.snapshots??[])).length};
}


// Runs inside the owning Tavern Helper character script, including remote imports.
function startPrototype(defaultHtml) {
  const doc=window.parent.document,ctx=()=>window.parent.SillyTavern.getContext();
  if(doc.getElementById('lorestate-prototype-settings'))throw new Error('已有 LoreState 原型脚本运行，请勿重复启用');
  const settings=()=>getVariables({type:'script'})[PROTO_KEY]??{};
  const chatSettings=()=>getVariables({type:'chat'})[PROTO_KEY]??{};
  const messages=()=>{const store=chatSettings().snapshotStore;return getChatMessages('0-{{lastMessageId}}',{include_swipes:true}).map(m=>{
    const message=m.swipes?.[m.swipe_id??0]??m.message??'';
    return {message_id:m.message_id,role:m.role,is_hidden:m.is_hidden,swipe_id:m.swipe_id??0,message,readReceipt:readReceipt(message,store)};
  });};
  const currentPolicy=(config=settings())=>chatSettings().policy??(messages().some(m=>m.message_id>=(chatSettings().start??1)&&m.role==='assistant'&&!m.is_hidden)?{}:config.authorPolicy??{});
  const schemaFor=(config=settings())=>config.schema?{...config.schema,...currentPolicy(config)}:undefined;
  function freezePolicy(){
    if(chatSettings().policy!==undefined)return;
    const policy=structuredClone(currentPolicy());
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],policy}}),{type:'chat'});
  }
  const identity=()=>[ctx().chat,ctx().getCurrentChatId()];
  const matches=([chat,id])=>!closed&&ctx().chat===chat&&ctx().getCurrentChatId()===id;
  let closed=false,queue=Promise.resolve(),pending=false,uninject=null,view=null,renderKey='',menuObserver;
  const node=(tag,text,parent)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;parent?.append(el);return el;};
  const stateWindow=createStateWindow(doc);
  const panel=node('section',undefined,doc.body);panel.id='lorestate-prototype-settings';panel.setAttribute('aria-label','LoreState 原型设置');
  const status=node('p','选择状态栏条目，再粘贴 HTML。保存后在下一次 AI 回复建立状态。',panel);status.setAttribute('role','status');
  const report=text=>{status.textContent=text;};
  const actions=new Map();
  const button=(title,parent,fn)=>{const el=node('button',title,parent);el.type='button';actions.set(title,el);el.onclick=async()=>{el.disabled=true;try{await fn();}catch(e){fault(e,'操作失败');}finally{el.disabled=false;}};return el;};
  const notice=node('aside',undefined,doc.body);notice.hidden=true;notice.setAttribute('role','alert');
  notice.style.cssText='position:fixed;right:12px;top:12px;z-index:100000;max-width:min(440px,92vw);padding:16px;background:#382621;color:#fff;border:2px solid #efb06a;border-radius:8px;white-space:pre-wrap';
  const noticeText=node('p','',notice);
  button('查看诊断',notice,()=>openManager(chatSettings().current?.errors?.[0]?.floor));button('关闭提醒',notice,()=>{notice.hidden=true;});
  let noticeKey='',runtimeLogs=[],draft=null;
  function fault(error,stage){
    const message=String(error?.message??error).slice(0,500);
    const entry={time:new Date().toISOString(),stage,message};
    runtimeLogs.push(entry);runtimeLogs=runtimeLogs.slice(-30);
    report(`${stage}：${message}`);noticeText.textContent=`LoreState ${stage}：${message}\n请打开诊断查看；状态可能尚未更新。`;notice.hidden=false;
    console.warn('[LoreState]',stage,message);
  }
  const manager=node('dialog',undefined,doc.body);manager.id='lorestate-state-manager';manager.setAttribute('aria-label','LoreState 状态管理器');
  const floorSelect=node('select',undefined,manager);floorSelect.setAttribute('aria-label','AI 楼层');
  const summary=node('p','',manager);summary.setAttribute('role','status');
  const details=node('div',undefined,manager),diagnostics=node('div',undefined,manager);
  const repairBox=node('textarea',undefined,manager);repairBox.readOnly=true;repairBox.hidden=true;repairBox.setAttribute('aria-label','修复后的消息预览');repairBox.style.cssText='width:100%;height:180px';
  function floorList(){return messages().filter(m=>m.role==='assistant'&&!m.is_hidden);}
  function errorText(e){return `第 ${e.floor} 楼 · ${e.scope}${e.line?` · 原文第 ${e.line} 行 ${e.column} 列`:''}：${e.message}\n建议：${e.hint}`;}
  function showObject(title,value){const section=node('details',undefined,details);node('summary',title,section);const pre=node('pre',JSON.stringify(value,null,2),section);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';}
  function showState(state){
    node('h3','本层完整状态',details);
    if(!state){node('p','尚未建立状态。',details);return;}
    function fields(values,parent){const grid=node('dl',undefined,parent);grid.className='ls-fields';for(const [name,value] of Object.entries(values)){const pair=node('div',undefined,grid);node('dt',name,pair);node('dd',value,pair).style.whiteSpace='pre-wrap';}}
    if(Object.keys(state.shared).length){node('h4','公共状态',details);fields(state.shared,details);}
    for(const entity of Object.values(state.entities)){
      const section=node('details',undefined,details);section.open=entity.presence==='active';
      node('summary',`${entity.type} · ${entity.name} · ${entity.id} · ${entity.presence==='cold'?'冷档':'热档'}${entity.pending?' · 未完成事件':''}`,section);
      node('p',`${entity.identity} · 最后确认：${entity.confirmed??'剧情时间未知'} · 更新楼层：${entity.confirmedFloor??'未知'} · 关联：${entity.links.join('、')||'无'}`,section);fields(entity.fields,section);
    }
    showObject('查看原始状态数据',state);
  }
  function showFloor(){
    syncSnapshots();
    draft=null;repairBox.hidden=true;applyRepair.disabled=true;details.replaceChildren();diagnostics.replaceChildren();
    if(!floorSelect.value){summary.textContent='当前聊天没有可查看的 AI 楼层。';return;}
    const config=settings();if(!schemaFor(config)){summary.textContent='请先配置并启用 LoreState。';return;}
    const item=inspectFloor(messages(),schemaFor(config),chatSettings().start??1,Number(floorSelect.value));
    summary.textContent=item.excluded?'本层在初始化起点之前，未参与状态更新。':item.error?'本层更新失败，整轮未应用。':item.tainted?'本层已应用，但前面存在失败更新，状态有缺口。':'本层更新成功。';
    node('p',`最后连续正常楼层：${item.lastGoodFloor??'尚无'}；最后应用楼层：${item.lastAppliedFloor??'尚无'}`,details);
    summary.dataset.error=String(item.tainted);
    if(!item.errors.length)node('p','截至本层没有发现更新错误。',diagnostics);
    for(const error of item.errors)node('p',errorText(error),diagnostics).style.whiteSpace='pre-wrap';
    if(chatSettings().checkpoint)node('p','已启用状态回档。这里展示原文回放；当前生效状态请看正文状态栏。',details);
    showState(item.state);
    const changes=node('details',undefined,details);node('summary',`本轮变化 · ${item.changes.length} 项`,changes);
    if(!item.changes.length)node('p',item.error?'本轮失败，没有应用变化。':'本轮没有状态变化。',changes);
    for(const change of item.changes){
      const path=change.path.replace(/^shared /,'公共状态 ').replace(/^entities /,'实体 ').replace(' / fields / ',' / ');
      node('h4',`${change.kind} · ${path}`,changes);
      node('p',`${change.before??'未记录'} → ${change.after??'已删除'}`,changes).style.whiteSpace='pre-wrap';
    }
    const raw=node('details',undefined,details);node('summary','本层消息原文',raw);const pre=node('pre',item.source,raw);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
    if(runtimeLogs.length)showObject('本次运行异常（最多 30 条）',runtimeLogs);
  }
  function syncFloors(preferred=floorSelect.value){
    const list=floorList();floorSelect.replaceChildren();
    for(const m of list){const option=node('option',`第 ${m.message_id} 楼`,floorSelect);option.value=String(m.message_id);}
    floorSelect.value=list.some(m=>String(m.message_id)===String(preferred))?String(preferred):String(list.at(-1)?.message_id??'');showFloor();
  }
  function openManager(floor){center.open(floor!==undefined?'diagnostics':'state');syncFloors(floor);}
  floorSelect.onchange=()=>{try{showFloor();}catch(e){fault(e,'历史读取失败');}};
  button('上一 AI 层',manager,()=>{floorSelect.selectedIndex=Math.max(0,floorSelect.selectedIndex-1);showFloor();});
  button('下一 AI 层',manager,()=>{floorSelect.selectedIndex=Math.min(floorSelect.options.length-1,floorSelect.selectedIndex+1);showFloor();});
  button('返回最新',manager,()=>syncFloors(-1));
  button('定位聊天消息',manager,()=>{
    const target=doc.querySelector(`#chat .mes[mesid="${Number(floorSelect.value)}"]`);
    if(!target){summary.textContent='该楼层尚未加载到聊天页面，请向上加载历史；管理器仍可查看其状态。';return;}
    manager.close();target.scrollIntoView({block:'center',behavior:'smooth'});
  });
  button('重新校验全部楼层',manager,async()=>{await refresh();syncFloors();});
  button('复制诊断报告',manager,async()=>{
    const result=getResult(),payload={version:'0.6.0',floor:Number(floorSelect.value),lastGoodFloor:result.lastGoodFloor,errors:result.errors,runtimeLogs};
    repairBox.hidden=false;repairBox.value=JSON.stringify(payload,null,2);draft=null;applyRepair.disabled=true;
    try{await navigator.clipboard.writeText(repairBox.value);summary.textContent='诊断报告已复制，不含完整消息和状态正文。';}catch{summary.textContent='请从下方文本框手动复制诊断报告。';}
  });
  button('预览基础格式修复',manager,()=>{
    const id=identity(),list=messages(),floor=Number(floorSelect.value),original=list.find(m=>m.message_id===floor);
    if(!original)throw new Error('请先选择 AI 楼层');
    if(chatSettings().checkpoint)throw new Error('回档期间请通过快照恢复状态；格式修复需先撤销回档');
    const repaired=proposeRepair(original.message);if(!repaired){summary.textContent='没有可自动修复的独立 &。请按诊断提示在酒馆编辑原始标签，再重新校验。';return;}
    const candidate=list.map(m=>m===original?{...m,message:repaired}:m),config=settings();
    const check=inspectFloor(candidate,schemaFor(config),chatSettings().start??1,floor);
    if(check.excluded)throw new Error('该楼层不参与状态更新，请使用酒馆原生编辑');
    if(check.error)throw new Error(`格式修复后仍未通过校验：${check.error.message}。请手动编辑原始标签。`);
    const branch=getChatMessages(floor,{include_swipes:true})[0];
    draft={id,floor,original:original.message,repaired,swipe:branch.swipe_id,schema:JSON.stringify(schemaFor(config)),start:chatSettings().start??1,history:JSON.stringify(list)};
    repairBox.value=repaired;repairBox.hidden=false;applyRepair.disabled=false;summary.textContent='预览仅把文字中的独立 & 转为 &amp;。本层校验通过；点击应用会修改当前选中回复，并保留一次撤销备份。';
  });
  const applyRepair=button('应用预览修复',manager,async()=>{
    if(hostGenerating())throw new Error('请等待本轮生成结束后再修复');
    const plan=draft;if(!plan)throw new Error('请先预览修复');
    const config=settings(),current=getChatMessages(plan.floor,{include_swipes:true})[0];
    if(!matches(plan.id)||JSON.stringify(messages())!==plan.history||current?.swipe_id!==plan.swipe||JSON.stringify(schemaFor(config))!==plan.schema||(chatSettings().start??1)!==plan.start)throw new Error('聊天、分支或配置已变化，请重新预览');
    if(typeof setChatMessages!=='function')throw new Error('酒馆助手缺少消息写入能力，请手动编辑原文');
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],repairBackup:{floor:plan.floor,swipe:plan.swipe,original:plan.original,repaired:plan.repaired}}}),{type:'chat'});
    await setChatMessages([{message_id:plan.floor,message:plan.repaired}],{refresh:'affected'});
    if(!matches(plan.id))return;
    await refresh();syncFloors(plan.floor);
  });applyRepair.disabled=true;
  button('撤销最近一次格式修复',manager,async()=>{
    if(hostGenerating())throw new Error('请等待本轮生成结束后再撤销');
    const backup=chatSettings().repairBackup;if(!backup)throw new Error('本聊天没有格式修复备份');
    const id=identity(),current=getChatMessages(backup.floor,{include_swipes:true})[0];
    if(current?.swipe_id!==backup.swipe||current?.swipes?.[current.swipe_id]!==backup.repaired)throw new Error('目标回复已变化，为避免覆盖，请从备份手动恢复');
    await setChatMessages([{message_id:backup.floor,message:backup.original}],{refresh:'affected'});
    if(!matches(id))return;
    updateVariablesWith(v=>{const next={...v[PROTO_KEY]};delete next.repairBackup;return {...v,[PROTO_KEY]:next};},{type:'chat'});
    await refresh();syncFloors(backup.floor);
  });
  button('查看格式修复备份',manager,()=>{repairBox.value=chatSettings().repairBackup?.original??'没有备份';repairBox.hidden=false;draft=null;applyRepair.disabled=true;});
  let restoreDraft=null,capturedKey='';
  const snapshotPanel=node('section'),snapshotSelect=node('select',undefined,snapshotPanel);
  snapshotSelect.setAttribute('aria-label','历史状态快照');
  const snapshotInfo=node('p','',snapshotPanel),snapshotPreview=node('pre','',snapshotPanel);
  snapshotPreview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto';
  function syncSnapshots(){
    const old=snapshotSelect.value, saved=chatSettings();snapshotSelect.replaceChildren();
    for(const snap of [...readSnapshots(saved)].reverse()){
      const o=node('option',`第 ${snap.floor} 楼 · 回复 ${snap.swipe+1} · ${snap.result.tainted?'有缺口':'正常'} · ${snap.id.slice(0,8)}`,snapshotSelect);o.value=snap.id;
    }
    if([...snapshotSelect.options].some(o=>o.value===old))snapshotSelect.value=old;
    const info=snapshotStorageInfo(saved);
    snapshotInfo.textContent=`已保存 ${info.count} 份历史快照，共用 ${info.bodies} 份状态正文；存档约 ${(info.bytes/1024/1024).toFixed(2)} MiB，不自动裁剪。`+(info.bytes>20*1024*1024?' 存档较大，建议导出备份后分段聊天。':'')+(saved.checkpoint?`当前从第 ${saved.checkpoint.floor} 楼快照继续。`:'')+' 回档保留所有正文，旧剧情仍在 AI 上下文中。';
  }
  snapshotSelect.onchange=()=>{restoreDraft=null;snapshotPreview.textContent='';};
  button('预览快照回档',snapshotPanel,()=>{
    const saved=chatSettings(),config=settings(),list=messages();
    const plan=planRestore(readSnapshots(saved).find(s=>s.id===snapshotSelect.value),list,schemaFor(config),saved.start??1,saved.checkpoint??null);
    restoreDraft={...plan,identity:identity(),previous:JSON.stringify(saved.checkpoint??null)};
    snapshotPreview.textContent='确认后仅恢复以下完整状态，已有后续正文不再参与状态回放。\n'+JSON.stringify(plan.snapshot.result.state,null,2);
  });
  button('确认回档',snapshotPanel,async()=>{
    const plan=restoreDraft,saved=chatSettings();
    if(hostGenerating())throw new Error('请等待生成结束后回档');
    if(!plan||!matches(plan.identity)||historyIdentity(messages())!==plan.undo.prefix||snapshotSchema(schemaFor(),saved.start??1)!==plan.checkpoint.schema||JSON.stringify(saved.checkpoint??null)!==plan.previous)throw new Error('请重新预览快照，聊天或配置可能已变化');
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],checkpoint:plan.checkpoint,restoreUndo:plan.undo,current:structuredClone(plan.checkpoint.result)}}),{type:'chat'});
    restoreDraft=null;snapshotPreview.textContent='回档完成。正文保留，新回复从此状态继续。';renderKey='';await refresh();syncSnapshots();
  });
  button('撤销上次回档',snapshotPanel,async()=>{
    if(hostGenerating())throw new Error('请等待生成结束后撤销');
    const saved=chatSettings(),undo=saved.restoreUndo;
    if(!undo)throw new Error('没有可撤销的回档');
    if(historyIdentity(messages())!==undo.prefix)throw new Error('回档后聊天已变化，请重新选择并预览快照，避免覆盖新进度');
    const result=replaySnapshots(messages(),schemaFor(),saved.start??1,undo.checkpoint);
    updateVariablesWith(v=>{const next={...v[PROTO_KEY],checkpoint:undo.checkpoint,current:result};delete next.restoreUndo;return {...v,[PROTO_KEY]:next};},{type:'chat'});
    restoreDraft=null;snapshotPreview.textContent='已撤销上次回档。';renderKey='';await refresh();syncSnapshots();
  });
  manager.append(repairBox,details);
  const bookLabel=node('label','1. 角色／聊天绑定的世界书',panel),books=node('select',undefined,bookLabel);books.setAttribute('aria-label','世界书');
  const entryLabel=node('label','状态栏条目',panel),entries=node('select',undefined,entryLabel);entries.setAttribute('aria-label','状态栏条目');
  const rules=node('textarea',undefined,panel);rules.readOnly=true;rules.setAttribute('aria-label','条目内容');
  let loadedEntries=[];
  const selectedEntry=()=>loadedEntries.find(e=>String(e.uid)===entries.value);
  async function loadEntries(){
    const id=identity(),name=books.value;if(!name){loadedEntries=[];entries.replaceChildren();rules.value='';return;}
    const data=await getWorldbook(name);if(!matches(id)||books.value!==name)return;
    loadedEntries=data;entries.replaceChildren();for(const e of data){const opt=node('option',e.name||`条目 ${e.uid}`,entries);opt.value=String(e.uid);}
    const saved=settings();if(saved.book===name&&data.some(e=>e.uid===saved.uid))entries.value=String(saved.uid);
    rules.value=selectedEntry()?.content??'';
  }
  async function loadBooks(){
    const bound=getCharWorldbookNames('current'),chatBook=getChatWorldbookName('current');
    const names=[...new Set([bound.primary,...bound.additional,chatBook].filter(Boolean))];books.replaceChildren();
    for(const name of names)node('option',name,books).value=name;
    if(names.includes(settings().book))books.value=settings().book;
    await loadEntries();if(!names.length)report('当前角色没有绑定世界书。请先在酒馆绑定状态栏世界书，再刷新列表。');
  }
  books.onchange=()=>loadEntries().catch(e=>fault(e,'世界书读取失败'));entries.onchange=()=>{rules.value=selectedEntry()?.content??'';};
  button('刷新世界书列表',panel,loadBooks);
  const maker=node('textarea',undefined,panel);maker.readOnly=true;maker.setAttribute('aria-label','HTML 制作提示词');maker.placeholder='点击下方按钮生成提示词，可复制给网页 AI';
  button('生成并复制 HTML 制作提示词',panel,async()=>{
    if(!selectedEntry()?.content?.trim())throw new Error('请先选择有内容的状态栏条目');
    maker.value=authorPrompt(selectedEntry().content);
    try{await navigator.clipboard.writeText(maker.value);report('制作提示词已复制。交给网页 AI 后，将 HTML 粘贴到下方。');}
    catch{report('制作提示词已生成，请从文本框手动复制。');}
  });
  const htmlLabel=node('label','2. 粘贴网页 AI 生成的 HTML',panel),html=node('textarea',undefined,htmlLabel);html.setAttribute('aria-label','HTML 模板');html.rows=9;html.value=settings().html||defaultHtml;
  const presetLabel=node('label','HTML 预设（随卡保存）',panel),presetSelect=node('select',undefined,presetLabel);presetSelect.setAttribute('aria-label','HTML 预设');
  const nameLabel=node('label','预设名称',panel),presetName=node('input',undefined,nameLabel);presetName.maxLength=40;presetName.setAttribute('aria-label','预设名称');
  function syncPresets(id=settings().activePresetId??'default'){
    presetSelect.replaceChildren();for(const p of listPresets(settings())){const option=node('option',p.name,presetSelect);option.value=p.id;}
    if(listPresets(settings()).some(p=>p.id===id))presetSelect.value=id;
    presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'我的样式';
  }
  function writeConfig(config){updateVariablesWith(v=>({...v,[PROTO_KEY]:config}),{type:'script'});}
  function validateSkin(source){const parsed=inspectTemplate(source),config=settings();if(config.ready&&schemaFor(config)&&!sameSchema(parsed.schema,schemaFor(config)))throw new Error('预设的栏目必须与当前配置一致；可以调整顺序和外观，不能增删栏目');return parsed;}
  presetSelect.onchange=()=>{presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'';};
  button('另存为新预设',panel,()=>{validateSkin(html.value);const id=crypto.randomUUID();writeConfig(savePreset(settings(),presetName.value,html.value,id));syncPresets(id);report('已保存新预设。点击“应用所选预设”才会切换当前样式。');});
  button('覆盖所选预设',panel,async()=>{validateSkin(html.value);const config=settings(),id=presetSelect.value;if(!id)throw new Error('请先保存一份预设');let next=savePreset(config,presetName.value,html.value,id);if(id===(config.activePresetId??'default'))next={...next,html:html.value};writeConfig(next);syncPresets(id);renderKey='';await refresh();report('预设已更新，聊天状态保留。');});
  button('应用所选预设',panel,async()=>{const config=settings(),preset=listPresets(config).find(p=>p.id===presetSelect.value);if(!preset)throw new Error('请先保存一份预设');validateSkin(preset.html);if(!config.ready)throw new Error('请先点击“保存 HTML 并启用本聊天”完成初始配置');writeConfig({...config,presets:listPresets(config),html:preset.html,activePresetId:preset.id});html.value=preset.html;renderKey='';await refresh();report(`已应用“${preset.name}”，聊天状态保留。`);});
  button('删除所选预设',panel,()=>{writeConfig(deletePreset(settings(),presetSelect.value));syncPresets();report('已删除所选预设，当前展示保留。');});
  syncPresets();
  const preview=createStateFrame(doc,'LoreState HTML 预览');panel.append(preview);
  const getResult=(config=settings(),list=messages())=>replaySnapshots(list,schemaFor(config),chatSettings().start??1,chatSettings().checkpoint);
  button('预览 HTML（不保存）',panel,()=>{
    const {schema}=inspectTemplate(html.value),config=settings();
    const example=fields=>Object.fromEntries(fields.map(f=>[f,`${f}的示例文字`]));
    const state=schemaFor(config)&&sameSchema(schema,schemaFor(config))?getResult(config).state:null;
    preview.srcdoc=renderTemplate(html.value,state??{shared:example(schema.shared),entities:schema.entity.length?{P01:{id:'P01',name:'示例实体',identity:'实体识别信息',type:'通用',confirmed:null,presence:'active',fields:example(schema.entity)}}:{}});
    report(`公共栏目：${schema.shared.join('、')||'无'}；实体栏目：${schema.entity.join('、')||'无'}。预览未保存。`);
  });
  const regexId='lorestate-text-prototype-tags-v1';
  async function installRegex(){
    await updateTavernRegexesWith(old=>[
      ...old.filter(r=>![regexId,`${regexId}-display`,`${regexId}-prompt`].includes(r.id)),
      ...['display','prompt'].map(destination=>({id:`${regexId}-${destination}`,script_name:`LoreState 原型｜${destination==='display'?'仅显示：隐藏更新标签':'仅提示词：过滤历史更新标签'}（保留正文）`,enabled:true,find_regex:`/${TAG_PATTERN}/g`,replace_string:'',trim_strings:[],source:{user_input:false,ai_output:true,slash_command:false,world_info:false,reasoning:false},destination:{display:destination==='display',prompt:destination==='prompt'},run_on_edit:true,min_depth:null,max_depth:null})),
    ],{type:'character'});
  }
  button('保存 HTML 并启用本聊天',panel,async()=>{
    const original=identity(),entry=selectedEntry(),book=books.value;
    if(!entry?.content?.trim())throw new Error('请先选中状态栏条目');
    if(!ctx().getCurrentChatId()||!messages().length)throw new Error('请先打开角色聊天');
    if(ctx().chatMetadata?.wishnote_v1?.enabled||ctx().chatMetadata?.lorestate_v1?.enabled)throw new Error('本聊天启用了旧扩展状态，请先停用旧版或使用新测试聊天');
    const {schema}=inspectTemplate(html.value),previous=settings();
    if(previous.ready&&previous.schema&&!sameSchema(schema,previous.schema))throw new Error('已有配置不支持改变栏目，以免影响其他聊天。新栏目请使用独立角色脚本。');
    const activePresetId=previous.activePresetId??'default';
    const activeName=listPresets(previous).find(p=>p.id===activePresetId)?.name??'默认样式';
    const config=savePreset({...previous,version:4,ready:true,book,uid:entry.uid,entryName:entry.name,html:html.value,schema,activePresetId},activeName,html.value,activePresetId);
    updateVariablesWith(v=>({...v,[PROTO_KEY]:config}),{type:'script'});
    const old=chatSettings();updateVariablesWith(v=>({...v,[PROTO_KEY]:{...old,enabled:true,start:old.start??(previous.ready?1:Math.max(1,messages().length))}}),{type:'chat'});
    // Separate display and prompt copy filters; neither edits the source message.
    await installRegex();if(!matches(original))return;
    if(!isCharacterTavernRegexesEnabled())report('已保存，但本卡局部正则未启用。请启用局部正则后生成，否则历史标签仍会进入上下文。');
    else report('已保存到随卡脚本，并安装本卡标签过滤正则。首次 AI 回复需完整状态，之后只写变化。');
    renderKey='';await refresh();
  });
  button('查看下一轮状态提示',panel,async()=>{
    const config=settings(),source=await getWorldbook(config.book),entry=source.find(e=>e.uid===config.uid);
    if(!entry)throw new Error('保存的世界书关联已失效，请重新选择');
    maker.value=playPrompt(entry.content,schemaFor(config),getResult(config),doc.getElementById('send_textarea')?.value??'');report('此处仅预览提示，没有调用模型。');
  });
  button('暂停本聊天',panel,async()=>{
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...chatSettings(),enabled:false}}),{type:'chat'});uninject?.();uninject=null;stateWindow.close();view?.remove();report('已暂停；数据和 HTML 保留，标签过滤正则保留。');
  });
  button('重新读取当前聊天状态',panel,async()=>{renderKey='';await refresh();const result=getResult();report(result.errors.length?`重新校验后仍有 ${result.errors.length} 轮失败，请打开状态管理器。`:'全部参与回放的楼层已通过校验。');});
  const authorHelp=node('p','可选：作者初始档案让首轮直接从确定事实增量更新；字段规则只做文字约束。保存的默认值用于新聊天，已有聊天保留自己的配置。');
  const initialLabel=node('label','初始档案（完整 LoreState v3 标签；留空则首轮生成）'),initialEditor=node('textarea',undefined,initialLabel);initialEditor.rows=6;initialEditor.setAttribute('aria-label','作者初始档案');initialEditor.value=settings().authorPolicy?.initial??'';
  const constraintLabel=node('label','字段规则（JSON；可留空）'),constraintEditor=node('textarea',undefined,constraintLabel);constraintEditor.rows=5;constraintEditor.setAttribute('aria-label','字段约束');constraintEditor.value=JSON.stringify(settings().authorPolicy?.constraints??{},null,2);constraintEditor.placeholder='{"shared":{"地点":{"required":true}},"entity":{}}';
  const policyPreview=node('pre','尚未预览');policyPreview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto';let policyDraft=null;
  button('生成初始档案模板',panel,()=>{
    const schema=settings().schema;if(!schema)throw new Error('请先保存 HTML 栏目配置');
    initialEditor.value='<LoreState version="3" mode="full">'+(schema.shared.length?'\n<Shared>\n'+schema.shared.map(f=>`<${f}>未知</${f}>`).join('\n')+'\n</Shared>':'')+'\n</LoreState>';policyDraft=null;
  });
  button('预览作者配置',panel,()=>{
    if(constraintEditor.value.length>20000)throw new Error('字段规则最多 20000 字符');
    const schema=settings().schema,policy=authorPolicy(schema,initialEditor.value,JSON.parse(constraintEditor.value.trim()||'{}'));
    const result=initialResult({...schema,...policy});playPrompt('',{...schema,...policy},result);
    policyDraft={policy,schema:JSON.stringify(schema),initial:initialEditor.value,constraints:constraintEditor.value};
    policyPreview.textContent='校验通过，尚未保存。\n'+JSON.stringify({constraints:policy.constraints??{},initialState:result.state},null,2);
  });
  function checkedPolicy(){
    if(hostGenerating())throw new Error('请等待生成结束后修改作者配置');
    if(!policyDraft||policyDraft.schema!==JSON.stringify(settings().schema)||policyDraft.initial!==initialEditor.value||policyDraft.constraints!==constraintEditor.value)throw new Error('配置已变化，请重新预览');
    return structuredClone(policyDraft.policy);
  }
  button('保存为新聊天默认配置',panel,()=>{const policy=checkedPolicy();freezePolicy();writeConfig({...settings(),authorPolicy:policy});report('已保存新聊天默认配置；当前聊天保持原配置。');});
  button('应用到尚未开始的本聊天',panel,async()=>{
    const policy=checkedPolicy(),saved=chatSettings();
    if(!active(settings()))throw new Error('请先启用本聊天');
    if(saved.checkpoint||readSnapshots(saved).length||messages().some(m=>m.message_id>=(saved.start??1)&&m.role==='assistant'&&!m.is_hidden))throw new Error('本聊天已有状态历史，请使用新聊天，避免重解释已有剧情');
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],policy}}),{type:'chat'});renderKey='';capturedKey='';await refresh();report('作者配置已用于本聊天，首轮将按初始档案更新。');
  });
  async function loadSettings(){try{syncPresets();await loadBooks();}catch(e){fault(e,'设置读取失败');}}
  async function open(){if(!settings().ready){center.open('settings');await loadSettings();}else openManager();}
  const a=title=>actions.get(title);
  const ruleDisclosure=node('details');node('summary','查看条目原文',ruleDisclosure);ruleDisclosure.append(rules);
  const makerDisclosure=node('details');node('summary','制作提示词与下一轮提示预览',makerDisclosure);makerDisclosure.append(a('生成并复制 HTML 制作提示词'),a('查看下一轮状态提示'),maker);
  const center=createControlCenter({doc,manager,panel,summary,status,floorSelect,details,diagnostics,repairBox,snapshotPanel,actions,loadSettings,settingsGroups:[
    ['1 · 世界书与规则',[bookLabel,entryLabel,a('刷新世界书列表'),ruleDisclosure]],
    ['2 · 外观模板',[makerDisclosure,htmlLabel,a('预览 HTML（不保存）'),preview,a('保存 HTML 并启用本聊天')]],
    ['3 · 外观预设',[presetLabel,a('应用所选预设'),nameLabel,a('另存为新预设'),a('覆盖所选预设'),a('删除所选预设')]],
    ['4 · 初始档案与字段约束',[authorHelp,initialLabel,a('生成初始档案模板'),constraintLabel,a('预览作者配置'),policyPreview,a('保存为新聊天默认配置'),a('应用到尚未开始的本聊天')]],
    ['5 · 聊天维护',[a('重新读取当前聊天状态'),a('暂停本聊天')]],
  ]});
  const menu=node('div');menu.className='extension_container';
  const opener=button('LoreState',menu,open);opener.className='list-group-item';opener.style.cssText='background:transparent;color:inherit;border:0;text-align:left;width:100%;font:inherit';
  const mount=()=>{const target=doc.getElementById('extensionsMenu');if(target){target.append(menu);menuObserver?.disconnect();}};
  menuObserver=new MutationObserver(mount);menuObserver.observe(doc.body,{childList:true,subtree:true});mount();
  const active=config=>config.ready&&!!ctx().getCurrentChatId()&&chatSettings().enabled!==false;
  function paint(result,list){
    const last=list.findLast(m=>m.role==='assistant'&&!m.is_hidden);if(!last)return;
    const message=doc.querySelector(`#chat .mes[mesid="${last.message_id}"]`);if(!message)return;
    const config=settings(),key=JSON.stringify([last.message_id,result.state,result.errors,config.html,chatSettings().checkpoint?.id]);
    if(view?.isConnected&&renderKey===key)return;
    view?.remove();view=node('section',undefined,message.querySelector('.mes_block')||message);view.className='lorestate-prototype-view';view.style.cssText='display:block;position:relative;width:100%;max-width:100%;min-width:0;box-sizing:border-box;flex:1 0 100%;grid-column:1 / -1;clear:both;margin:12px 0;padding:12px 0;border-top:1px solid #778063';
    node('small',result.errors.length?`状态存在缺口：${result.errors.length} 轮失败，最早第 ${result.errors[0].floor} 楼；最后连续正常楼层 ${result.lastGoodFloor??'尚无'}。后续有效更新已应用，需核对剧情。`:result.state?'LoreState · 当前状态':'LoreState · 等待首次完整状态',view);
    if(chatSettings().checkpoint)node('p',`状态已回档至第 ${chatSettings().checkpoint.floor} 楼快照；旧正文保留。`,view);
    button('查看历史与诊断',view,()=>openManager(result.errors[0]?.floor));
    if(result.state){
      const source=renderTemplate(config.html,result.state);
      const expand=button('展开状态窗口',view,()=>stateWindow.open(source));expand.style.cssText='display:inline-block;min-height:44px;margin:8px 8px 12px 0;padding:8px 12px;cursor:pointer';
      const frame=createStateFrame(doc,'LoreState 当前状态');frame.srcdoc=source;view.append(frame);stateWindow.update(source);
      const cold=Object.values(result.state.entities).filter(p=>p.presence==='cold');
      if(cold.length){const archive=node('details',undefined,view);node('summary',`本地冷档 · ${cold.length} 个实体`,archive);
        for(const p of cold){const item=node('details',undefined,archive);node('summary',`${p.type} · ${p.name} · ${p.id} · ${p.identity} · 最后确认：${p.confirmed??'剧情时间未知'} · 更新楼层：${p.confirmedFloor??'未知'}`,item);
          let loaded=false;item.ontoggle=()=>{if(item.open&&!loaded){for(const f of schemaFor(config).entity){node('h4',f,item);const text=node('p',p.fields[f]??'尚未记录',item);text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';}loaded=true;}};
        }
      }
    }
    if(result.errors.length)button('重新读取状态',view,()=>refresh());renderKey=key;
  }
  async function refresh(){
    if(hostGenerating())return;
    const config=settings();if(!active(config)){view?.remove();return;}freezePolicy();
    const id=identity(),list=messages(),schema=schemaFor(config),result=getResult(config,list);
    if(!matches(id))return;
    const old=chatSettings(),start=old.start??1,signature=historyIdentity(list),checkpoint=JSON.stringify(old.checkpoint??null);
    const schemaKey=snapshotSchema(schema,start),captureKey=JSON.stringify([ctx().getCurrentChatId(),signature,schemaKey,checkpoint]);
    const snapshots=capturedKey===captureKey?readSnapshots(old):await collectSnapshots(list,schema,start,old.checkpoint,readSnapshots(old));
    const packed=capturedKey===captureKey&&old.snapshotStore?old.snapshotStore:await packSnapshots(snapshots,old.snapshotStore??emptySnapshotStore());
    if(!matches(id)||hostGenerating()||historyIdentity(messages())!==signature||snapshotSchema(schemaFor(),chatSettings().start??1)!==schemaKey||JSON.stringify(chatSettings().checkpoint??null)!==checkpoint)return;
    const record={...result,lastFloor:list.at(-1)?.message_id??-1};
    updateVariablesWith(v=>{
      const current=v[PROTO_KEY]??{},store=current.snapshotStore??emptySnapshotStore(),merged=new Map(store.snapshots.map(s=>[s.id,s]));
      for(const snap of packed.snapshots)merged.set(snap.id,snap);
      const next={...current,current:record,snapshotStore:{...packed,states:{...packed.states,...store.states},schemas:{...packed.schemas,...store.schemas},receipts:{...packed.receipts,...store.receipts},snapshots:[...merged.values()]}};
      delete next.snapshots;return {...v,[PROTO_KEY]:next};
    },{type:'chat'});
    capturedKey=captureKey;
    paint(result,list);
    const key=JSON.stringify(result.errors);
    if(result.errors.length&&key!==noticeKey){noticeText.textContent=`LoreState：${result.errors.length} 轮状态更新失败\n${errorText(result.errors[0])}\n最后连续正常楼层：${result.lastGoodFloor??'尚无'}。`;notice.hidden=false;}
    if(!result.errors.length&&noticeKey){notice.hidden=true;}
    noticeKey=result.errors.length?key:'';
  }
  let generating=false;
  // Tavern Helper reads SillyTavern's live is_send_press flag. Event pairs are
  // still kept as a compatibility fallback, but can be unbalanced by host-side
  // slash commands and message edits.
  const hostGenerating=()=>window.parent.TavernHelper?.builtin?.duringGenerating?.()??generating;
  function schedule(){
    if(pending||closed||hostGenerating())return;pending=true;const id=identity();
    queue=queue.then(async()=>{pending=false;if(!matches(id)){if(!closed)schedule();return;}if(!hostGenerating()){await refresh();if(manager.open&&!draft)syncFloors();}}).catch(e=>fault(e,'状态刷新失败'));
  }
  async function beforeGenerate(type,_options,dryRun){
    const config=settings(),id=identity(),prepare=!dryRun&&active(config)&&!['quiet','impersonate'].includes(type);
    try{
      const cleanup=uninject;uninject=null;cleanup?.();
      if(!prepare)return;
      if(type==='continue')throw new Error('暂不支持同层续写，请发送下一轮或重抽，避免同一回复产生重复状态块');
      freezePolicy();
      const source=await getWorldbook(config.book);if(!matches(id))return;
      const entry=source.find(e=>e.uid===config.uid);
      if(!entry)throw new Error('世界书关联失效，请在原型设置中重新选择');
      let list=messages();if(['swipe','regenerate'].includes(type)&&list.at(-1)?.role==='assistant')list=list.slice(0,-1);
      const result=getResult(config,list);
      const userText=type==='swipe'||type==='regenerate'?list.findLast(m=>m.role==='user')?.message??'':doc.getElementById('send_textarea')?.value||list.findLast(m=>m.role==='user')?.message||'';
      const schema=schemaFor(config),history=historyIdentity(messages()),token=crypto.randomUUID();
      const {content,readIds}=preparePrompt(entry.content,schema,result,userText,token);
      const old=chatSettings(),store=old.snapshotStore??await packSnapshots(readSnapshots(old));
      const prepared=await addReadReceipt(store,token,result.state,schema,readIds);
      if(!matches(id))return;
      if(!active(settings())||historyIdentity(messages())!==history||JSON.stringify(schemaFor())!==JSON.stringify(schema)||JSON.stringify(chatSettings().checkpoint??null)!==JSON.stringify(old.checkpoint??null))throw new Error('生成准备期间历史、回档或配置变化，请重试');
      uninject=injectPrompts([{id:PROTO_KEY,position:'in_chat',depth:0,role:'system',content,should_scan:false}]).uninject;
      updateVariablesWith(v=>{
        const current=v[PROTO_KEY]??{},latest=current.snapshotStore??store;
        return {...v,[PROTO_KEY]:{...current,snapshotStore:{...latest,states:{...latest.states,...prepared.states},schemas:{...latest.schemas,...prepared.schemas},receipts:{...latest.receipts,[token]:prepared.receipts[token]}}}};
      },{type:'chat'});
    }catch(e){
      // ST catches event-listener errors; throwing here alone cannot cancel a request.
      // A rejected read from a previous chat must not stop the current chat's generation.
      if(!matches(id))return;
      if(!prepare){fault(e,'状态提示清理失败');return;}
      try{const cleanup=uninject;uninject=null;cleanup?.();}catch(cleanupError){console.warn('[LoreState] 提示清理失败',String(cleanupError?.message??cleanupError));}
      let stopped=false;
      try{stopped=ctx().stopGeneration();}catch(stopError){console.warn('[LoreState] 无法停止生成',String(stopError?.message??stopError));}
      fault(e,stopped?'本轮生成已停止，状态提示未注入':'状态提示未注入，请立即手动停止生成');
    }
  }
  for(const event of ['MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','GENERATION_ENDED','MORE_MESSAGES_LOADED'])if(tavern_events[event])eventOn(tavern_events[event],schedule);
  if(tavern_events.GENERATION_STARTED)eventOn(tavern_events.GENERATION_STARTED,()=>{generating=true;});
  for(const event of ['GENERATION_ENDED','GENERATION_STOPPED'])if(tavern_events[event])eventOn(tavern_events[event],()=>{generating=false;schedule();});
  eventOn(tavern_events.CHAT_CHANGED,()=>{uninject?.();uninject=null;stateWindow.close();view?.remove();renderKey='';noticeKey='';notice.hidden=true;runtimeLogs=[];draft=null;restoreDraft=null;capturedKey='';snapshotPreview.textContent='';report('设置随角色保存；修改后请预览并保存。');manager.close();generating=false;schedule();});
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS,beforeGenerate);
  eventOn(getButtonEvent('LoreState 设置'),()=>open().catch(e=>fault(e,'设置打开失败')));
  function dispose(){closed=true;menuObserver?.disconnect();stateWindow.dispose();menu.remove();panel.remove();manager.remove();notice.remove();view?.remove();uninject?.();}
  window.addEventListener('pagehide',dispose,{once:true});schedule();
}

startPrototype("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><style>\nbody{background:#f4eedf;color:#36372c;font-family:system-ui;padding:18px}\nheader{border-bottom:1px solid #b9ad8b;padding-bottom:8px;margin-bottom:14px}\nsmall{letter-spacing:.14em;color:#72785e}h2{margin:3px 0;font-size:20px}\nmain{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}\nsection{border-left:3px solid #9caa82;padding-left:10px}h3{margin:0;font-size:12px;color:#70765c}p{margin:4px 0}\n</style></head><body><header><small>TRAVEL NOTES</small><h2>旅途手记</h2></header><main>\n<section><h3>当前位置</h3><p data-lore-field=\"地点\"></p></section>\n<section><h3>当前时间</h3><p data-lore-field=\"时间\"></p></section>\n<article data-lore-entity><h3 data-lore-name></h3><small data-lore-type></small><small data-lore-confirmed></small><section><h3>概况</h3><p data-lore-field=\"概况\"></p></section>\n<section><h3>当前状态</h3><p data-lore-field=\"当前状态\"></p></section>\n</article></main></body></html>\n");
})();
