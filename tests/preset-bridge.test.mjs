import test from 'node:test';
import assert from 'node:assert/strict';
import {collectPresetMessages} from '../prototype/preset-bridge.js';
import {nativeApiRequest} from '../prototype/api-transport.js';
const request={generation_id:'synthetic-id',preset_name:'指定预设',user_input:'固定状态任务'};
function host(change=()=>{}){
  let listener,removed=0,stopped=false,sent=0;
  const options={event:'settings',on:(event,fn)=>{listener=fn;},off:(event,fn)=>{assert.equal(fn,listener);removed++;},stop:id=>{assert.equal(id,request.generation_id);stopped=true;return true;},generate:async config=>{
    assert.equal(config.preset_name,'指定预设');assert.equal(config.custom_api.key,'');assert.equal(config.should_stream,false);
    listener({model:'unrelated-model',messages:[]});assert.equal(stopped,false);
    const data={model:config.custom_api.model,messages:[{role:'system',content:'预设与角色宏'},{role:'user',content:'固定状态任务'},{role:'system',content:'后置规则'}]};change(data);
    listener(data);
    // Mirror the installed Helper: fetch receives the aborted signal.
    if(stopped)throw new Error('aborted');sent++;
  }};
  return {options,stats:()=>({removed,stopped,sent})};
}
test('指定酒馆预设组装后先中止助手发送，只把完整消息交给新协议',async()=>{
  const h=host(),result=await collectPresetMessages(request,h.options);
  assert.deepEqual(h.stats(),{removed:1,stopped:true,sent:0});
  assert.equal(result.assembled_messages[0].content,'预设与角色宏');assert.equal(result.assembled_messages[2].content,'后置规则');
  const p={name:'test',model:'synthetic',url:'https://example.com/v3',protocol:'responses'};
  assert.deepEqual(nativeApiRequest(p,result).body.input,result.assembled_messages);
});
test('非文字或过长消息拒绝，但仍先中止助手请求并清理监听',async()=>{
  for(const change of [data=>{data.messages[1].content=[{type:'image_url',image_url:'private'}];},data=>{data.messages[1].content='x'.repeat(400001);}]){
    const h=host(change);await assert.rejects(collectPresetMessages(request,h.options),/非文字/);assert.equal(h.stats().sent,0);assert.equal(h.stats().removed,1);
  }
});
test('取消在组装等待中立即结束，迟到结果不会交付且监听清除',async()=>{
  const h=host(),controller=new AbortController();h.options.signal=controller.signal;
  h.options.generate=()=>new Promise(()=>{});
  const run=collectPresetMessages(request,h.options);controller.abort();await assert.rejects(run,/取消/);assert.equal(h.stats().removed,1);
});
test('缺失能力、未触发事件或未确认停止均不会交付预设消息',async()=>{
  const h=host();await assert.rejects(collectPresetMessages(request,{...h.options,event:undefined}),/缺少/);
  await assert.rejects(collectPresetMessages(request,{...h.options,generate:async()=>''}),/未取得/);
  const failed=host();failed.options.stop=()=>false;await assert.rejects(collectPresetMessages(request,failed.options),/未确认/);
});
