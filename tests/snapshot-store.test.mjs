import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState,preparePrompt,replayState} from '../prototype/core.js';
import {collectSnapshots,planRestore,replaySnapshots} from '../prototype/snapshots.js';
import {emptySnapshotStore,packSnapshots,readSnapshots,addReadReceipt,readReceipt,snapshotStorageInfo} from '../prototype/snapshot-store.js';
const schema={shared:[],entity:['资料']},token='11111111-1111-4111-8111-111111111111';
const wrap=(body,mode='delta',read='')=>`<LoreState version="3" mode="${mode}"${read?` read="${read}"`:''}>${body}</LoreState>`;
const entity=(id,text,attrs='presence="cold"')=>`<Entity id="${id}" name="名称${id}" identity="身份${id}" mode="full" ${attrs}><资料>${text}</资料></Entity>`;
const full=()=>wrap(Array.from({length:10},(_,i)=>entity('E'+i,'字'.repeat(5000))).join(''),'full');
test('200 层不变的五万字资料按正文去重，JSON 重载保留全部版本',async()=>{
  const messages=[{message_id:1,role:'assistant',message:full()},...Array.from({length:199},(_,i)=>({message_id:i+2,role:'assistant',message:wrap('')}))];
  const snapshots=await collectSnapshots(messages,schema,1,null),store=await packSnapshots(snapshots),loaded=readSnapshots({snapshotStore:JSON.parse(JSON.stringify(store))});
  assert.equal(loaded.length,200);assert.equal(Object.keys(store.states).length,1);assert.deepEqual(loaded,snapshots);
  const rawBytes=Buffer.byteLength(JSON.stringify(snapshots)),packedBytes=snapshotStorageInfo({snapshotStore:store}).bytes;
  assert.ok(packedBytes<rawBytes/50,`${packedBytes} / ${rawBytes}`);
  const plan=planRestore(loaded[50],messages,schema,1);assert.equal(replaySnapshots(messages,schema,1,plan.checkpoint).state.entities.E0.fields.资料.length,5000);
});
test('旧快照无损转存，编辑、分支与删除版本仍可回档，缺正文拒绝读取',async()=>{
  const messages=[{message_id:1,role:'assistant',message:wrap(entity('E1','旧档'),'full')}];
  const old=await collectSnapshots(messages,schema,1,null);assert.deepEqual(readSnapshots({snapshots:old}),old);
  messages[0].message=wrap(entity('E1','新档'),'full');messages[0].swipe_id=1;
  const combined=await collectSnapshots(messages,schema,1,null,old),store=await packSnapshots(combined);
  assert.equal(readSnapshots({snapshotStore:store}).length,2);
  assert.equal(planRestore(readSnapshots({snapshotStore:store})[0],[],schema,1).checkpoint.result.state.entities.E1.fields.资料,'旧档');
  delete store.states[store.snapshots[0].stateId];assert.throws(()=>readSnapshots({snapshotStore:store}),/正文缺失/);
});
test('作者长初始配置也只存一份配置文本，重复打包幂等',async()=>{
  const s={...schema,initial:full()},messages=Array.from({length:20},(_,i)=>({message_id:i+1,role:'assistant',message:wrap('')}));
  const snapshots=await collectSnapshots(messages,s,1,null),store=await packSnapshots(snapshots);
  assert.equal(Object.keys(store.schemas).length,1);assert.deepEqual(await packSnapshots(readSnapshots({snapshotStore:store}),store),store);
  assert.ok(snapshotStorageInfo({snapshotStore:store}).bytes<400000);
});
test('完整预取凭据允许当轮修改冷档，不会将其自动转热',async()=>{
  const state=applyState(null,full(),schema),prompt=preparePrompt('',schema,{state,errors:[]},'E1',token);
  const store=await addReadReceipt(emptySnapshotStore(),token,state,schema,prompt.readIds),source=wrap('<Entity id="E1" mode="delta"><资料>新事实</资料></Entity>','delta',token);
  const next=applyState(state,source,schema,3,readReceipt(source,store));
  assert.deepEqual(prompt.readIds,['E1']);assert.equal(next.entities.E1.fields.资料,'新事实');assert.equal(next.entities.E1.presence,'cold');assert.equal(next.entities.E1.confirmedFloor,3);
  assert.equal(state.entities.E1.fields.资料.length,5000);
  const loaded=JSON.parse(JSON.stringify(store));assert.deepEqual(applyState(state,source,schema,3,readReceipt(source,loaded)),next);
});
test('未知凭据、未读冷档、前态或配置变化都拒绝；无凭据仍走空唤醒',async()=>{
  const state=applyState(null,full(),schema),source=wrap('<Entity id="E1" mode="delta"><资料>新事实</资料></Entity>','delta',token);
  const store=await addReadReceipt(emptySnapshotStore(),token,state,schema,['E1']),receipt=readReceipt(source,store);
  assert.throws(()=>applyState(state,source,schema),/凭据/);
  assert.throws(()=>applyState(state,source,schema,3,{...receipt,ids:[]}),/冷档/);
  assert.throws(()=>applyState(state,source,{...schema,constraints:{}},3,receipt),/凭据/);
  const changed=structuredClone(state);changed.entities.E2.fields.资料='历史编辑';assert.throws(()=>applyState(changed,source,schema,3,receipt),/凭据/);
  assert.throws(()=>applyState(state,source.replace(` read="${token}"`,''),schema),/冷档/);
  const awake=applyState(state,wrap('<Entity id="E1" mode="delta" presence="active"/>'),schema);
  assert.equal(applyState(awake,source.replace(` read="${token}"`,''),schema).entities.E1.fields.资料,'新事实');
});
test('预算裁掉的可选档案不发放读取权限，索引也不算已读',()=>{
  const state=applyState(null,wrap(Array.from({length:5},(_,i)=>entity('E'+i,'字'.repeat(5000))).join('')+entity('Root','热档','presence="active" links="E0 E1 E2 E3 E4"'),'full'),schema);
  const result=preparePrompt('',schema,{state,errors:[]},'',token);
  assert.ok(result.content.length<=24000);assert.ok(result.readIds.length<5);assert.ok(!result.readIds.includes('E4'));
});
test('凭据和快照共用前态正文，历史原文重放与删尾结果一致',async()=>{
  const first={message_id:1,role:'assistant',message:wrap(entity('E1','旧档'),'full')},base=replayState([first],schema).state;
  let store=await packSnapshots(await collectSnapshots([first],schema,1,null));store=await addReadReceipt(store,token,base,schema,['E1']);
  assert.equal(Object.keys(store.states).length,1);
  const source=wrap('<Entity id="E1" mode="delta"><资料>新档</资料></Entity>','delta',token),second={message_id:3,role:'assistant',message:source,readReceipt:readReceipt(source,store)};
  assert.equal(replayState([first,second],schema).state.entities.E1.fields.资料,'新档');assert.equal(replayState([first],schema).state.entities.E1.fields.资料,'旧档');
  first.message=first.message.replace('旧档','编辑');assert.equal(replayState([first,second],schema).errors[0].floor,3);
});
