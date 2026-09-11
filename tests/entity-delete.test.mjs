import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState as coreApplyState,preparePrompt as corePreparePrompt} from '../prototype/core.js';
import {installEntityDeleteProtocol} from '../prototype/entity-delete.js';

const schema={shared:[],entity:['资料']};
let applyState=coreApplyState,preparePrompt=corePreparePrompt;
installEntityDeleteProtocol({
  getApplyState:()=>applyState,
  setApplyState:value=>{applyState=value;},
  getPreparePrompt:()=>preparePrompt,
  setPreparePrompt:value=>{preparePrompt=value;},
});
const wrap=(body,mode='delta')=>`<LoreState version="3" mode="${mode}">\n${body}\n</LoreState>`;
const fullEntity=(id,name=id,links='')=>`<Entity id="${id}" name="${name}" identity="识别${id}" type="人物" mode="full"${links?` links="${links}"`:''}><资料>记录${id}</资料></Entity>`;
const initial=()=>applyState(null,wrap(fullEntity('P01')+fullEntity('P02','P02','P01'),'full'),schema);

test('可用 action=remove 删除整个已加载实体并永久保留编号',()=>{
  const state=initial();
  const next=applyState(state,wrap('<Entity id="P02" mode="delta" links=""/><Entity id="P01" mode="delta" action="remove" reason="误建档案"/>'),schema);
  assert.ok(!next.entities.P01);
  assert.ok(next.entities.P02);
  assert.deepEqual(next.deletedEntityIds,['P01']);
  assert.throws(()=>applyState(next,wrap(fullEntity('P01')),schema),/已删除并永久保留，不得复用/);
});

test('仍被 links 引用时拒绝删除，必须同轮先解除关联',()=>{
  const state=initial();
  assert.throws(()=>applyState(state,wrap('<Entity id="P01" mode="delta" action="remove" reason="误建档案"/>'),schema),/仍关联待删除实体 P01/);
  assert.ok(state.entities.P01);
});

test('冷档未完整取回时拒绝整体删除，有有效 read 凭据时允许',()=>{
  const state=applyState(null,wrap(fullEntity('P01'),'full'),schema);
  const cold=applyState(state,wrap('<Entity id="P01" mode="delta" presence="cold"/>'),schema);
  const source=wrap('<Entity id="P01" mode="delta" action="remove" reason="确认误建"/>');
  assert.throws(()=>applyState(cold,source,schema),/完整取回并持有有效 read 凭据/);
  const receipt={token:'00000000-0000-0000-0000-000000000001',schema:JSON.stringify(schema),state:cold,ids:['P01']};
  const withRead=source.replace('<LoreState version="3" mode="delta">',`<LoreState version="3" mode="delta" read="${receipt.token}">`);
  const next=applyState(cold,withRead,schema,null,receipt);
  assert.ok(!next.entities.P01);
});

test('实体删除必须自闭合、提供原因且不能与同编号更新混用',()=>{
  const state=applyState(null,wrap(fullEntity('P01'),'full'),schema);
  assert.throws(()=>applyState(state,wrap('<Entity id="P01" mode="delta" action="remove"></Entity>'),schema),/自闭合/);
  assert.throws(()=>applyState(state,wrap('<Entity id="P01" mode="delta" action="remove"/>'),schema),/必须提供 1–200 字符的 reason/);
  assert.throws(()=>applyState(state,wrap('<Entity id="P01" mode="delta" action="remove" reason="误建"/><Entity id="P01" mode="delta"><资料>更新</资料></Entity>'),schema),/同轮不能既删除又进行其他更新/);
});

test('状态提示向 AI 暴露安全的整体删除语法',()=>{
  const state=applyState(null,wrap(fullEntity('P01'),'full'),schema);
  const prompt=preparePrompt('',schema,{state,errors:[]}).content;
  assert.ok(prompt.includes('action="remove" reason="具体原因"'));
  assert.ok(prompt.includes('不要用删除代替 presence="cold"'));
  assert.ok(prompt.includes('删除后的编号永久禁用'));
});
