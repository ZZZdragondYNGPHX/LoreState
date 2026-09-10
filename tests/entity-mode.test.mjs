import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyState,replayState,preparePrompt} from '../prototype/core.js';
const schema={shared:[],entity:['资料']};
const wrap=(body,mode='delta')=>`<LoreState version="3" mode="${mode}">\n${body}\n</LoreState>`;
const entity=(id,mode)=>`<Entity id="${id}" name="名称${id}" identity="身份${id}"${mode===undefined?'':` mode="${mode}"`}><资料>记录</资料></Entity>`;
const full=wrap(entity('P01','full'),'full');
const message=(id,source)=>({message_id:id,role:'assistant',message:source});

test('缺失、新旧用反和大小写错误提供明确日志，失败整轮不应用',()=>{
  for(const [id,mode,expected] of [['P03',undefined,'full'],['P01',undefined,'delta'],['P03','delta','full'],['P01','full','delta'],['P01','Delta','delta'],['P03','Full','full']]){
    const result=replayState([message(2,full),message(10,wrap(entity(id,mode)))],schema);
    const e=JSON.parse(JSON.stringify(result.errors[0]));
    assert.equal(e.code,'ENTITY_MODE');assert.equal(e.entityId,id);
    assert.equal(e.entityExists,id==='P01');assert.equal(e.actualMode,mode??null);
    assert.equal(e.expectedMode,expected);assert.equal(e.floor,10);
    assert.equal(e.line,2);assert.equal(e.column,1);assert.equal(e.scope,`Entity ${id}`);
    assert.ok(e.hint.includes(`mode="${expected}"`));assert.ok(e.hint.includes('不会被实体继承'));
    assert.equal(result.lastAppliedFloor,2);assert.ok(!result.state.entities.P03);
  }
});

test('外层 delta 可以同时更新旧实体和初始化新实体，冷档仍属于旧实体',()=>{
  const state=applyState(null,full,schema);
  const next=applyState(state,wrap('<Entity id="P01" mode="delta"><资料>更新</资料></Entity>'+entity('P03','full')),schema);
  assert.equal(next.entities.P01.fields.资料,'更新');assert.ok(next.entities.P03);
  const cold=applyState(state,wrap('<Entity id="P01" mode="delta" presence="cold"/>'),schema);
  assert.throws(()=>applyState(cold,wrap(entity('P01',undefined)),schema),e=>e.expectedMode==='delta');
});

test('生成提示隔离只读资料和输出模板，所有 Entity 示例均有合法 mode',()=>{
  for(const state of [null,applyState(null,full,schema)]){
    const prompt=preparePrompt('',schema,{state,errors:[]}).content;
    assert.ok(prompt.includes('外层 delta 内可以同时包含新实体 full 和已有实体 delta'));
    assert.ok(prompt.includes('每个 Entity 都有自己的小写 mode'));
    for(const [tag] of prompt.matchAll(/<Entity\b[^>]*>/g))assert.match(tag,/mode="(full|delta)"/);
    assert.equal(prompt.includes('<EntityRecord id="P01"'),!!state);
    assert.ok(!prompt.includes('confirmed="未知"'));
  }
});
