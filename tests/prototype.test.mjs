import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseUpdate,applyUpdate,replayText,playPrompt,checkFields,xmlText,TAG_PATTERN} from '../prototype/core.js';
const fields=['地点','衣着','身体状况'];
const full='故事<LoreState mode="full"><地点>驿站</地点><衣着>灰色斗篷</衣着><身体状况>健康</身体状况></LoreState>';
const messages=[{message_id:0,role:'assistant',message:'开场白'},{message_id:1,role:'user',message:'去集市'},{message_id:2,role:'assistant',message:full},{message_id:3,role:'user',message:'继续'},{message_id:4,role:'assistant',message:'故事二<LoreState mode="delta"><地点>集市</地点></LoreState>'}];
test('首次完整，后续只改一项，正文与未变化的文字保留',()=>{
 const r=replayText(messages,fields);assert.deepEqual(r.state,{地点:'集市',衣着:'灰色斗篷',身体状况:'健康'});assert.deepEqual(r.errors,[]);
 assert.equal(full.replace(new RegExp(TAG_PATTERN,'g'),''),'故事');
});
test('首次缺栏目或直接 delta 拒绝；第二次 full 拒绝',()=>{
 assert.throws(()=>applyUpdate(null,parseUpdate('<LoreState mode="full"><地点>驿站</地点></LoreState>',fields),fields));
 assert.throws(()=>applyUpdate(null,parseUpdate('<LoreState mode="delta"/>',fields),fields));
 const s=replayText(messages.slice(0,3),fields).state;assert.throws(()=>applyUpdate(s,parseUpdate(full,fields),fields));
});
test('错误批次保留上一版，不阻断后续回复；修复后可重复重算',()=>{
 const m=structuredClone(messages);m[4].message='<LoreState mode="delta"><地点>新地址</地点><未知>错误</未知></LoreState>';
 const r=replayText(m,fields);assert.equal(r.state.地点,'驿站');assert.equal(r.errors[0].floor,4);
 m.push({message_id:6,role:'assistant',message:'<LoreState mode="delta"><衣着>雨衣</衣着></LoreState>'});assert.equal(replayText(m,fields).state.衣着,'雨衣');
 m[4]=messages[4];assert.deepEqual(replayText(m,fields),replayText(m,fields));assert.equal(replayText(m,fields).errors.length,0);
});
test('明确移除与遗漏不同，可再次新增已移除内容',()=>{
 const s=replayText(messages,fields).state,r=applyUpdate(s,parseUpdate('<LoreState mode="delta"><身体状况 action="remove"/></LoreState>',fields),fields);
 assert.ok(!Object.hasOwn(r,'身体状况'));assert.equal(r.衣着,'灰色斗篷');assert.equal(s.身体状况,'健康');
 assert.equal(applyUpdate(r,parseUpdate('<LoreState mode="delta"><身体状况>轻伤</身体状况></LoreState>',fields),fields).身体状况,'轻伤');
});
test('空 delta、实体与标签安全',()=>{
 const s=replayText(messages,fields).state;assert.deepEqual(applyUpdate(s,parseUpdate('<LoreState mode="delta"></LoreState>',fields),fields),s);
 assert.equal(parseUpdate('<LoreState mode="delta"><地点>A &amp; B &lt;门&gt;</地点></LoreState>',fields).changes[0].value,'A & B <门>');
 for(const bad of ['<LoreState mode="delta"><地点><script>x</script></地点></LoreState>','<LoreState mode="delta"><地点>&bad;</地点></LoreState>',full+full,'<LoreState mode="delta"><地点>A</地点><地点>B</地点></LoreState>'])assert.throws(()=>parseUpdate(bad,fields));
 assert.throws(()=>checkFields(['__proto__']));assert.equal(xmlText('<x>'),'&lt;x&gt;');
});
test('删除尾部、重抽正文和重新编辑均按现存消息计算',()=>{
 assert.equal(replayText(messages.slice(0,4),fields).state.地点,'驿站');
 const m=structuredClone(messages);m[4].message='<LoreState mode="delta"><地点>森林</地点></LoreState>';assert.equal(replayText(m,fields).state.地点,'森林');
 m[2].message=full.replace('灰色斗篷','白色长袍');assert.equal(replayText(m,fields).state.衣着,'白色长袍');
});
test('初始化与增量提示采用不同格式，完整状态仅注入一份',()=>{
 assert.ok(playPrompt('作者规则',fields,{state:null,errors:[]}).includes('mode="full"'));
 const p=playPrompt('作者规则',fields,replayText(messages,fields));assert.ok(p.includes('mode="delta"'));assert.equal(p.split('<衣着>').length-1,1);
 assert.throws(()=>playPrompt('x'.repeat(24001),fields,{state:null,errors:[]}));
});
