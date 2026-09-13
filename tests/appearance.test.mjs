import test from 'node:test';
import assert from 'node:assert/strict';
import { appearancePrompt, appearanceRequest, extractAppearanceHtml, createAppearanceJob } from '../prototype/appearance-authoring.js';
const schema={shared:['地点'],entity:['状态'],modules:{人物:['状态']}};
const html='<html data-lore-template="2"><head></head><body><p data-lore-shared="地点"></p></body></html>';
const input={schema,style:'深色纸张，手机单列',html,mode:'revise'};
const profile={id:'p',name:'测试',url:'https://example.invalid/v1',key:'SYNTHETIC_SECRET',model:'model',maxTokens:9000,temperature:0.8};
const binding={source:'custom',profileId:'p',presetMode:'named',presetName:'UNUSED_PRESET',stream:true,attempts:2,timeoutSeconds:15};
function harness(extra={}){
  const stops=[],reports=[];
  const job=createAppearanceJob({generate:async()=>html,stop:id=>stops.push(id),validate:()=>{},assertCurrent:()=>{},report:text=>reports.push(text),...extra});
  return {job,stops,reports};
}
test('外观请求仅发送结构、风格和显式草稿，不复用剧情预设',()=>{
  const request=appearanceRequest({...input,schema:{...schema,initial:'PRIVATE_STATE',constraints:'PRIVATE_RULES'}},profile,binding,'job');
  const prompt=JSON.stringify(request.ordered_prompts);
  for(const secret of ['SYNTHETIC_SECRET','UNUSED_PRESET','PRIVATE_STATE','PRIVATE_RULES'])assert(!prompt.includes(secret));
  assert(prompt.includes('深色纸张'));assert(prompt.includes('data-lore-if-field'));assert(prompt.includes('data-lore-class-map'));
  assert.equal(request.custom_api.model,'model');assert.equal(request.custom_api.key,profile.key);assert.equal(request.custom_api.max_tokens,9000);
  assert.equal(request.max_chat_history,0);assert.equal(request.should_silence,true);assert.equal(request.should_stream,true);assert.deepEqual(request.tools,[]);
  assert.deepEqual(request.ordered_prompts.map(p=>p.role),['system','user']);assert(!Object.hasOwn(request,'preset_name'));assert(!Object.hasOwn(request,'injects'));
  const current=appearanceRequest({...input,mode:'new',html:'DRAFT_NOT_SENT'},null,{source:'current'},'current');
  assert(!Object.hasOwn(current,'custom_api'));assert(!JSON.stringify(current).includes('DRAFT_NOT_SENT'));
});
test('风格与 HTML 输入预算明确，不接受缺失要求或未知模式',()=>{
  for(const value of ['', ' '.repeat(2),'x'.repeat(4001)])assert.throws(()=>appearancePrompt({...input,style:value}),/风格/);
  assert.throws(()=>appearancePrompt({...input,mode:'script'}),/方式/);
  assert.throws(()=>appearancePrompt({...input,html:''}),/没有 HTML/);
  assert.throws(()=>appearancePrompt({...input,html:'x'.repeat(100001)}),/100000/);
});
test('提取完整 HTML，拒绝说明、截断、工具对象及超预算；仅解包完整围栏',()=>{
  assert.equal(extractAppearanceHtml(html),html);
  const fence=String.fromCharCode(96).repeat(3);
  assert.equal(extractAppearanceHtml(fence+'html\n'+html+'\n'+fence),html);
  for(const value of ['说明\n'+html,'<div>片段</div>',html.slice(0,-7),{},'x'.repeat(100101)])assert.throws(()=>extractAppearanceHtml(value));
});
test('校验失败只有限重试，纠错信息被传递且成功仅返回草稿',async()=>{
  const requests=[];
  const {job}=harness({generate:async r=>{requests.push(r);return requests.length===1?'<p>不完整</p>':html;}});
  assert.equal(await job.run(input,profile,binding),html);assert.equal(requests.length,2);
  assert(JSON.stringify(requests[1].ordered_prompts).includes('完整 HTML'));assert(!job.busy);
  assert.notEqual(requests[0].generation_id,requests[1].generation_id);
});
test('网络错误不暴露服务错误原文或密钥，也不沿用上次格式纠错',async()=>{
  const requests=[];
  const {job}=harness({generate:async r=>{requests.push(r);if(requests.length===1)return '<p>错</p>';if(requests.length===2)throw Error('SYNTHETIC_SECRET');return html;}});
  assert.equal(await job.run(input,profile,{...binding,attempts:3}),html);
  assert(!JSON.stringify(requests[2].ordered_prompts).includes('上次 HTML 未通过'));
  const {job:bad}=harness({generate:async()=>{throw Error('SYNTHETIC_SECRET');}});
  await assert.rejects(bad.run(input,profile,{...binding,attempts:1}),error=>!error.message.includes('SYNTHETIC_SECRET')&&error.message.includes('请求失败'));
});
test('取消立即结束，迟到结果不返回，重复取消和新请求互不干扰',async()=>{
  let reply;
  const {job,stops}=harness({generate:()=>new Promise(resolve=>{reply=resolve;})});
  const running=job.run(input,profile,binding);
  await assert.rejects(job.run(input,profile,binding),/正在生成/);
  const rejected=assert.rejects(running,/取消/);job.cancel();job.cancel();await rejected;
  assert.equal(stops.length,1);assert(!job.busy);reply(html);await new Promise(resolve=>setTimeout(resolve,0));
});
test('总超时取消，清理计时器且无后续重试',async()=>{
  let expire,reply,cleared=0,calls=0;
  const {job,stops}=harness({generate:()=>{calls++;return new Promise(resolve=>{reply=resolve;});},setTimer:fn=>{expire=fn;return 1;},clearTimer:()=>cleared++});
  const running=job.run(input,profile,binding),rejected=assert.rejects(running,/超时/);expire();await rejected;reply(html);
  assert.equal(calls,1);assert.equal(cleared,1);assert.equal(stops.length,1);
});
test('上下文变化和校验拒绝均不会交付候选 HTML',async()=>{
  let current=true,calls=0;
  const {job}=harness({generate:async()=>{calls++;current=false;return html;},assertCurrent:()=>{if(!current)throw Error('上下文变化');}});
  await assert.rejects(job.run(input,profile,binding),/上下文变化/);assert.equal(calls,1);
  const {job:invalid}=harness({validate:()=>{throw Error('禁止脚本');}});
  await assert.rejects(invalid.run(input,profile,{...binding,attempts:1}),/禁止脚本/);
});
