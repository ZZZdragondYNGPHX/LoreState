const ENTITY_DELETE_TOTAL_LIMIT=500;
const ENTITY_DELETE_ALLOWED_ATTRS=new Set(['id','mode','action','reason']);
const ENTITY_DELETE_ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

function parseEntityDeleteAttrs(source){
  const attrs={};let rest=source.trim();
  while(rest){
    const m=rest.match(/^([a-z]+)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')(?:\s+|$)/);
    if(!m)throw new Error('实体删除属性格式无效');
    if(Object.hasOwn(attrs,m[1]))throw new Error(`实体删除属性重复：${m[1]}`);
    attrs[m[1]]=m[2]??m[3];rest=rest.slice(m[0].length);
  }
  return attrs;
}

function collectEntityDeletes(source,previous,receipt){
  const retired=new Set(previous?.deletedEntityIds??[]),deletes=[],seenIds=new Map();
  const tagPattern=/<Entity\s+([^<>]*?)(\/?)>/g;
  for(const match of source.matchAll(tagPattern)){
    const attrs=parseEntityDeleteAttrs(match[1]);
    if(attrs.id){seenIds.set(attrs.id,(seenIds.get(attrs.id)??0)+1);}
    if(attrs.action===undefined){
      if(attrs.mode==='full'&&attrs.id&&retired.has(attrs.id))throw new Error(`实体编号 ${attrs.id} 已删除并永久保留，不得复用`);
      continue;
    }
    if(attrs.action!=='remove')throw new Error(`未知实体 action：${attrs.action}`);
    if(match[2]!=='/')throw new Error('删除实体必须使用自闭合标签，不得同时提供栏目内容');
    if(Object.keys(attrs).some(key=>!ENTITY_DELETE_ALLOWED_ATTRS.has(key)))throw new Error('删除实体只允许 id、mode、action、reason 属性');
    if(!ENTITY_DELETE_ID.test(attrs.id??''))throw new Error('删除实体需要有效的稳定编号');
    if(attrs.mode!=='delta')throw new Error(`删除已有实体 ${attrs.id} 必须使用 mode="delta"`);
    if(!attrs.reason?.trim()||attrs.reason.trim().length>200)throw new Error('删除实体必须提供 1–200 字符的 reason');
    const old=previous?.entities?.[attrs.id];
    if(!old)throw new Error(`无法删除不存在的实体：${attrs.id}`);
    if(old.presence==='cold'&&!receipt?.ids?.includes(attrs.id))throw new Error(`冷档实体 ${attrs.id} 只有在本轮完整取回并持有有效 read 凭据时才能删除`);
    deletes.push({id:attrs.id,reason:attrs.reason.trim(),raw:match[0]});
  }
  for(const item of deletes)if((seenIds.get(item.id)??0)!==1)throw new Error(`实体 ${item.id} 同轮不能既删除又进行其他更新`);
  return {deletes,retired};
}

function removeDeleteTags(source,deletes){
  if(!deletes.length)return source;
  const raw=new Set(deletes.map(item=>item.raw));
  return source.replace(/<Entity\s+([^<>]*?)(\/?)>/g,match=>raw.has(match)?'':match);
}

function applyEntityDeletes(next,deletes,retired){
  if(!deletes.length)return next;
  const deleting=new Set(deletes.map(item=>item.id));
  for(const entity of Object.values(next.entities??{})){
    if(deleting.has(entity.id))continue;
    const hit=(entity.links??[]).find(id=>deleting.has(id));
    if(hit)throw new Error(`实体 ${entity.id} 仍关联待删除实体 ${hit}；请同轮先用 links="" 或新的 links 清除该关联`);
  }
  for(const item of deletes){
    delete next.entities[item.id];retired.add(item.id);
  }
  if(Object.keys(next.entities??{}).length+retired.size>ENTITY_DELETE_TOTAL_LIMIT)throw new Error(`现存实体与已删除保留编号合计超过 ${ENTITY_DELETE_TOTAL_LIMIT} 个限制`);
  next.deletedEntityIds=[...retired];
  if(JSON.stringify(next).length>1000000)throw new Error('实体记忆超过本地容量限制');
  return next;
}

function deletionPromptAddon(result){
  const retired=result?.state?.deletedEntityIds??[];
  const shown=retired.slice(-24);
  return `\n实体整体删除：只有当某个实体记录本身已明确误建、失效或不应继续作为独立持久档案存在时，才输出 <Entity id="E01" mode="delta" action="remove" reason="具体原因"/>。不要用删除代替 presence="cold"，也不要因为事件完成就删除；正常完成应更新结果并转冷。删除只允许本轮完整加载的旧实体；若仍被 links 引用，先在同一轮清除这些关联。删除后的编号永久禁用，不得复用。${shown.length?`已删除且禁止复用的编号：${shown.join('、')}${retired.length>shown.length?`（另有 ${retired.length-shown.length} 个未展示）`:''}。`:''}`;
}

export function installEntityDeleteProtocol(hooks){
  if(!hooks||typeof hooks.getApplyState!=='function'||typeof hooks.setApplyState!=='function'||typeof hooks.getPreparePrompt!=='function'||typeof hooks.setPreparePrompt!=='function')throw new Error('实体删除协议安装器缺少必要 hooks');
  const baseApplyState=hooks.getApplyState();
  const basePreparePrompt=hooks.getPreparePrompt();
  hooks.setApplyState(function(previous,source,schema,floor=null,receipt=null){
    const {deletes,retired}=collectEntityDeletes(source,previous,receipt);
    const cleaned=removeDeleteTags(source,deletes);
    const next=baseApplyState(previous,cleaned,schema,floor,receipt);
    return applyEntityDeletes(next,deletes,retired);
  });
  hooks.setPreparePrompt(function(rules,schema,result,text='',readToken='',purpose='combined'){
    const prepared=basePreparePrompt(rules,schema,result,text,readToken,purpose);
    if(purpose==='narration')return prepared;
    const addon=deletionPromptAddon(result);
    const marker='\n当前有效公共状态：';
    const at=prepared.content.indexOf(marker);
    const content=at>=0?prepared.content.slice(0,at)+addon+prepared.content.slice(at):prepared.content+addon;
    if(content.length>24500)throw new Error('实体删除协议加入后提示超过 24500 字符，请缩短规则或将无关实体转冷');
    return {...prepared,content};
  });
}
