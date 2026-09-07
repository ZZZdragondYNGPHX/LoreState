import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState,replayState,projectEntities,playPrompt} from '../prototype/core.js';
const fields={shared:[],entity:['事实','衣着']};
const first='<LoreState version="3" mode="full"><Entity id="P01" name="林舟" identity="港口书商" mode="full"><事实>保管蓝色钥匙</事实><衣着>旧外套</衣着></Entity><Entity id="P010" name="阿远" identity="邮差" mode="full"><事实>持有红色信封</事实><衣着>雨衣</衣着></Entity></LoreState>';
const update=body=>`<LoreState version="3" mode="delta">${body}</LoreState>`;
const store=update('<Entity id="P01" mode="delta" presence="cold"/>');
const wake=update('<Entity id="P01" mode="delta" presence="active"/>');
const start=()=>applyState(null,first,fields);
test('实体分别增量，离场保持原文且不修改前态',()=>{
 const original=start(),cold=applyState(original,store,fields);
 assert.equal(cold.entities.P01.fields.事实,'保管蓝色钥匙');assert.equal(original.entities.P01.presence,'active');
 const changed=applyState(cold,update('<Entity id="P010" mode="delta"><衣着>制服</衣着></Entity>'),fields);
 assert.equal(changed.entities.P010.fields.衣着,'制服');assert.deepEqual(changed.entities.P01,cold.entities.P01);
});
test('冷档仅索引，明确提及可预取，不串相近编号',()=>{
 const cold=applyState(start(),store,fields),p=projectEntities(cold,'寻找 P010');
 assert.equal(p.index.length,1);assert.deepEqual(Object.keys(p.index[0]),['id','name','identity','type','confirmed']);assert.equal(p.full.length,1);
 assert.deepEqual(projectEntities(cold,'去找林舟').retrieved,['P01']);
 assert.deepEqual(projectEntities(cold,'问 P01 吧').retrieved,['P01']);
 assert.equal(cold.entities.P01.presence,'cold');
 const prompt=playPrompt('记事实',fields,{state:cold,errors:[]});
 assert.ok(!prompt.includes('保管蓝色钥匙'));assert.ok(prompt.includes('港口书商'));assert.ok(prompt.includes('持有红色信封'));
});
test('冷档唤醒轮拒绝覆盖，下一轮允许增量并保留其他字段',()=>{
 const cold=applyState(start(),store,fields);
 assert.throws(()=>applyState(cold,update('<Entity id="P01" mode="delta" presence="active"><事实>猜测的新事实</事实></Entity>'),fields));
 const active=applyState(cold,wake,fields);
 const next=applyState(active,update('<Entity id="P01" mode="delta"><衣着>斗篷</衣着></Entity>'),fields);
 assert.equal(next.entities.P01.fields.事实,'保管蓝色钥匙');assert.equal(next.entities.P01.fields.衣着,'斗篷');
});
test('同名实体仅编号预取，索引不会带出冷档字段',()=>{
 const state=start();state.entities.P010.name='林舟';state.entities.P01.presence='cold';state.entities.P010.presence='cold';
 assert.equal(projectEntities(state,'林舟').full.length,0);assert.equal(projectEntities(state,'P01').full.length,1);
});
test('批次原子性：一个实体错误不会部分改掉另一个',()=>{
 const state=start();assert.throws(()=>applyState(state,update('<Entity id="P01" mode="delta"><衣着>新衣</衣着></Entity><Entity id="P010" mode="delta"><未知>错</未知></Entity>'),fields));
 assert.equal(state.entities.P01.fields.衣着,'旧外套');
 for(const body of ['<Entity id="constructor" mode="delta"/>','<Entity id="P01" mode="delta" name="另一个人"/>','<Entity id="P01" mode="delta"/><Entity id="P01" mode="delta"/>','<Entity id="P01" mode="delta" x="1"/>'])assert.throws(()=>applyState(state,update(body),fields));
});
test('回放跟随编辑、重抽、删尾与聊天隔离；坏轮保留前态',()=>{
 const messages=[{message_id:0,role:'assistant',message:'开场'},{message_id:2,role:'assistant',message:first},{message_id:4,role:'assistant',message:store},{message_id:6,role:'assistant',message:wake}];
 assert.equal(replayState(messages,fields).state.entities.P01.presence,'active');
 assert.equal(replayState(messages.slice(0,-1),fields).state.entities.P01.presence,'cold');
 messages[3].message='损坏';const bad=replayState(messages,fields);assert.equal(bad.errors.length,1);assert.equal(bad.state.entities.P01.presence,'cold');
 messages[2].message=update('');assert.equal(replayState(messages,fields).state.entities.P01.presence,'active');
 assert.equal(replayState([],fields).state,null);
});
test('支持初始无人及后续新增，未知实体不能用 delta 建档',()=>{
 const empty=applyState(null,'<LoreState version="3" mode="full"></LoreState>',fields);
 assert.throws(()=>applyState(empty,update('<Entity id="P01" mode="delta" presence="active"/>'),fields));
 const later=applyState(empty,first.replace('mode="full"','mode="delta"'),fields);assert.equal(Object.keys(later.entities).length,2);
 assert.throws(()=>applyState(later,first,fields));
});
