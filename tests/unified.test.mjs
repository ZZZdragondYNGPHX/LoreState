import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState,replayState,playPrompt,checkSchema} from '../prototype/core.js';
const schema={shared:['地点'],person:['近况']};
const wrap=(body,mode='delta')=>`<LoreState version="2" mode="${mode}">${body}</LoreState>`;
const first=wrap('<Shared><地点>车站</地点></Shared><Person id="P01" name="林舟" identity="书商" mode="full"><近况>保管蓝色钥匙</近况></Person>','full');
test('公共与人物同轮更新，共用一份状态且原状态不变',()=>{
  const initial=applyState(null,first,schema);
  const next=applyState(initial,wrap('<Shared><地点>码头</地点></Shared><Person id="P01" mode="delta"><近况>归还蓝色钥匙</近况></Person>'),schema);
  assert.equal(next.shared.地点,'码头');assert.equal(next.people.P01.fields.近况,'归还蓝色钥匙');
  assert.equal(initial.shared.地点,'车站');assert.equal(initial.people.P01.fields.近况,'保管蓝色钥匙');
  assert.deepEqual(applyState(next,wrap(''),schema),next);
});
test('混合批次任意位置失败，都不会提交半份状态',()=>{
  const initial=applyState(null,first,schema);
  for(const body of [
    '<Shared><地点>码头</地点></Shared><Person id="P01" mode="delta"><未知>错误</未知></Person>',
    '<Person id="P01" mode="delta"><近况>已归还</近况></Person><Shared><未知>错误</未知></Shared>',
    '<Shared><地点>码头</地点></Shared><Shared><地点>街道</地点></Shared>',
  ]){
    const replay=replayState([{message_id:2,role:'assistant',message:first},{message_id:4,role:'assistant',message:wrap(body)}],schema);
    assert.deepEqual(replay.state,initial);assert.equal(replay.errors.length,1);
  }
});
test('无旧协议与旧 schema 兼容；混合初始化不可漏公共字段',()=>{
  assert.throws(()=>applyState(null,first.replace(' version="2"',''),schema));
  assert.throws(()=>checkSchema(['地点']));assert.throws(()=>checkSchema({shared:[],person:[]}));
  assert.throws(()=>applyState(null,wrap('','full'),schema));
  assert.throws(()=>applyState(null,first,{shared:['地点'],person:[]}));
});
test('共享与人物同名栏目独立；冷档不影响公共提示',()=>{
  const same={shared:['近况'],person:['近况']};
  const initial=applyState(null,first.replaceAll('地点','近况'),same);
  const cold=applyState(initial,wrap('<Person id="P01" mode="delta" presence="cold"/>'),same);
  const prompt=playPrompt('规则',same,{state:cold,errors:[]});
  assert.ok(prompt.includes('车站'));assert.ok(!prompt.includes('保管蓝色钥匙'));
  assert.ok(playPrompt('规则',same,{state:cold,errors:[]},'找林舟').includes('保管蓝色钥匙'));
  assert.equal(cold.people.P01.presence,'cold');
});
