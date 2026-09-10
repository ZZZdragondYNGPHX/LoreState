import { replayState } from './core.js';

export function historyIdentity(messages){
  // Keep the tuple shape for stored prefixes, but visibility is not state history.
  return JSON.stringify(messages.map(m=>[m.message_id,m.role,false,m.swipe_id??0,m.message]));
}
export function historyMatches(messages,prefix){
  try{return historyIdentity(messages)===JSON.stringify(JSON.parse(prefix).map(row=>row.map((value,i)=>i===2?false:value)));}
  catch{return false;}
}
export function snapshotSchema(schema,start){return JSON.stringify([schema,start]);}
export async function snapshotHash(text){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export function checkpointSeed(checkpoint,schema,start,messages){
  if(!checkpoint)return null;
  if(checkpoint.schema!==snapshotSchema(schema,start))throw new Error('回档后的栏目或初始化起点发生变化，请先撤销回档');
  if(!historyMatches(messages.filter(m=>m.message_id<=checkpoint.cutoff),checkpoint.prefix))throw new Error('回档前保留的消息或回复分支已变化。为避免错用状态，已停止回放；请重新预览一个快照');
  return structuredClone(checkpoint.result);
}
export function replaySnapshots(messages,schema,start,checkpoint){
  const seed=checkpointSeed(checkpoint,schema,start,messages);
  return replayState(checkpoint?messages.filter(m=>m.message_id>checkpoint.cutoff):messages,schema,start,seed);
}
export async function collectSnapshots(messages,schema,start,checkpoint,existing=[]){
  const schemaKey=snapshotSchema(schema,start),known=new Set(existing.map(s=>s.id)),added=[];
  let result=checkpointSeed(checkpoint,schema,start,messages),chain=await snapshotHash(JSON.stringify([schemaKey,checkpoint?.id??null]));
  for(const m of messages){
    chain=await snapshotHash(chain+historyIdentity([m]));
    if(checkpoint&&m.message_id<=checkpoint.cutoff)continue;
    if(m.message_id<start||m.role!=='assistant')continue;
    result=replayState([m],schema,start,result);
    if(!known.has(chain)){
      added.push({id:chain,floor:m.message_id,swipe:m.swipe_id??0,schema:schemaKey,createdAt:new Date().toISOString(),result:structuredClone(result)});
      known.add(chain);
    }
  }
  return [...existing,...added];
}
export function planRestore(snapshot,messages,schema,start,previousCheckpoint=null){
  if(!snapshot||snapshot.schema!==snapshotSchema(schema,start))throw new Error('快照与当前栏目或初始化起点不兼容');
  if(!snapshot.result?.state||snapshot.result.tainted||snapshot.result.errors?.length)throw new Error('该快照存在历史缺口，不能作为可靠回档点，请选择正常快照');
  const prefix=historyIdentity(messages),cutoff=messages.at(-1)?.message_id??-1;
  return {checkpoint:{id:crypto.randomUUID(),snapshotId:snapshot.id,floor:snapshot.floor,swipe:snapshot.swipe,schema:snapshot.schema,prefix,cutoff,result:structuredClone(snapshot.result)},undo:{checkpoint:structuredClone(previousCheckpoint),prefix},snapshot:structuredClone(snapshot)};
}
