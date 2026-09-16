import test from 'node:test';
import assert from 'node:assert/strict';
import {applyState,preparePrompt,replayState} from '../prototype/core.js';
import {parseStateReview,REVIEW_PATTERN,stateReviewPrompt} from '../prototype/state-review.js';
import {validateExtraUpdate,variableStory,extraUpdateRetryHint,settleContinuedMessage,splitTruncatedUpdate} from '../prototype/extra-update.js';
import {addReadReceipt,emptySnapshotStore,readReceipt} from '../prototype/snapshot-store.js';
import {installEntityDeleteProtocol} from '../prototype/entity-delete.js';
import {normalizeUpdateSettings} from '../prototype/api-profiles.js';

const schema={shared:['地点'],entity:['资料']};
const wrap=(body,mode='delta',token='')=>`<LoreState version="3" mode="${mode}"${token?` read="${token}"`:''}>${body}</LoreState>`;
const check=(path,change=true)=>({path,change,reason:change?'本轮事实变化':'没有新事实'});
const review=checks=>`<LoreStateReview>${JSON.stringify(checks)}</LoreStateReview>`;
const full=wrap('<Shared><地点>车站</地点></Shared><Entity id="P01" name="甲" identity="旅客" type="人物" mode="full"><资料>持有钥匙</资料></Entity>','full');
const old=()=>applyState(null,full,schema);
const checks=()=>[check('/shared/地点'),check('/entities/P01/fields/资料',false)];

test('自定义核对规则校验、默认、提示注入及删除扩展转发',()=>{
  assert.equal(normalizeUpdateSettings({}).reviewInstructions,'');
  assert.equal(normalizeUpdateSettings({reviewInstructions:'  物品转移核对持有人  '}).reviewInstructions,'物品转移核对持有人');
  for(const value of [7,{},'a'.repeat(6001)])assert.throws(()=>normalizeUpdateSettings({reviewInstructions:value}),/6000/);
  let apply=applyState,prompt=preparePrompt;
  installEntityDeleteProtocol({getApplyState:()=>apply,setApplyState:f=>{apply=f;},getPreparePrompt:()=>prompt,setPreparePrompt:f=>{prompt=f;}});
  const config={state:old(),errors:[]},custom='好感度仅在明确的信任事件后更新';
  assert.ok(prompt('记录',schema,config,'','','combined',custom).content.includes(custom));
  assert.doesNotMatch(prompt('记录',schema,config,'','','combined',custom).content,/重点检查时间推进|物品转移|关系依据和事件进展/);
  assert.ok(!prompt('记录',schema,config,'','','narration',custom).content.includes(custom));
  assert.ok(!prompt('记录',schema,config).content.includes(custom));
});

test('核对提示只使用作者规则语义并逐字列出真实栏目路径',()=>{
  const exactSchema={shared:['当前时间','当前地点'],entity:['身份与关系定位','当前位置']};
  const state={version:3,shared:{当前时间:'17:00',当前地点:'客厅'},entities:{
    P01:{id:'P01',name:'甲',identity:'测试人物',type:'人物',links:[],pending:false,confirmed:null,presence:'active',fields:{身份与关系定位:'朋友',当前位置:'客厅'}},
    P02:{id:'P02',name:'乙',identity:'冷档人物',type:'人物',links:[],pending:false,confirmed:null,presence:'cold',fields:{身份与关系定位:'同学',当前位置:'学校'}},
  }};
  const prompt=stateReviewPrompt(exactSchema,state,[]);
  for(const path of ['/shared/当前时间','/shared/当前地点','/entities/P01/fields/身份与关系定位','/entities/P01/fields/当前位置','/entities/P02/presence'])assert.ok(prompt.includes(path),path);
  assert.ok(!prompt.includes('/entities/P02/fields/身份与关系定位'));
  assert.doesNotMatch(prompt,/"path":"\/shared\/地点"|重点检查时间推进|物品转移|关系依据和事件进展/);
  assert.match(prompt,/不得缩写、改名、翻译或同义改写/);
});

test('真实公共栏目名可通过核对，缩写路径被拒绝并提示逐字使用',()=>{
  const exactSchema={shared:['当前时间','当前地点'],entity:[]};
  const initial=review([check('/shared/当前时间'),check('/shared/当前地点')])+`<LoreState version="3" mode="full"><Shared><当前时间>17:00</当前时间><当前地点>客厅</当前地点></Shared></LoreState>`;
  const state=applyState(null,initial,exactSchema);
  const good=review([check('/shared/当前时间'),check('/shared/当前地点',false)])+`<LoreState version="3" mode="delta"><Shared><当前时间>17:10</当前时间></Shared></LoreState>`;
  assert.equal(applyState(state,good,exactSchema).shared.当前时间,'17:10');
  const bad=review([check('/shared/时间'),check('/shared/当前地点',false)])+`<LoreState version="3" mode="delta"><Shared><当前时间>17:10</当前时间></Shared></LoreState>`;
  assert.throws(()=>applyState(state,bad,exactSchema),/\/shared\/时间.*逐字使用/);
});

test('核对先于更新、逐项覆盖，摘要不进入状态且旧消息可回放',()=>{
  const source=review(checks())+wrap('<Shared><地点>书店</地点></Shared>');
  const next=applyState(old(),source,schema);
  assert.equal(next.shared.地点,'书店');assert.equal(JSON.stringify(next).includes('reason'),false);
  assert.equal(replayState([{message_id:1,role:'assistant',message:full},{message_id:2,role:'assistant',message:'剧情'+source}],schema).errors.length,0);
  assert.equal(variableStory('剧情'+source),'剧情');
  assert.equal(source.replace(new RegExp(REVIEW_PATTERN,'g'),''),wrap('<Shared><地点>书店</地点></Shared>'));
  assert.match(preparePrompt('记录',schema,{state:old(),errors:[]}).content,/本轮固定必查路径/);
  assert.doesNotMatch(preparePrompt('记录',schema,{state:old(),errors:[]},'','','narration').content,/<LoreStateReview>/);
});

test('漏写、伪变化、保留冲突、漏查、非法与重复路径均拒绝且前态不变',()=>{
  const previous=old(),saved=JSON.stringify(previous),patch=wrap('<Shared><地点>书店</地点></Shared>');
  for(const [summary,update,pattern] of [
    [checks(),wrap(''),/计划更新/],
    [checks(),wrap('<Shared><地点>车站</地点></Shared>'),/计划更新/],
    [[check('/shared/地点',false),check('/entities/P01/fields/资料',false)],patch,/声明保留/],
    [[check('/shared/地点')],patch,/遗漏栏目/],
    [[...checks(),check('/entities/P99/fields/资料')],patch,/未配置或未完整加载/],
    [[...checks(),check('/shared/地点')],patch,/重复/],
  ])assert.throws(()=>applyState(previous,review(summary)+update,schema),pattern);
  assert.equal(JSON.stringify(previous),saved);
});

test('核对支持初始化、无变化、移除栏目、新实体和冷档权限',()=>{
  const init=review([check('/shared/地点'),check('/entities/P01/fields/资料')])+full;
  assert.deepEqual(applyState(null,init,schema),old());
  const unchanged=review([check('/shared/地点',false),check('/entities/P01/fields/资料',false)])+wrap('');
  assert.deepEqual(applyState(old(),unchanged,schema),old());
  const remove=review([check('/shared/地点',false),check('/entities/P01/fields/资料')])+wrap('<Entity id="P01" mode="delta"><资料 action="remove"/></Entity>');
  assert.equal(Object.hasOwn(applyState(old(),remove,schema).entities.P01.fields,'资料'),false);
  const cold=applyState(old(),wrap('<Entity id="P01" mode="delta" presence="cold"/>'),schema);
  const wake=review([check('/shared/地点',false),check('/entities/P01/presence')])+wrap('<Entity id="P01" mode="delta" presence="active"/>');
  assert.equal(applyState(cold,wake,schema).entities.P01.presence,'active');
  assert.throws(()=>applyState(cold,review([check('/shared/地点',false),check('/entities/P01/fields/资料',false)])+wrap(''),schema),/未完整加载/);
});

test('摘要格式、顺序和边界严格校验',()=>{
  const block=wrap('');
  for(const source of [review([])+review([])+block,block+review([]),'<LoreStateReview>[]'+block,review([{...check('/shared/地点'),change:'true'}])+block,review([{...check('/shared/地点'),reason:'<Entity>'}])+block,review([])+'多余解释'+block])assert.throws(()=>parseStateReview(source));
  assert.throws(()=>parseStateReview(block,true),/缺少/);
  assert.equal(parseStateReview(block),null);
});

test('历史同名栏目不被误认作外部核对摘要',()=>{
  const fields={shared:['LoreStateReview'],entity:[]};
  const source=wrap('<Shared><LoreStateReview>旧栏目原文</LoreStateReview></Shared>','full');
  assert.equal(parseStateReview(source),null);
  assert.equal(applyState(null,source,fields).shared.LoreStateReview,'旧栏目原文');
  assert.equal(variableStory('正文'+source),'正文');
});

test('额外模型必须核对，成功只写更新块，失败带精确纠错并保留正文',async()=>{
  const previous=old(),token='00000000-0000-4000-8000-000000000001';
  const store=await addReadReceipt(emptySnapshotStore(),token,previous,schema,[]);
  const patch=wrap('<Shared><地点>书店</地点></Shared>','delta',token),receipt=readReceipt(patch,store);
  const original='正文 A & B。'+review([check('/shared/地点',false),check('/entities/P01/fields/资料',false)])+wrap('');
  assert.throws(()=>validateExtraUpdate(patch,original,previous,schema,2,receipt,true),/缺少/);
  assert.match(extraUpdateRetryHint(patch),/缺少 LoreStateReview/);
  assert.throws(()=>validateExtraUpdate(review(checks())+wrap('','delta',token),original,previous,schema,2,receipt,true),/计划更新/);
  assert.match(extraUpdateRetryHint(patch),/\/shared\/地点/);
  const updated=validateExtraUpdate(review(checks())+patch,original,previous,schema,2,receipt,true);
  assert.equal(updated,'正文 A & B。'+patch);assert.equal(extraUpdateRetryHint(patch),'');
  assert.equal(variableStory(updated),'正文 A & B。');
  const continued=settleContinuedMessage('旧正文'+wrap(''),'旧正文'+wrap('')+'新正文'+review(checks())+patch,'inline',previous,schema,2,receipt);
  assert.equal(variableStory(continued),'旧正文新正文');assert.equal(continued.includes('LoreStateReview'),false);
});

test('实体删除扩展在删除后验证摘要，保留整轮原子性',()=>{
  let apply=applyState,prompt=preparePrompt;
  installEntityDeleteProtocol({getApplyState:()=>apply,setApplyState:f=>{apply=f;},getPreparePrompt:()=>prompt,setPreparePrompt:f=>{prompt=f;}});
  const previous=old(),source=review([check('/shared/地点',false),check('/entities/P01')])+wrap('<Entity id="P01" mode="delta" action="remove" reason="误建"/>');
  assert.equal(apply(previous,source,schema).entities.P01,undefined);
  assert.ok(previous.entities.P01);
});

test('核对后截断的状态块可提出整个摘要与截断尾部的替换边界',()=>{
  const tail=review(checks())+'\n<LoreState version="3" mode="delta"><Shared><地点>截断';
  assert.deepEqual(splitTruncatedUpdate('正文\n'+tail),{story:'正文\n',tail});
  assert.equal(splitTruncatedUpdate('正文'+review(checks())+'夹杂剧情<LoreState version="3">'),null);
  assert.equal(splitTruncatedUpdate('正文'+review(checks())+wrap('')),null);
});
