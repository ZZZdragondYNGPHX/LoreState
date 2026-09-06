import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState,replayState,playPrompt,checkFields,xmlText,TAG_PATTERN} from '../prototype/core.js';
const fields={shared:['地点','衣着','身体状况'],person:[]};
const full='故事<LoreState version="2" mode="full"><Shared><地点>驿站</地点><衣着>灰色斗篷</衣着><身体状况>健康</身体状况></Shared></LoreState>';
const messages=[{message_id:0,role:'assistant',message:'开场白'},{message_id:1,role:'user',message:'去集市'},{message_id:2,role:'assistant',message:full},{message_id:3,role:'user',message:'继续'},{message_id:4,role:'assistant',message:'故事二<LoreState version="2" mode="delta"><Shared><地点>集市</地点></Shared></LoreState>'}];
test('首次完整，后续只改一项，正文与未变化的文字保留',()=>{
 const r=replayState(messages,fields);assert.deepEqual(r.state.shared,{地点:'集市',衣着:'灰色斗篷',身体状况:'健康'});assert.deepEqual(r.errors,[]);
 assert.equal(full.replace(new RegExp(TAG_PATTERN,'g'),''),'故事');
});
test('首次缺栏目或直接 delta 拒绝；第二次 full 拒绝',()=>{
 assert.throws(()=>applyState(null,'<LoreState version="2" mode="full"><Shared><地点>驿站</地点></Shared></LoreState>',fields));
 assert.throws(()=>applyState(null,'<LoreState mode="delta"/>',fields));
 const s=replayState(messages.slice(0,3),fields).state;assert.throws(()=>applyState(s,full,fields));
});
test('错误批次保留上一版，不阻断后续回复；修复后可重复重算',()=>{
 const m=structuredClone(messages);m[4].message='<LoreState version="2" mode="delta"><Shared><地点>新地址</地点><未知>错误</未知></Shared></LoreState>';
 const r=replayState(m,fields);assert.equal(r.state.shared.地点,'驿站');assert.equal(r.errors[0].floor,4);
 m.push({message_id:6,role:'assistant',message:'<LoreState version="2" mode="delta"><Shared><衣着>雨衣</衣着></Shared></LoreState>'});assert.equal(replayState(m,fields).state.shared.衣着,'雨衣');
 m[4]=messages[4];assert.deepEqual(replayState(m,fields),replayState(m,fields));assert.equal(replayState(m,fields).errors.length,0);
});
test('明确移除与遗漏不同，可再次新增已移除内容',()=>{
 const s=replayState(messages,fields).state,r=applyState(s,'<LoreState version="2" mode="delta"><Shared><身体状况 action="remove"/></Shared></LoreState>',fields);
 assert.ok(!Object.hasOwn(r.shared,'身体状况'));assert.equal(r.shared.衣着,'灰色斗篷');assert.equal(s.shared.身体状况,'健康');
 assert.equal(applyState(r,'<LoreState version="2" mode="delta"><Shared><身体状况>轻伤</身体状况></Shared></LoreState>',fields).shared.身体状况,'轻伤');
});
test('空 delta、实体与标签安全',()=>{
 const s=replayState(messages,fields).state;assert.deepEqual(applyState(s,'<LoreState version="2" mode="delta"><Shared></Shared></LoreState>',fields),s);
 assert.equal(applyState(s,'<LoreState version="2" mode="delta"><Shared><地点>A &amp; B &lt;门&gt;</地点></Shared></LoreState>',fields).shared.地点,'A & B <门>');
 for(const bad of ['<LoreState version="2" mode="delta"><Shared><地点><script>x</script></地点></Shared></LoreState>','<LoreState version="2" mode="delta"><Shared><地点>&bad;</地点></Shared></LoreState>',full+full,'<LoreState version="2" mode="delta"><Shared><地点>A</地点><地点>B</地点></Shared></LoreState>'])assert.throws(()=>applyState(s,bad,fields));
 assert.throws(()=>checkFields(['__proto__']));assert.equal(xmlText('<x>'),'&lt;x&gt;');
});
test('删除尾部、重抽正文和重新编辑均按现存消息计算',()=>{
 assert.equal(replayState(messages.slice(0,4),fields).state.shared.地点,'驿站');
 const m=structuredClone(messages);m[4].message='<LoreState version="2" mode="delta"><Shared><地点>森林</地点></Shared></LoreState>';assert.equal(replayState(m,fields).state.shared.地点,'森林');
 m[2].message=full.replace('灰色斗篷','白色长袍');assert.equal(replayState(m,fields).state.shared.衣着,'白色长袍');
});
test('初始化与增量提示采用不同格式，完整状态仅注入一份',()=>{
 assert.ok(playPrompt('作者规则',fields,{state:null,errors:[]}).includes('mode="full"'));
 const p=playPrompt('作者规则',fields,replayState(messages,fields));assert.ok(p.includes('mode="delta"'));assert.equal(p.split('<衣着>').length-1,1);
 assert.throws(()=>playPrompt('x'.repeat(24001),fields,{state:null,errors:[]}));
});
