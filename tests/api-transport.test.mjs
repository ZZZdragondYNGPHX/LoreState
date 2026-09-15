import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeApiProfile,normalizeUpdateSettings,extraModelRequest} from '../prototype/api-profiles.js';
import {apiEndpoint,apiHeaders,nativeApiRequest,readApiResponse,callNativeApi,fetchNativeModels} from '../prototype/api-transport.js';
const base={id:'test',name:'测试',url:'https://example.com/v3',key:'synthetic-key',model:'synthetic-model',protocol:'chat'};
const request={should_stream:false,user_input:'剧情',ordered_prompts:[{role:'system',content:'固定任务'},'user_input',{role:'system',content:'尾部'}]};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const sse=events=>new Response(events.map(data=>'data: '+(typeof data==='string'?data:JSON.stringify(data))+'\r\n\r\n').join(''),{headers:{'content-type':'text/event-stream'}});
test('新默认为 3 次、无限等待、8000 tokens、auto；既有显式配置保留',()=>{
  const p=normalizeApiProfile(base),s=normalizeUpdateSettings();
  assert.equal(p.maxTokens,8000);assert.equal(p.reasoning,'auto');assert.equal(s.attempts,3);assert.equal(s.timeoutSeconds,0);
  assert.equal(normalizeApiProfile({...base,maxTokens:4096}).maxTokens,4096);
  assert.equal(normalizeUpdateSettings({attempts:1,timeoutSeconds:120}).timeoutSeconds,120);
});
test('协议路径保留 v3、代理前缀与完整自定义端点，不重复附加后缀',()=>{
  for(const [protocol,suffix] of [['chat','chat/completions'],['responses','responses'],['anthropic','messages']]){
    assert.equal(apiEndpoint({...base,protocol}),'https://example.com/v3/'+suffix);
    assert.equal(apiEndpoint({...base,protocol,url:'https://example.com'}),'https://example.com/v1/'+suffix);
    assert.equal(apiEndpoint({...base,protocol,url:'https://example.com/gateway/v3/'+suffix+'/'}),'https://example.com/gateway/v3/'+suffix);
    assert.equal(apiEndpoint({...base,protocol,url:'https://example.com/custom/run/',exact:true}),'https://example.com/custom/run/');
  }
  assert.equal(apiEndpoint({...base,exact:true,url:'https://example.com/proxy/v3/responses'},true),'https://example.com/proxy/v3/models');
  assert.throws(()=>apiEndpoint({...base,exact:true,url:'https://example.com/custom'},true),/另填/);
  assert.throws(()=>apiEndpoint({...base,modelsUrl:'https://elsewhere.invalid/models'},true),/同源/);
});
test('鉴权按协议构造，自定义请求头覆盖不重复发送且非法值拒绝',()=>{
  assert.equal(apiHeaders(base).authorization,'Bearer synthetic-key');
  const h=apiHeaders({...base,protocol:'anthropic',headers:{'X-Api-Key':'replacement'}});
  assert.equal(h['x-api-key'],'replacement');assert.equal(h['anthropic-version'],'2023-06-01');assert.equal(h.authorization,undefined);
  for(const headers of ['{broken','[]','{"Host":"evil"}',{'x-key':'bad\r\nvalue'},{'x-key':3}])assert.throws(()=>normalizeApiProfile({...base,headers}));
});
test('三种协议的任务、剧情、长度与参数独立映射',()=>{
  const chat=nativeApiRequest(base,request).body;
  assert.equal(chat.messages[1].content,'剧情');assert.equal(chat.max_tokens,8000);
  const responses=nativeApiRequest({...base,protocol:'responses',topK:10,frequencyPenalty:1},request).body;
  assert.equal(responses.max_output_tokens,8000);assert.equal(responses.store,false);assert.equal(responses.input[2].content,'尾部');assert.equal(responses.top_k,undefined);assert.equal(responses.frequency_penalty,undefined);
  const anthropic=nativeApiRequest({...base,protocol:'anthropic',topP:0.9},request).body;
  assert.equal(anthropic.system,'固定任务');assert.deepEqual(anthropic.messages,[{role:'user',content:'剧情'},{role:'user',content:'尾部'}]);assert.equal(anthropic.top_p,undefined);
  assert.throws(()=>nativeApiRequest({...base,protocol:'anthropic',maxTokens:0},request));
  assert.throws(()=>nativeApiRequest(base,{user_input:'酒馆预设'}),/内置预设/);
});
test('auto 省略参数；max/ultra 不降级；推理长度参数可选',()=>{
  for(const protocol of ['chat','responses','anthropic']){
    const auto=nativeApiRequest({...base,protocol},request).body;
    assert.equal(auto.reasoning_effort,undefined);assert.equal(auto.reasoning,undefined);assert.equal(auto.thinking,undefined);
    for(const effort of ['low','high','xhigh','max','ultra']){
      const body=nativeApiRequest({...base,protocol,reasoning:effort},request).body;
      assert.equal(protocol==='chat'?body.reasoning_effort:protocol==='responses'?body.reasoning.effort:body.output_config.effort,effort);
      if(protocol==='anthropic'){assert.equal(body.thinking.type,'adaptive');assert.equal(body.temperature,undefined);}
    }
  }
  const body=nativeApiRequest({...base,tokenField:'max_completion_tokens'},request).body;
  assert.equal(body.max_completion_tokens,8000);assert.equal(body.max_tokens,undefined);
  assert.throws(()=>normalizeApiProfile({...base,protocol:'helper',reasoning:'ultra'}),/直连/);
});
test('非流式三协议只提取可见文字，错误和截断响应拒绝',async()=>{
  assert.equal(await readApiResponse(json({choices:[{message:{content:'结果'}}]}),'chat'),'结果');
  assert.equal(await readApiResponse(json({content:[{type:'thinking',thinking:'内部'},{type:'text',text:'结果'}]}),'anthropic'),'结果');
  assert.equal(await readApiResponse(json({status:'completed',output:[{type:'reasoning'},{type:'message',role:'assistant',content:[{type:'output_text',text:'结果'}]}]}),'responses'),'结果');
  await assert.rejects(readApiResponse(json({status:'incomplete',output:[]}),'responses'));
  await assert.rejects(readApiResponse(json({choices:[{finish_reason:'length',message:{content:'半截'}}]}),'chat'));
  await assert.rejects(readApiResponse(json({error:{message:'private secret'}}),'anthropic'),error=>!error.message.includes('secret'));
});
test('SSE 支持三协议、忽略思考、拒绝中断及流内错误',async()=>{
  assert.equal(await readApiResponse(sse([{choices:[{delta:{reasoning_content:'忽略',content:'答'}}]},'[DONE]']),'chat'),'答');
  assert.equal(await readApiResponse(sse([{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'忽略'}},{type:'content_block_delta',delta:{type:'text_delta',text:'答'}},{type:'message_stop'}]),'anthropic'),'答');
  assert.equal(await readApiResponse(sse([{type:'response.output_text.delta',delta:'答'},{type:'response.completed',response:{status:'completed',output:[]}}]),'responses'),'答');
  await assert.rejects(readApiResponse(sse([{choices:[{delta:{content:'半截'}}]}]),'chat'),/中断/);
  await assert.rejects(readApiResponse(sse([{type:'error',error:{message:'secret'}}]),'anthropic'),error=>!error.message.includes('secret'));
});
test('SSE 逐字节 UTF-8、CRLF 分片与不关闭连接的终止事件可完成',async()=>{
  const bytes=new TextEncoder().encode('data: {"choices":[{"delta":{"content":"中文🙂"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  let index=0,cancelled=false;
  const stream=new ReadableStream({pull(controller){if(index<bytes.length)controller.enqueue(bytes.slice(index,index+=1));},cancel(){cancelled=true;}});
  const response=new Response(stream,{headers:{'content-type':'text/event-stream'}});
  assert.equal(await readApiResponse(response,'chat'),'中文🙂');assert.equal(cancelled,true);
});
test('直连传入取消信号、禁止重定向携带凭据，模型列表支持 data 和 models',async()=>{
  const controller=new AbortController();let options;
  const reply=await callNativeApi(base,extraModelRequest(base,'规则','剧情','id'),controller.signal,async(url,value)=>{assert.equal(url,'https://example.com/v3/chat/completions');options=value;return json({choices:[{message:{content:'答案'}}]});});
  assert.equal(reply,'答案');assert.equal(options.signal,controller.signal);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  assert.deepEqual(await fetchNativeModels(base,controller.signal,async()=>json({data:[{id:'a'},{id:'b'}]})),['a','b']);
  assert.deepEqual(await fetchNativeModels(base,controller.signal,async()=>json({models:[{name:'c'}]})),['c']);
  controller.abort();await assert.rejects(callNativeApi(base,request,controller.signal,async()=>{throw new Error('private');}),/取消/);
});
