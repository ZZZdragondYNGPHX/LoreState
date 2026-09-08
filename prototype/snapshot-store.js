import { snapshotHash } from './snapshots.js';

// Snapshots and generation receipts share immutable, content-addressed state bodies.
// Every historical version stays addressable; only identical bodies are stored once.
export function emptySnapshotStore(){return {version:1,states:{},schemas:{},snapshots:[],receipts:{}};}
export function readSnapshots(saved){
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
export async function packSnapshots(snapshots,previous=emptySnapshotStore()){
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
export async function addReadReceipt(store,token,state,schema,ids){
  const stateId=await snapshotHash(JSON.stringify(state)),schemaText=JSON.stringify(schema),schemaId=await snapshotHash(schemaText);
  return {...store,states:{...store.states,[stateId]:structuredClone(state)},schemas:{...store.schemas,[schemaId]:schemaText},receipts:{...store.receipts,[token]:{stateId,schemaId,ids:[...ids]}}};
}
export function readReceipt(source,store){
  const token=source.match(/<LoreState\b[^>]*\bread="([a-f\d-]+)"/)?.[1],entry=store?.receipts?.[token];
  if(!entry)return null;
  if(!Object.hasOwn(store.states,entry.stateId))throw new Error('读取凭据的状态正文缺失，请恢复备份');
  if(!Object.hasOwn(store.schemas,entry.schemaId))throw new Error('读取凭据的配置缺失，请恢复备份');
  return {...entry,token,schema:store.schemas[entry.schemaId],state:store.states[entry.stateId]};
}
export function snapshotStorageInfo(saved){
  const store=saved.snapshotStore;
  return {count:store?.snapshots.length??saved.snapshots?.length??0,bodies:store?Object.keys(store.states).length:saved.snapshots?.length??0,bytes:new TextEncoder().encode(JSON.stringify(store??saved.snapshots??[])).length};
}
