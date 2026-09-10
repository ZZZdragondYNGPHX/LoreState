import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replayState,inspectFloor,preparePrompt} from '../prototype/core.js';
import {collectSnapshots,planRestore,replaySnapshots,historyIdentity,historyMatches} from '../prototype/snapshots.js';
const schema={shared:['地点'],entity:[]};
const msg=(id,value,mode='delta')=>({message_id:id,role:'assistant',message:`旧正文-${id}\n<LoreState version="3" mode="${mode}"><Shared><地点>${value}</地点></Shared></LoreState>`});
const history=()=>[msg(2,'车站','full'),msg(4,'公园'),msg(6,'港口'),msg(8,'街道')];

test('最近五条之外的初始化和增量隐藏后仍回放，诊断可查看隐藏楼层',async()=>{
  const list=history(),expected=replayState(list,schema),before=JSON.stringify(list);
  const hidden=list.map(m=>({...m,is_hidden:m.message_id<4}));
  assert.deepEqual(replayState(hidden,schema),expected);
  hidden[1].is_hidden=true;hidden[2].is_hidden=true;
  assert.deepEqual(replayState(hidden,schema),expected);
  assert.equal(inspectFloor(hidden,schema,1,4).state.shared.地点,'公园');
  const snapshots=await collectSnapshots(hidden,schema,1,null);
  assert.deepEqual(snapshots.map(s=>s.floor),[2,4,6,8]);
  assert.equal(snapshots.at(-1).result.tainted,false);
  assert.equal(JSON.stringify(list),before);
  const prompt=preparePrompt('规则',schema,expected).content;
  assert.ok(prompt.includes('街道'));assert.ok(!prompt.includes('旧正文-'));
});

test('隐藏切换不增加重复快照、不使回档失效，兼容旧前缀隐藏位',async()=>{
  const list=history(),saved=await collectSnapshots(list,schema,1,null);
  const plan=planRestore(saved[0],list,schema,1);
  const hidden=list.map(m=>({...m,is_hidden:true}));
  assert.equal(historyIdentity(list),historyIdentity(hidden));
  assert.deepEqual(await collectSnapshots(hidden,schema,1,null,saved),saved);
  // Existing releases stored the visibility bit in the prefix.
  plan.checkpoint.prefix=JSON.stringify(hidden.map(m=>[m.message_id,m.role,true,0,m.message]));
  assert.ok(historyMatches(list,plan.checkpoint.prefix));
  assert.equal(replaySnapshots(hidden,schema,1,plan.checkpoint).state.shared.地点,'车站');
  hidden.push(msg(10,'山顶'));
  assert.equal(replaySnapshots(hidden,schema,1,plan.checkpoint).state.shared.地点,'山顶');
  for(const mutate of [a=>a[0].message+='改写',a=>a[0].swipe_id=1,a=>a.shift()]){
    const changed=structuredClone(hidden);mutate(changed);
    assert.throws(()=>replaySnapshots(changed,schema,1,plan.checkpoint),/停止回放/);
  }
});

test('隐藏不豁免错误，初始化起点仍有效',()=>{
  const list=history();list[1].is_hidden=true;list[1].message='缺少更新块';
  assert.equal(replayState(list,schema).errors[0].floor,4);
  assert.equal(replayState(history(),schema,4).state,null);
});
