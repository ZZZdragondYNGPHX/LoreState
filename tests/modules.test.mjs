import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseModules,moduleShape} from '../prototype/modules.js';
import {checkSchema,applyState,preparePrompt,replayState,authorPolicy,authorPrompt} from '../prototype/core.js';
import {sameSchema} from '../prototype/presets.js';
import {snapshotSchema} from '../prototype/snapshots.js';
export const rules=`【LoreState模块 v1】
【通用规则】
只记录明确事实。
【公共栏目】
栏目：地点
移动后更新地点。
【模块：人物】
栏目：身体、目标
人物专用规则：普通交谈不改变目标。
【模块：物品】
栏目：持有者、状况
物品专用规则：交付时更新持有者。
【模块：国家】
栏目：外交
国家专用规则：传闻不能改变外交事实。`;
const schema=checkSchema(moduleShape(parseModules(rules)));
const wrap=(body,mode='delta',token='')=>`<LoreState version="3" mode="${mode}"${token?` read="${token}"`:''}>${body}</LoreState>`;
const person='<Entity id="P1" name="林舟" type="人物" identity="书商" mode="full"><身体>健康</身体><目标>交付钥匙</目标></Entity>';
const item='<Entity id="I1" name="铜钥匙" type="物品" identity="仓库门钥匙" mode="full"><持有者>林舟</持有者><状况>完好</状况></Entity>';
const initial=wrap('<Shared><地点>港口</地点></Shared>'+person+item,'full');
const state=applyState(null,initial,schema);
const result=state=>({state,errors:[]});
test('模块声明独立决定分类栏目，初始档案使用同一校验器',()=>{
  assert.deepEqual(schema.modules.物品,['持有者','状况']);
  assert.equal(authorPolicy(schema,initial).initial,initial);
  assert.deepEqual(Object.keys(state.entities.P1.fields),['身体','目标']);
  assert.deepEqual(Object.keys(state.entities.I1.fields),['持有者','状况']);
});
test('跨模块交付一次提交，错类栏目整批拒绝且前态不变',()=>{
  const before=JSON.stringify(state);
  const next=applyState(state,wrap('<Entity id="P1" mode="delta"><目标>返回书店</目标></Entity><Entity id="I1" mode="delta"><持有者>守卫</持有者></Entity>'),schema);
  assert.equal(next.entities.P1.fields.目标,'返回书店');assert.equal(next.entities.I1.fields.持有者,'守卫');
  assert.equal(next.entities.P1.fields.身体,'健康');
  assert.throws(()=>applyState(state,wrap('<Entity id="I1" mode="delta"><持有者>守卫</持有者></Entity><Entity id="P1" mode="delta"><外交>停战</外交></Entity>'),schema),/未知或重复栏目/);
  assert.equal(JSON.stringify(state),before);
});
test('新实体只需所属模块全部栏目，未知类别和缺栏拒绝',()=>{
  const next=applyState(state,wrap('<Entity id="N1" name="北国" type="国家" identity="北方王国" mode="full"><外交>停战</外交></Entity>'),schema);
  assert.deepEqual(next.entities.N1.fields,{外交:'停战'});
  assert.throws(()=>applyState(state,wrap('<Entity id="X1" name="新物" type="未声明" identity="新物" mode="full"><身体>未知</身体></Entity>'),schema),/未声明/);
  assert.throws(()=>applyState(state,wrap(person.replace('P1','P2').replace('<目标>交付钥匙</目标>','')),schema),/全部栏目/);
});
test('详细规则随完整档案加载；目录常驻，初轮加载所有规则',()=>{
  const cold=applyState(state,wrap('<Entity id="I1" mode="delta" presence="cold"/>'),schema);
  const prompt=preparePrompt(rules,schema,result(cold),'和林舟聊天').content;
  assert.ok(prompt.includes('人物专用规则'));assert.ok(!prompt.includes('物品专用规则'));assert.ok(!prompt.includes('国家专用规则'));
  assert.ok(prompt.includes('国家：外交'));assert.ok(prompt.includes('物品：持有者、状况'));
  assert.ok(preparePrompt(rules,schema,result(cold),'看看铜钥匙').content.includes('物品专用规则'));
  assert.ok(preparePrompt(rules,schema,result(cold),'谈谈国家').content.includes('国家专用规则'));
  assert.ok(preparePrompt(rules,schema,result(null)).content.includes('国家专用规则'));
  assert.ok(prompt.includes('未声明事件模块'));assert.ok(!prompt.includes('必须单独建 type="事件"'));
});
test('关联召回携带相应规则，凭据支持当轮冷档更新，未读旧档仍拒绝',()=>{
  const cold=applyState(state,wrap('<Entity id="P1" mode="delta" links="I1"/><Entity id="I1" mode="delta" presence="cold"/>'),schema);
  const token='11111111-1111-4111-8111-111111111111';
  const prepared=preparePrompt(rules,schema,result(cold),'',token);
  assert.deepEqual(prepared.readIds,['I1']);assert.ok(prepared.content.includes('物品专用规则'));
  const patch=wrap('<Entity id="I1" mode="delta"><持有者>守卫</持有者></Entity>','delta',token);
  const receipt={token,ids:prepared.readIds,state:cold,schema:JSON.stringify(schema)};
  assert.equal(applyState(cold,patch,schema,4,receipt).entities.I1.fields.持有者,'守卫');
  assert.throws(()=>applyState(cold,patch,schema,4,{...receipt,ids:[]}),/冷档/);
});
test('结构变化会中止提示准备，换肤不能改变模块归属，回放可复现',()=>{
  assert.throws(()=>preparePrompt(rules.replace('栏目：外交','栏目：政局'),schema,result(state)),/模块声明/);
  const changed=structuredClone(schema);changed.modules.国家=['身体'];changed.modules.人物=['外交','目标'];
  assert.equal(sameSchema(schema,changed),false);assert.notEqual(snapshotSchema(schema,1),snapshotSchema(changed,1));
  assert.deepEqual(replayState([{message_id:1,role:'assistant',message:initial}],schema).state,applyState(null,initial,schema,1));
});
test('拒绝重复分区、畸形版本、重复字段和危险模块键',()=>{
  for(const source of [rules+'\n【模块：人物】\n栏目：身体',rules.replace('v1','v2'),rules.replace('栏目：身体、目标','栏目：身体、身体'),rules.replace('模块：人物','模块：__proto__'),rules.replace('模块：人物','模块：通用规则'),rules.replace('栏目：外交','栏目：外交\n栏目：政局')])assert.throws(()=>checkSchema(moduleShape(parseModules(source))));
});
test('模块字段必填仅作用于拥有该字段的类别',()=>{
  const constrained={...schema,constraints:{entity:{身体:{required:true}}}};
  assert.equal(applyState(null,initial,constrained).entities.I1.fields.状况,'完好');
  assert.throws(()=>applyState(state,wrap('<Entity id="P1" mode="delta"><身体 action="remove"/></Entity>'),constrained),/不允许删除/);
});
test('预算撤下可选完整档案时，同步撤下专用规则和冷档权限',()=>{
  const large=structuredClone(state);large.entities.P1.fields={身体:'健'.repeat(6000),目标:'行'.repeat(6000)};
  large.entities.P1.links=['I1','N1'];large.entities.I1.presence='cold';large.entities.I1.fields={持有者:'守'.repeat(6000),状况:'好'.repeat(6000)};
  large.entities.N1={id:'N1',type:'国家',name:'北国',identity:'北方王国',presence:'cold',links:[],fields:{外交:'和'.repeat(6000)}};
  const prompt=preparePrompt(rules,schema,result(large),'','11111111-1111-4111-8111-111111111111');
  assert.ok(prompt.content.length<=24000);assert.deepEqual(prompt.readIds,[]);
  assert.ok(!prompt.content.includes('国家专用规则'));assert.ok(!prompt.content.includes('物品专用规则'));
  assert.ok(prompt.content.includes('人物专用规则'));assert.ok(prompt.content.includes('国家：外交'));
});
test('作者入口要求明确模块格式，不尝试转换旧条目',()=>{
  assert.throws(()=>authorPrompt('记录人物身体状况'),/不转换旧条目/);
  assert.ok(authorPrompt(rules).includes('data-lore-module="人物"'));
});
