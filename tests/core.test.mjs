import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyPatch,validateState,extractPatch,KEY,GENESIS,nextBase,replay,stripProtocol} from '../src/core.js';
import {buildPrompt} from '../src/prompt.js';
const patch=(ops,base='base')=>({base,ops});
const fixture=()=>({...emptyState(),data:{places:{harbor:{description:'潮汐港',owner:'商会'}},notes:{'a/b~c':'旧文字'}}});
test('任意领域和稳定非数字编号，无愿档结构依赖',()=>{
 const s=applyPatch(emptyState(),patch([{op:'add',path:'/places',value:{harbor:{description:'潮汐港'}}}]),'base');
 assert.equal(s.data.places.harbor.description,'潮汐港');
});
test('整批原子性、未提及字段保留、无就地修改',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.throws(()=>applyPatch(s,patch([{op:'replace',path:'/places/harbor/owner',value:'居民'},{op:'replace',path:'/missing',value:'失败'}]),'base'));
 assert.deepEqual(s,before);
 const r=applyPatch(s,patch([{op:'replace',path:'/places/harbor/owner',value:'居民'}]),'base');
 assert.equal(r.data.places.harbor.description,'潮汐港');assert.deepEqual(s,before);
});
test('拒绝整段覆盖、删除及错误 base',()=>{
 for(const op of ['replace','remove'])assert.throws(()=>applyPatch(fixture(),patch([{op,path:'/places',value:'丢弃',reason:'理由'}]),'base'));
 assert.throws(()=>applyPatch(fixture(),patch([]),'wrong'));
});
test('JSON Pointer 转义和删除理由',()=>{
 const s=fixture();assert.throws(()=>applyPatch(s,patch([{op:'remove',path:'/notes/a~1b~0c'}]),'base'));
 assert.deepEqual(applyPatch(s,patch([{op:'remove',path:'/notes/a~1b~0c',reason:'失效'}]),'base').data.notes,{});
 assert.throws(()=>applyPatch(s,patch([{op:'add',path:'/notes/a~2',value:'坏路径'}]),'base'));
});
test('类型、危险键、预算均失败关闭',()=>{
 for(const v of [2,true,[],null,''])assert.throws(()=>validateState({...emptyState(),data:{x:v}}));
 assert.throws(()=>applyPatch(emptyState(),JSON.parse('{"base":"base","ops":[{"op":"add","path":"/__proto__","value":{"x":"y"}}]}'),'base'));
 assert.throws(()=>extractPatch('<LoreStatePatch>{}</LoreStatePatch><LoreStatePatch>{}</LoreStatePatch>'));
 assert.throws(()=>extractPatch('<LoreStatePatch>alert(1)</LoreStatePatch>'));
 const s=emptyState();s.data=Object.fromEntries(Array.from({length:10},(_,i)=>[i,'x'.repeat(6000)]));
 assert.throws(()=>buildPrompt({state:s,base:'base'}),/48000/);
});
async function history(){
 const m={mes:'开场'},prefix=await nextBase(GENESIS,m);m.extra={[KEY]:{anchor:{prefix,state:fixture()}}};
 const reply={mes:`正文<LoreStatePatch>${JSON.stringify(patch([{op:'replace',path:'/places/harbor/owner',value:'居民'}],prefix))}</LoreStatePatch>`};
 return [m,reply];
}
test('楼层幂等、删尾回退、历史编辑失效',async()=>{
 const chat=await history();const a=await replay(chat);assert.equal(a.state.data.places.harbor.owner,'居民');
 assert.deepEqual(await replay(chat),a);assert.equal((await replay(chat.slice(0,1))).state.data.places.harbor.owner,'商会');
 chat[0].mes+='编辑';assert.ok((await replay(chat)).error);
});
test('缺失协议阻断、不污染上一版；当前分支由 mes 决定',async()=>{
 const chat=await history();chat[1].mes='另一 swipe 无协议';const r=await replay(chat);
 assert.ok(r.error);assert.equal(r.state.data.places.harbor.owner,'商会');
 assert.equal(stripProtocol('正文<LoreStatePatch>{}</LoreStatePatch>'),'正文');
});
