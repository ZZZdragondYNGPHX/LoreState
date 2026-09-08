import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState,authorPolicy,initialResult,replayState,playPrompt,checkSchema} from '../prototype/core.js';
import {collectSnapshots,replaySnapshots,planRestore} from '../prototype/snapshots.js';
const fields={shared:['地点','时间'],entity:['状态']};
const initial='<LoreState version="3" mode="full"><Shared><地点>港口</地点><时间>未知</时间></Shared><Entity id="P1" name="书商" identity="港口书商" mode="full"><状态>在场</状态></Entity></LoreState>';
const wrap=body=>`<LoreState version="3" mode="delta">${body}</LoreState>`;
const schema=()=>({...fields,...authorPolicy(fields,initial,{shared:{地点:{required:true},时间:{noRemove:true}},entity:{状态:{enum:['在场','离开','未知']}}})});
test('作者初值先于首轮生效，delta 接续且不伪造来源楼层',()=>{
  const s=schema(),seed=initialResult(s),before=JSON.stringify(seed);
  assert.equal(seed.state.shared.地点,'港口');assert.equal(seed.state.entities.P1.confirmedFloor,null);
  assert.ok(playPrompt('',s,seed).includes('mode="delta"'));assert.ok(playPrompt('',s,seed).includes('不擅自补造事实'));
  const next=replayState([{message_id:1,role:'assistant',message:wrap('<Shared><地点>书店</地点></Shared>')}],s);
  assert.equal(next.state.shared.时间,'未知');assert.equal(next.state.shared.地点,'书店');assert.equal(JSON.stringify(seed),before);
  assert.equal(replayState([],s).state.shared.地点,'港口');
});
test('必填、禁止删除和允许取值整批校验，不部分修改状态',()=>{
  const s=schema(),state=initialResult(s).state;
  for(const body of ['<Shared><地点 action="remove"/></Shared>','<Shared><时间 action="remove"/></Shared>','<Shared><地点>新址</地点></Shared><Entity id="P1" mode="delta"><状态>猜测</状态></Entity>']){
    assert.throws(()=>applyState(state,wrap(body),s));assert.equal(state.shared.地点,'港口');
  }
  assert.equal(applyState(state,wrap('<Entity id="P1" mode="delta"><状态>离开</状态></Entity>'),s).entities.P1.fields.状态,'离开');
});
test('拒绝拼错字段、错误规则类型、空/重复枚举和非法初始档案',()=>{
  for(const c of [{unknown:{}},{shared:{未知:{}}},{shared:{地点:{script:'x'}}},{shared:{地点:{required:'true'}}},{entity:{状态:{enum:[]}}},{entity:{状态:{enum:['在场','在场']}}},{entity:{状态:{enum:[' 在场']}}}])assert.throws(()=>authorPolicy(fields,initial,c));
  assert.throws(()=>authorPolicy(fields,initial.replace('在场','非法'),{entity:{状态:{enum:['在场']}}}));
  assert.throws(()=>authorPolicy(fields,initial.replace('mode="full"','mode="delta"')));
  assert.throws(()=>checkSchema({...fields,initial:42}));assert.deepEqual(authorPolicy(fields),{});
});
test('作者配置随快照签名冻结，回档与再次重放保留初值',async()=>{
  const s=schema(),messages=[{message_id:1,role:'assistant',message:wrap('<Shared><地点>山顶</地点></Shared>')}];
  const snapshots=await collectSnapshots(messages,s,1,null),plan=planRestore(snapshots[0],messages,s,1);
  assert.equal(replaySnapshots(messages,s,1,plan.checkpoint).state.shared.时间,'未知');
  assert.throws(()=>planRestore(snapshots[0],messages,{...s,initial:initial.replace('港口','码头')},1),/不兼容/);
});
