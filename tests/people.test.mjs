import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPeople,replayPeople,projectPeople,peoplePrompt} from '../prototype/people.js';
const fields=['事实','衣着'];
const first='<LoreState mode="full"><Person id="P01" name="林舟" identity="港口书商" mode="full"><事实>保管蓝色钥匙</事实><衣着>旧外套</衣着></Person><Person id="P010" name="阿远" identity="邮差" mode="full"><事实>持有红色信封</事实><衣着>雨衣</衣着></Person></LoreState>';
const update=body=>`<LoreState mode="delta">${body}</LoreState>`;
const store=update('<Person id="P01" mode="delta" presence="cold"/>');
const wake=update('<Person id="P01" mode="delta" presence="active"/>');
const start=()=>applyPeople(null,first,fields);
test('人物分别增量，离场保持原文且不修改前态',()=>{
 const original=start(),cold=applyPeople(original,store,fields);
 assert.equal(cold.people.P01.fields.事实,'保管蓝色钥匙');assert.equal(original.people.P01.presence,'active');
 const changed=applyPeople(cold,update('<Person id="P010" mode="delta"><衣着>制服</衣着></Person>'),fields);
 assert.equal(changed.people.P010.fields.衣着,'制服');assert.deepEqual(changed.people.P01,cold.people.P01);
});
test('冷档仅索引，明确提及可预取，不串相近编号',()=>{
 const cold=applyPeople(start(),store,fields),p=projectPeople(cold,'寻找 P010');
 assert.equal(p.index.length,1);assert.deepEqual(Object.keys(p.index[0]),['id','name','identity']);assert.equal(p.full.length,1);
 assert.deepEqual(projectPeople(cold,'去找林舟').retrieved,['P01']);
 assert.deepEqual(projectPeople(cold,'问 P01 吧').retrieved,['P01']);
 assert.equal(cold.people.P01.presence,'cold');
 const prompt=peoplePrompt('记事实',fields,{state:cold,errors:[]});
 assert.ok(!prompt.includes('保管蓝色钥匙'));assert.ok(prompt.includes('港口书商'));assert.ok(prompt.includes('持有红色信封'));
});
test('冷档唤醒轮拒绝覆盖，下一轮允许增量并保留其他字段',()=>{
 const cold=applyPeople(start(),store,fields);
 assert.throws(()=>applyPeople(cold,update('<Person id="P01" mode="delta" presence="active"><事实>猜测的新事实</事实></Person>'),fields));
 const active=applyPeople(cold,wake,fields);
 const next=applyPeople(active,update('<Person id="P01" mode="delta"><衣着>斗篷</衣着></Person>'),fields);
 assert.equal(next.people.P01.fields.事实,'保管蓝色钥匙');assert.equal(next.people.P01.fields.衣着,'斗篷');
});
test('同名人物仅编号预取，索引不会带出冷档字段',()=>{
 const state=start();state.people.P010.name='林舟';state.people.P01.presence='cold';state.people.P010.presence='cold';
 assert.equal(projectPeople(state,'林舟').full.length,0);assert.equal(projectPeople(state,'P01').full.length,1);
});
test('批次原子性：一个人物错误不会部分改掉另一个',()=>{
 const state=start();assert.throws(()=>applyPeople(state,update('<Person id="P01" mode="delta"><衣着>新衣</衣着></Person><Person id="P010" mode="delta"><未知>错</未知></Person>'),fields));
 assert.equal(state.people.P01.fields.衣着,'旧外套');
 for(const body of ['<Person id="constructor" mode="delta"/>','<Person id="P01" mode="delta" name="另一个人"/>','<Person id="P01" mode="delta"/><Person id="P01" mode="delta"/>','<Person id="P01" mode="delta" x="1"/>'])assert.throws(()=>applyPeople(state,update(body),fields));
});
test('回放跟随编辑、重抽、删尾与聊天隔离；坏轮保留前态',()=>{
 const messages=[{message_id:0,role:'assistant',message:'开场'},{message_id:2,role:'assistant',message:first},{message_id:4,role:'assistant',message:store},{message_id:6,role:'assistant',message:wake}];
 assert.equal(replayPeople(messages,fields).state.people.P01.presence,'active');
 assert.equal(replayPeople(messages.slice(0,-1),fields).state.people.P01.presence,'cold');
 messages[3].message='损坏';const bad=replayPeople(messages,fields);assert.equal(bad.errors.length,1);assert.equal(bad.state.people.P01.presence,'cold');
 messages[2].message=update('');assert.equal(replayPeople(messages,fields).state.people.P01.presence,'active');
 assert.equal(replayPeople([],fields).state,null);
});
test('支持初始无人及后续新增，未知人物不能用 delta 建档',()=>{
 const empty=applyPeople(null,'<LoreState mode="full"></LoreState>',fields);
 assert.throws(()=>applyPeople(empty,update('<Person id="P01" mode="delta" presence="active"/>'),fields));
 const later=applyPeople(empty,first.replace('mode="full"','mode="delta"'),fields);assert.equal(Object.keys(later.people).length,2);
 assert.throws(()=>applyPeople(later,first,fields));
});
