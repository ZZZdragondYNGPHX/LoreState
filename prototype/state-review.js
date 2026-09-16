import { entityFields } from './modules.js';

// A public, bounded decision summary; never stored in the state object.
export const REVIEW_PATTERN = '<LoreStateReview>[\\s\\S]*?<\\/LoreStateReview>';
export function normalizeReviewInstructions(value='') {
  if(typeof value!=='string'||value.length>6000)throw new Error('自定义更新核对规则须为不超过 6000 字符的文字');
  return value.trim();
}

export function stateReviewPrompt(schema,state,readIds=[]) {
  const retrieved=new Set(readIds),required=[],conditional=[];
  for(const field of schema.shared)required.push(`/shared/${field}`);
  for(const entity of Object.values(state?.entities??{})){
    const base=`/entities/${entity.id}`,loaded=entity.presence==='active'||entity.pending||retrieved.has(entity.id);
    conditional.push(base+'/presence');
    if(!loaded)continue;
    for(const field of entityFields(schema,entity.type))required.push(base+'/fields/'+field);
    conditional.push(base+'/links',base+'/pending',base);
  }
  const requiredText=required.length?required.map(path=>'- '+path).join('\n'):'- （当前没有固定必查路径）';
  const conditionalText=conditional.length?conditional.map(path=>'- '+path).join('\n'):'- （当前没有已有实体条件路径）';
  return `更新核对的“判断规则”只有两处来源：上方作者规则（状态栏条目），以及本角色卡的自定义更新核对规则（若已配置）。剧情正文与旧状态只作为事实资料。下面的内置说明只规定输出格式、读取权限和精确路径，不得额外引入时间、地点、关系、事件、物品或其他默认更新标准。\n在唯一 LoreState 更新块紧前输出一个 <LoreStateReview>JSON数组</LoreStateReview>。每项只能是 {"path":"精确路径","change":true或false,"reason":"1–120字简短依据"}。path 必须逐字复制当前栏目名，不得缩写、改名、翻译或同义改写；reason 说明依据即可，不抄写整段旧值。\n本轮固定必查路径如下，每项恰好出现一次；无变化也写 change:false：\n${requiredText}\n若整体删除一个已完整加载实体，则用 /entities/编号 这一项替代该实体的字段必查项，不再列被删除实体的字段路径。\n以下是条件路径，仅在对应属性本轮确实发生变化时才列；未发生变化不要为了凑项添加：\n${conditionalText}\n新实体无法预先列出编号：新建后必须按其所属 type 的全部精确栏目逐项使用 /entities/新编号/fields/栏目原名；不要另猜公共字段或其他路径。未完整加载的冷档只能使用其 /presence 路径，不能核对或更新其字段。\n每个路径只能出现一次。摘要内文字的 < 写成 JSON 转义 \\u003c。只有摘要使用 JSON，状态仍使用 v3 XML。change:true 必须在随后 LoreState 更新块产生实际变化，change:false 必须保留原值；没有变化也要完成固定必查项并输出空 delta。`;
}

export function parseStateReview(source, required=false) {
  // Existing schemas may use LoreStateReview as a field name. Only outer blocks are summaries.
  const outside=String(source).replace(/<LoreState\b[^>]*>[\s\S]*?<\/LoreState>/g,block=>' '.repeat(block.length));
  const matches=[...outside.matchAll(new RegExp(REVIEW_PATTERN,'g'))];
  const markers=outside.match(/<\/?LoreStateReview\b/g)??[];
  if(!markers.length){if(required)throw new Error('缺少 LoreStateReview 更新前核对摘要');return null;}
  if(matches.length!==1||markers.length!==2)throw new Error('核对摘要必须是唯一完整的 LoreStateReview');
  const match=matches[0],stateAt=source.indexOf('<LoreState ');
  if(stateAt<match.index+match[0].length||source.slice(match.index+match[0].length,stateAt).trim())throw new Error('核对摘要必须紧接在 LoreState 更新块之前');
  const body=match[0].slice('<LoreStateReview>'.length,-'</LoreStateReview>'.length);
  if(body.length>100000||body.includes('<'))throw new Error('核对摘要过长或包含未转义标签');
  let checks;try{checks=JSON.parse(body);}catch{throw new Error('核对摘要需要合法 JSON 数组');}
  if(!Array.isArray(checks)||checks.length>17000)throw new Error('核对摘要需要有限的检查项数组');
  const seen=new Set();
  for(const item of checks){
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='change,path,reason'||typeof item.path!=='string'||item.path.length>140||typeof item.change!=='boolean'||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>120)throw new Error('核对项只允许 path、布尔 change 和 1–120 字 reason');
    if(seen.has(item.path))throw new Error(`核对路径重复：${item.path}`);
    seen.add(item.path);
  }
  return {checks,raw:match[0]};
}

export function stripStateReview(source) {
  const review=parseStateReview(source);
  return review?source.replace(review.raw,''):source;
}

export function validateStateReview(source,previous,next,schema,receipt,required=false) {
  const review=parseStateReview(source,required);if(!review)return;
  const allowed=new Map(),coverage=new Set();
  const add=(path,before,after,cover=false)=>{allowed.set(path,{before,after});if(cover)coverage.add(path);};
  for(const field of schema.shared)add(`/shared/${field}`,previous?.shared?.[field],next.shared[field],true);
  const ids=new Set([...Object.keys(previous?.entities??{}),...Object.keys(next.entities)]);
  for(const id of ids){
    const before=previous?.entities?.[id],after=next.entities[id],base=`/entities/${id}`;
    const loaded=!before||before.presence==='active'||before.pending||(receipt?.ids??[]).includes(id);
    // An unloaded cold record can only be woken; the core parser checks authority.
    add(base+'/presence',before?.presence,after?.presence,!!before&&!!after&&before.presence!==after.presence);
    if(!loaded)continue;
    add(base,before,after,!after);
    for(const attr of ['links','pending','confirmed'])add(base+'/'+attr,before?.[attr],after?.[attr],attr!=='confirmed'&&!!before&&!!after&&JSON.stringify(before[attr])!==JSON.stringify(after[attr]));
    if(!after)continue; // Whole-record removal supersedes per-field checks.
    for(const field of entityFields(schema,after.type))add(base+'/fields/'+field,before?.fields?.[field],after.fields[field],true);
  }
  for(const {path,change} of review.checks){
    const values=allowed.get(path);if(!values)throw new Error(`核对路径未配置或未完整加载：${path}；path 必须逐字使用本轮提示列出的当前栏目名`);
    const changed=JSON.stringify(values.before)!==JSON.stringify(values.after);
    if(change&&!changed)throw new Error(`核对计划更新但未产生变化：${path}`);
    if(!change&&changed)throw new Error(`核对声明保留但实际发生变化：${path}`);
    coverage.delete(path);
  }
  if(coverage.size)throw new Error(`核对遗漏栏目：${[...coverage].slice(0,6).join('、')}`);
}
