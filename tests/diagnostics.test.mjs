import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replayState,inspectFloor,stateChanges} from '../prototype/core.js';
const schema={shared:['地点'],entity:['近况']};
const wrap=(text,mode='delta')=>`<LoreState version="3" mode="${mode}">\n${text}\n</LoreState>`;
const msg=(floor,message)=>({message_id:floor,role:'assistant',message});
const full=msg(1,wrap('<Shared><地点>车站</地点></Shared>','full'));
const bad=msg(3,wrap('<Shared><地点>码头</地点></Shared>\n<Entity id="P01" name="林舟" identity="书商" mode="full">\n<未知>错误</未知></Entity>'));
test('失败定位到实体与原文行列，后续应用仍标记历史缺口',()=>{
  const result=replayState([full,bad,msg(5,wrap('<Shared><地点>街道</地点></Shared>'))],schema);
  assert.equal(result.errors[0].floor,3);assert.equal(result.errors[0].scope,'Entity P01');
  assert.equal(result.errors[0].line,4);assert.equal(result.errors[0].column,1);
  assert.equal(result.lastGoodFloor,1);assert.equal(result.lastAppliedFloor,5);assert.equal(result.tainted,true);
  assert.equal(result.state.shared.地点,'街道');assert.ok(!JSON.stringify(result.errors).includes('fragment'));
});
test('历史查看不混入未来，失败轮无变化；修正源消息消除缺口',()=>{
  const list=[full,bad,msg(5,wrap('<Shared><地点>街道</地点></Shared>'))];
  assert.equal(inspectFloor(list,schema,1,1).state.shared.地点,'车站');
  assert.deepEqual(inspectFloor(list,schema,1,3).changes,[]);
  list[1]={...bad,message:bad.message.replaceAll('未知','近况')};
  const result=inspectFloor(list,schema,1,5);assert.equal(result.tainted,false);assert.equal(result.lastGoodFloor,5);
  assert.equal(result.changes[0].before,'码头');assert.equal(result.changes[0].after,'街道');
});
test('历史编辑、选中分支替换、删除和初始化前楼层重算',()=>{
  const list=[msg(0,'开场'),full,msg(3,wrap('<Shared><地点>街道</地点></Shared>'))];
  assert.equal(inspectFloor(list,schema,1,0).excluded,true);
  list[2]=msg(3,wrap('<Shared><地点>港口</地点></Shared>'));
  assert.equal(inspectFloor(list,schema,1,3).state.shared.地点,'港口');
  list.pop();assert.equal(replayState(list,schema).state.shared.地点,'车站');
  assert.throws(()=>inspectFloor(list,schema,1,3),/不存在/);
});
test('差异可区分删除、新增和实体离场，快照不受差异计算修改',()=>{
  const before={shared:{地点:'车站'},entities:{P01:{presence:'active'}}};
  const after={shared:{天气:'雨'},entities:{P01:{presence:'cold'}}};
  assert.deepEqual(stateChanges(before,after).map(c=>c.kind),['删除','新增','修改']);
  assert.equal(before.entities.P01.presence,'active');
});
