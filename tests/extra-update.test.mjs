import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeApiProfile,saveApiProfile,deleteApiProfile,boundApiProfile,extraModelRequest,normalizeUpdateSettings} from '../prototype/api-profiles.js';
import {validateExtraUpdate,variableStory,settleContinuedMessage} from '../prototype/extra-update.js';
import {preparePrompt,applyState,replayState} from '../prototype/core.js';
import {addReadReceipt,emptySnapshotStore,readReceipt} from '../prototype/snapshot-store.js';
import {builtinOrderedPrompts,decodeBuiltinPreset} from '../prototype/builtin-preset.js';

test('内置预设头尾包围固定任务与剧情，空白部分跳过且保留文本格式',()=>{
  const fixed={role:'system',content:'固定状态协议'},head='  简洁措辞\n',tail='\n保持栏目名称';
  const encode=text=>Buffer.from(text,'utf8').toString('base64');
  assert.deepEqual(builtinOrderedPrompts(fixed.content,encode(head),encode(tail)),[{role:'system',content:head},fixed,'user_input',{role:'system',content:tail}]);
  assert.deepEqual(builtinOrderedPrompts(fixed.content,' \n',encode(tail)),[fixed,'user_input',{role:'system',content:tail}]);
  assert.deepEqual(builtinOrderedPrompts(fixed.content,encode(head),'\t'),[{role:'system',content:head},fixed,'user_input']);
  assert.deepEqual(builtinOrderedPrompts(fixed.content),[fixed,'user_input']);
});

test('头尾 Base64 支持 UTF-8 与换行，损坏数据拒绝且错误不包含原文',()=>{
  const text='中文🙂\n第二行\r\n` ${原文}';
  const encoded=Buffer.from(text).toString('base64');
  assert.equal(decodeBuiltinPreset(encoded.match(/.{1,8}/g).join('\n')),text);
  for(const invalid of ['不是编码','YQ','YR==','/w==','SGVsbG8_']){
    assert.throws(()=>builtinOrderedPrompts('固定任务','',invalid),error=>error.message.includes('尾部编码无效')&&!error.message.includes(invalid));
  }
});

const profile={id:'a',name:'测试',url:'https://example.com/v1/chat/completions/',key:'synthetic-key',model:'test-model'};
const schema={shared:['地点'],entity:[]},token='00000000-0000-4000-8000-000000000001';
const block=(place,mode='full',read='')=>`<LoreState version="3" mode="${mode}"${read?` read="${read}"`:''}><Shared><地点>${place}</地点></Shared></LoreState>`;
test('续写合并保留前后正文，失效块不沿用旧状态，原文编辑拒绝合并',async()=>{
  const original='原剧情'+block('车站'),current=original+'新剧情'+block('书店','full',token);
  const store=await addReadReceipt(emptySnapshotStore(),token,null,schema,[]),receipt=readReceipt(current,store);
  const updated=settleContinuedMessage(original,current,'inline',null,schema,1,receipt);
  assert.equal(variableStory(updated),'原剧情新剧情');assert.equal((updated.match(/<LoreState /g)||[]).length,1);
  assert.equal(settleContinuedMessage(original,original+'新增','extra',null,schema,1,receipt),'原剧情新增');
  assert.equal(settleContinuedMessage(original,original+'新增'+block('错误','delta',token),'inline',null,schema,1,receipt),'原剧情新增');
  assert.equal(settleContinuedMessage(original,original,'inline',null,schema,1,receipt),original);
  assert.throws(()=>settleContinuedMessage(original,'改写原文','extra',null,schema,1,receipt),/原回复/);
});
test('API 预设规范化、覆盖、删除及失效绑定均不回退到其他服务',()=>{
  let config=saveApiProfile({unrelated:true},profile);
  assert.equal(config.profiles[0].url,'https://example.com/v1');
  config=saveApiProfile(config,{...profile,model:'new-model'});assert.equal(config.profiles.length,1);assert.equal(boundApiProfile(config,'a').model,'new-model');
  assert.throws(()=>saveApiProfile(config,{...profile,id:'b'}),/同名/);
  assert.equal(deleteApiProfile(config,'a').unrelated,true);
  assert.throws(()=>boundApiProfile(deleteApiProfile(config,'a'),'a'),/不存在/);
  for(const patch of [{url:'javascript:alert(1)'},{url:'https://user:pass@example.com'},{url:'https://example.com?key=secret'},{temperature:3},{maxTokens:1.5},{model:''}])assert.throws(()=>normalizeApiProfile({...profile,...patch}));
});
test('独立请求显式绑定 API 和提示，未请求原生聊天历史或正文预设',()=>{
  const request=extraModelRequest(normalizeApiProfile(profile),'规则','剧情','job');
  assert.equal(request.custom_api.key,'synthetic-key');assert.equal(request.custom_api.source,'openai');assert.equal(request.max_chat_history,0);
  assert.equal(request.should_silence,true);assert.equal(request.generation_id,'job');assert.deepEqual(request.tools,[]);
  assert.equal(request.ordered_prompts.length,2);assert.equal(request.ordered_prompts[1],'user_input');assert.equal(request.user_input,'剧情');
});
test('额外更新和重试从本轮前态计算，替换旧块并保留正文',async()=>{
  const previous=applyState(null,block('车站'),schema,1),store=await addReadReceipt(emptySnapshotStore(),token,previous,schema,[]);
  const output=block('书店','delta',token),receipt=readReceipt(output,store),original='剧情正文\n'+block('错误地点','delta');
  const updated=validateExtraUpdate(output,original,previous,schema,2,receipt);
  assert.equal(variableStory(updated),'剧情正文\n');assert.equal((updated.match(/<LoreState /g)||[]).length,1);
  const result=replayState([{message_id:1,role:'assistant',message:block('车站')},{message_id:2,role:'assistant',message:updated,readReceipt:receipt}],schema);
  assert.equal(result.state.shared.地点,'书店');assert.equal(result.errors.length,0);assert.equal(previous.shared.地点,'车站');
  const retried=validateExtraUpdate(block('公园','delta',token),updated,previous,schema,2,receipt);
  assert.equal(variableStory(retried),variableStory(updated));
  assert.equal(applyState(previous,retried,schema,2,receipt).shared.地点,'公园');
});
test('错误字段、重复块、附带叙述、错误凭据和未闭合原标签均拒绝',async()=>{
  const output=block('车站','full',token),store=await addReadReceipt(emptySnapshotStore(),token,null,schema,[]),receipt=readReceipt(output,store);
  for(const bad of [output+output,'解释'+output,output.replace(token,'00000000-0000-4000-8000-000000000002'),output.replaceAll('地点','不存在'),output.replace('full','delta')])assert.throws(()=>validateExtraUpdate(bad,'正文',null,schema,1,receipt));
  assert.throws(()=>variableStory('正文<LoreState version="3">坏标签'),/未闭合/);
  assert.match(validateExtraUpdate('```xml\n'+output+'\n```','正文',null,schema,1,receipt),/^正文/);
});
test('校验失败把具体原因带入同一读取凭据的下一次请求，成功后清除纠错提示',async()=>{
  const output=block('车站','full',token),store=await addReadReceipt(emptySnapshotStore(),token,null,schema,[]),receipt=readReceipt(output,store);
  const content=`规则\n<LoreState version="3" mode="full" read="${token}">`;
  assert.throws(()=>validateExtraUpdate('解释'+output,'正文',null,schema,1,receipt),/必须只返回一个完整 LoreState 更新块/);
  const retry=extraModelRequest(normalizeApiProfile(profile),content,'剧情','retry-job');
  const retryTask=retry.ordered_prompts.find(item=>typeof item==='object'&&/纠错重试/.test(item.content));
  assert.ok(retryTask);assert.match(retryTask.content,/必须只返回一个完整 LoreState 更新块/);assert.match(retryTask.content,/不要解释/);
  validateExtraUpdate(output,'正文',null,schema,1,receipt);
  const clean=extraModelRequest(normalizeApiProfile(profile),content,'剧情','clean-job');
  assert.equal(clean.ordered_prompts.some(item=>typeof item==='object'&&/纠错重试/.test(item.content)),false);
});
test('正文模式只提供只读状态，原随正文模式继续输出协议',()=>{
  const result=replayState([{message_id:1,role:'assistant',message:block('车站')}],schema);
  const narration=preparePrompt('记录地点',schema,result,'','', 'narration').content;
  assert.match(narration,/车站/);assert.match(narration,/仅输出剧情正文/);assert.doesNotMatch(narration,/<LoreState version=/);
  assert.match(preparePrompt('记录地点',schema,result).content,/<LoreState version="3" mode="delta"/);
});
test('旧绑定保持默认行为；请求次数、总超时和参数范围严格校验',()=>{
  const config=normalizeUpdateSettings({mode:'extra',profileId:'a'});assert.equal(config.auto,true);assert.equal(config.attempts,1);assert.equal(config.timeoutSeconds,120);assert.equal(config.presetMode,'builtin');assert.equal(config.source,'custom');
  for(const patch of [{attempts:0},{attempts:6},{attempts:1.5},{timeoutSeconds:0},{timeoutSeconds:601},{auto:'false'},{presetMode:'named',presetName:''}])assert.throws(()=>normalizeUpdateSettings(patch));
  for(const patch of [{topP:1.1},{topK:1.5},{frequencyPenalty:-3},{presencePenalty:3}])assert.throws(()=>normalizeApiProfile({...profile,...patch}));
});
test('高级采样参数与流式开关进入请求，留空与零值遵守省略语义',()=>{
  const p=normalizeApiProfile({...profile,temperature:'',topP:0.8,topK:0,maxTokens:0,frequencyPenalty:0,presencePenalty:0.3});
  const request=extraModelRequest(p,'规则','正文','id',{stream:true});
  assert.equal(request.should_stream,true);assert.equal(request.custom_api.max_tokens,'unset');assert.equal(request.custom_api.temperature,'unset');assert.equal(request.custom_api.top_k,'unset');assert.equal(request.custom_api.top_p,0.8);assert.equal(request.custom_api.frequency_penalty,0);assert.equal(request.custom_api.presence_penalty,0.3);
});
test('内置、当前及指定酒馆预设使用不同请求路径，跟随当前连接时不发送自定义 API',()=>{
  for(const presetMode of ['current','named']){
    const request=extraModelRequest(null,'状态协议','已发生的剧情','id',{source:'current',presetMode,presetName:'整理测试'});
    assert.equal(request.custom_api,undefined);assert.equal(request.ordered_prompts,undefined);assert.equal(request.preset_name,presetMode==='current'?'in_use':'整理测试');assert.match(request.user_input,/已发生的剧情/);assert.match(request.user_input,/状态协议/);assert.deepEqual(request.overrides.chat_history.prompts,[]);
  }
  const builtin=extraModelRequest(normalizeApiProfile(profile),'状态协议','已发生的剧情','id');
  assert.equal(builtin.preset_name,undefined);assert.match(builtin.ordered_prompts[0].content,/只整理已发生剧情/);assert.doesNotMatch(builtin.ordered_prompts[0].content,/SYSTEM RESET|忽略安全|UpdateVariable/);
});
