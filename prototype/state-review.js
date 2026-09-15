import { entityFields } from './modules.js';

// A public, bounded decision summary; never stored in the state object.
export const REVIEW_PATTERN = '<LoreStateReview>[\\s\\S]*?<\\/LoreStateReview>';
export function normalizeReviewInstructions(value='') {
  if(typeof value!=='string'||value.length>6000)throw new Error('自定义更新核对规则须为不超过 6000 字符的文字');
  return value.trim();
}
export const STATE_REVIEW_PROMPT = `更新前核对：先检查本轮已经发生的剧情与旧状态，逐项判断公共栏目、完整加载实体的栏目是否变化；重点检查时间推进、地点变化、进出场、物品转移、关系依据和事件进展。未发生的计划、推测和未读取的冷档事实不能当作变化。
在唯一 LoreState 更新块紧前输出一个 <LoreStateReview>JSON数组</LoreStateReview>。这是简短的可核验决策摘要，不是长篇推理；每项格式为 {"path":"/shared/地点","change":true,"reason":"已抵达车站"}。每个公共栏目与完整加载实体的每个栏目都列一项，无变化写 change:false 和简短依据；不要抄写旧值。首次或新建实体须核对全部所属栏目。实体字段路径为 /entities/编号/fields/栏目；进出场、关联和事件标记分别用 /entities/编号/presence、/entities/编号/links、/entities/编号/pending。新建或整体删除可另列 /entities/编号。未加载冷档只能核对出入场唤醒，不能分析其字段。
每个路径只能出现一次，reason 为 1–120 字，change 必须为布尔值。摘要内文字的 < 写成 JSON 转义 \\u003c。只有摘要使用 JSON，状态仍使用 v3 XML。change:true 必须在更新块产生实际变化，change:false 必须保留原值；检查所有拟更新路径都有对应更新后再输出。没有变化也要完成核对，并输出空 delta。`;

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
    const values=allowed.get(path);if(!values)throw new Error(`核对路径未配置或未完整加载：${path}`);
    const changed=JSON.stringify(values.before)!==JSON.stringify(values.after);
    if(change&&!changed)throw new Error(`核对计划更新但未产生变化：${path}`);
    if(!change&&changed)throw new Error(`核对声明保留但实际发生变化：${path}`);
    coverage.delete(path);
  }
  if(coverage.size)throw new Error(`核对遗漏栏目：${[...coverage].slice(0,6).join('、')}`);
}
