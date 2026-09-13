import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectEntities} from '../prototype/template.js';

const entities = Object.freeze({
  first: Object.freeze({id:'P2',name:'同名',type:'人物',presence:'active'}),
  second: Object.freeze({id:'P1',name:'同名',type:'人物',presence:'cold'}),
  unknown: Object.freeze({id:'P3',type:'人物',presence:'unknown'}),
  noPresence: Object.freeze({id:'P4',type:'人物'}),
  item: Object.freeze({id:'I1',type:'物品',presence:'active'}),
});
const state = Object.freeze({entities});

test('Template v2 纯查询保持遍历顺序，all 不推断未知 presence',()=>{
  assert.deepEqual(selectEntities(state,{type:'人物'}).map(e=>e.id),['P2']);
  assert.deepEqual(selectEntities(state,{type:'人物',presence:'cold'}).map(e=>e.id),['P1']);
  assert.deepEqual(selectEntities(state,{type:'人物',presence:'all'}).map(e=>e.id),['P2','P1']);
  assert.deepEqual(selectEntities(null,{type:'人物'}),[]);
});

test('Template v2 精确 ID 与 limit 不推断玩家、名称或时间',()=>{
  const before=JSON.stringify(state);
  assert.equal(selectEntities(state,{type:'人物',presence:'all',selectId:'P1'})[0],entities.second);
  assert.deepEqual(selectEntities(state,{type:'人物',presence:'all',selectId:'p1'}),[]);
  assert.deepEqual(selectEntities(state,{type:'人物',presence:'all',limit:1}),[entities.first]);
  assert.equal(JSON.stringify(state),before);
});

test('Template v2 拒绝非法内部查询参数',()=>{
  for(const limit of [0,-1,1.5,101,NaN,'2']) assert.throws(()=>selectEntities(state,{type:'人物',limit}),/limit/);
  for(const presence of ['',null,'pending']) assert.throws(()=>selectEntities(state,{type:'人物',presence}),/presence/);
  for(const selectId of ['',2,false]) assert.throws(()=>selectEntities(state,{type:'人物',selectId}),/selectId/);
});
