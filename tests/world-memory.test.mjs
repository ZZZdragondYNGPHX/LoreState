import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState,playPrompt,projectEntities,replayState} from '../prototype/core.js';
import {collectSnapshots,planRestore,replaySnapshots} from '../prototype/snapshots.js';

const schema={shared:['时间'],entity:['概况']};
const wrap=(body,mode='delta')=>`<LoreState version="3" mode="${mode}">${body}</LoreState>`;
const entity=(id,type,attrs='',text=`${id}完整事实`)=>`<Entity id="${id}" name="名称${id}" identity="稳定身份${id}" type="${type}" mode="full" ${attrs}><概况>${text}</概况></Entity>`;
const initial=()=>applyState(null,wrap('<Shared><时间>第三天</时间></Shared>'+entity('N01','国家','presence="cold"')+entity('I01','物品','presence="cold" links="N01"')+entity('P01','人物','links="I01"')+entity('O01','组织','presence="cold"')+entity('L01','地点','presence="cold"'),'full'),schema);

test('国家物品人物组织地点共用冷热存储，一跳召回不递归且不改状态',()=>{
  const state=initial(),copy=structuredClone(state),projection=projectEntities(state);
  assert.deepEqual(projection.full.map(e=>e.id),['I01','P01']);
  assert.deepEqual(projection.retrieved,['I01']);assert.deepEqual(state,copy);
  const prompt=playPrompt('规则',schema,{state,errors:[]});
  assert.ok(prompt.includes('第三天'));assert.ok(prompt.includes('I01完整事实'));assert.ok(!prompt.includes('N01完整事实'));
  assert.ok(playPrompt('规则',schema,{state,errors:[]},'寻找名称N01').includes('N01完整事实'));
});

test('未完成事件不能转冷，参与者转冷后事件仍在提示中，完成后可冷藏',()=>{
  let state=applyState(initial(),wrap(entity('E01','事件','pending="true" links="P01"','三天后送货，尚未交付')),schema);
  state=applyState(state,wrap('<Entity id="P01" mode="delta" presence="cold"/>'),schema);
  assert.ok(playPrompt('',schema,{state,errors:[]}).includes('三天后送货，尚未交付'));
  assert.throws(()=>applyState(state,wrap('<Entity id="E01" mode="delta" presence="cold"/>'),schema),/未完成事件/);
  state=applyState(state,wrap('<Entity id="E01" mode="delta" pending="false" presence="cold"><概况>送货完成</概况></Entity>'),schema);
  assert.ok(!playPrompt('',schema,{state,errors:[]}).includes('送货完成'));
  assert.equal(state.entities.E01.fields.概况,'送货完成');
});

test('关联和事件属性严格校验且整轮原子提交，支持同轮前向引用',()=>{
  const state=initial();
  for(const attrs of ['links="missing"','links="P01"','links="I01 I01"','pending="true"','pending="yes"','type="国家"']){
    assert.throws(()=>applyState(state,wrap('<Shared><时间>第四天</时间></Shared>'+`<Entity id="P01" mode="delta" ${attrs}/>`),schema));
    assert.equal(state.shared.时间,'第三天');
  }
  const next=applyState(state,wrap(entity('E01','事件','pending="true" links="X01"')+entity('X01','自定义类别')),schema);
  assert.deepEqual(next.entities.E01.links,['X01']);
  assert.deepEqual(applyState(next,wrap('<Entity id="E01" mode="delta" links=""/>'),schema).entities.E01.links,[]);
});

test('确认时间与来源楼层保持确定性；冷热及召回不刷新事实时间',()=>{
  const messages=[{message_id:1,role:'assistant',message:wrap('<Shared><时间>第三天</时间></Shared>'+entity('N01','国家','confirmed="第三天清晨"'),'full')},
    {message_id:3,role:'assistant',message:wrap('<Entity id="N01" mode="delta" presence="cold"/>')}];
  let result=replayState(messages,schema);
  assert.equal(result.state.entities.N01.confirmedFloor,1);assert.equal(result.state.entities.N01.confirmed,'第三天清晨');
  projectEntities(result.state,'N01');assert.equal(result.state.entities.N01.confirmedFloor,1);
  messages.push({message_id:5,role:'assistant',message:wrap('<Entity id="N01" mode="delta" presence="active"/>')});
  messages.push({message_id:7,role:'assistant',message:wrap('<Entity id="N01" mode="delta"><概况>正式停战</概况></Entity>')});
  result=replayState(messages,schema);assert.equal(result.state.entities.N01.confirmedFloor,7);assert.equal(result.state.entities.N01.confirmed,null);
  assert.equal(replayState(messages.slice(0,-1),schema).state.entities.N01.confirmedFloor,1);
});

test('索引有限但完整冷档仍可精确召回，同名实体不猜测',()=>{
  const body=Array.from({length:40},(_,i)=>entity(`N${i}`,'国家','presence="cold"')).join('');
  const state=applyState(null,wrap('<Shared><时间>第一天</时间></Shared>'+body,'full'),schema);
  assert.equal(projectEntities(state).index.length,24);assert.equal(projectEntities(state).omitted,16);
  assert.equal(projectEntities(state,'N39').full[0].id,'N39');assert.equal(projectEntities(state,'N3').full[0].id,'N3');
  state.entities.N38.name=state.entities.N39.name='同名国家';
  assert.equal(projectEntities(state,'同名国家').full.length,0);
});

test('关联召回最多八项且循环不扩散',()=>{
  const ids=Array.from({length:16},(_,i)=>`I${i}`);
  const body=ids.map(id=>entity(id,'物品','presence="cold" links="P01"')).join('')+entity('P01','人物',`links="${ids.slice(0,8).join(' ')}"`)+entity('P02','人物',`links="${ids.slice(8).join(' ')}"`);
  const state=applyState(null,wrap('<Shared><时间>第一天</时间></Shared>'+body,'full'),schema);
  const projection=projectEntities(state);assert.equal(projection.retrieved.length,8);assert.equal(projection.deferred.length,8);
});

test('预算不足只撤下完整可选档案，活动事件和常驻资料不截断',()=>{
  const body=Array.from({length:5},(_,i)=>entity(`I${i}`,'物品','presence="cold"',`${i}机密`+'字'.repeat(5000))).join('')+entity('E01','事件','pending="true" links="I0 I1 I2 I3 I4"','必保活动事件');
  const state=applyState(null,wrap('<Shared><时间>第一天</时间></Shared>'+body,'full'),schema),before=JSON.stringify(state);
  const prompt=playPrompt('',schema,{state,errors:[]});assert.ok(prompt.length<=24000);assert.ok(prompt.includes('必保活动事件'));assert.ok(!prompt.includes('4机密'));assert.equal(JSON.stringify(state),before);
  assert.throws(()=>playPrompt('字'.repeat(24000),schema,{state,errors:[]}),/完整状态未截断/);
});

test('新协议拒绝旧标签、旧配置与旧状态；不存在自动迁移',()=>{
  assert.throws(()=>applyState(null,wrap('<Shared><时间>第一天</时间></Shared>','full').replace('version="3"','version="2"'),schema));
  assert.throws(()=>applyState(initial(),wrap('<Person id="P01" mode="delta"/>'),schema));
  assert.throws(()=>applyState(null,wrap('','full'),{shared:[],person:['概况']}));
  assert.throws(()=>applyState({version:2,shared:{},people:{}},wrap(''),schema));
});

test('冷热和事件完整快照支持保留正文回档、新回复与重抽分支',async()=>{
  const list=[{message_id:1,role:'assistant',message:wrap('<Shared><时间>第一天</时间></Shared>'+entity('N01','国家')+entity('E01','事件','pending="true" links="N01"'),'full')},
    {message_id:3,role:'assistant',message:wrap('<Entity id="N01" mode="delta" presence="cold"/>')}];
  const saved=await collectSnapshots(list,schema,1,null),plan=planRestore(saved[0],list,schema,1);
  assert.equal(replaySnapshots(list,schema,1,plan.checkpoint).state.entities.N01.presence,'active');
  const branch=[...list,{message_id:5,role:'assistant',swipe_id:1,message:wrap('<Entity id="E01" mode="delta" pending="false" presence="cold"/>')}];
  assert.equal(replaySnapshots(branch,schema,1,plan.checkpoint).state.entities.E01.pending,false);
  assert.equal(saved[0].result.state.entities.E01.pending,true);
});
