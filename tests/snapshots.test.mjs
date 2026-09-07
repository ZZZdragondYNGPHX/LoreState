import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectSnapshots,planRestore,replaySnapshots} from '../prototype/snapshots.js';
const schema={shared:['地点'],person:[]};
const msg=(floor,value,mode='delta',swipe=0)=>({message_id:floor,role:'assistant',swipe_id:swipe,message:`<LoreState version="2" mode="${mode}"><Shared><地点>${value}</地点></Shared></LoreState>`});
const history=()=>[msg(1,'车站','full'),msg(3,'公园')];
test('完整快照持久化、去重、无自动层数裁剪',async()=>{
 const list=history();let saved=await collectSnapshots(list,schema,1,null);
 assert.equal(saved.length,2);assert.equal(saved[0].result.state.shared.地点,'车站');
 saved=JSON.parse(JSON.stringify(saved));assert.deepEqual(await collectSnapshots(list,schema,1,null,saved),saved);
 const many=[list[0],...Array.from({length:110},(_,i)=>msg(i+2,String(i)))];
 assert.equal((await collectSnapshots(many,schema,1,null)).length,111);
});
test('分支切换与编辑保留旧完整版本，删除后仍可选旧快照',async()=>{
 const list=history(),old=await collectSnapshots(list,schema,1,null);
 list[1]=msg(3,'山顶','delta',1);let saved=await collectSnapshots(list,schema,1,null,old);
 assert.equal(saved.length,3);assert.equal(saved[1].result.state.shared.地点,'公园');
 list[0]=msg(1,'码头','full');saved=await collectSnapshots(list,schema,1,null,saved);assert.equal(saved.length,5);
 const plan=planRestore(saved[1],list.slice(0,1),schema,1);
 assert.equal(replaySnapshots(list.slice(0,1),schema,1,plan.checkpoint).state.shared.地点,'公园');
});
test('回档不改正文、跳过已有后续层，新回复接续且快照不共享引用',async()=>{
 const list=history(),before=JSON.stringify(list),saved=await collectSnapshots(list,schema,1,null),plan=planRestore(saved[0],list,schema,1);
 assert.equal(replaySnapshots(list,schema,1,plan.checkpoint).state.shared.地点,'车站');assert.equal(JSON.stringify(list),before);
 list.push(msg(5,'港口'));const next=replaySnapshots(list,schema,1,plan.checkpoint);assert.equal(next.state.shared.地点,'港口');
 const archived=await collectSnapshots(list,schema,1,plan.checkpoint,saved);assert.equal(archived.length,3);
 next.state.shared.地点='篡改';assert.equal(plan.checkpoint.result.state.shared.地点,'车站');
});
test('损坏轮与不兼容配置不能恢复，保留前缀编辑后停止回放',async()=>{
 const list=history();list.push(msg(5,'A & B'));const saved=await collectSnapshots(list,schema,1,null);
 assert.throws(()=>planRestore(saved[2],list,schema,1),/缺口/);
 assert.throws(()=>planRestore(saved[0],list,schema,2),/不兼容/);
 const plan=planRestore(saved[0],list,schema,1);list[1].message+='改写';
 assert.throws(()=>replaySnapshots(list,schema,1,plan.checkpoint),/停止回放/);
 assert.throws(()=>replaySnapshots(list,schema,2,plan.checkpoint),/起点/);
});
