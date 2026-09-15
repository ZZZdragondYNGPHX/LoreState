import { normalizeApiProfile } from './api-profiles.js';

// Browser-side native protocols. The Helper transport remains the legacy default.
export function apiEndpoint(profile,models=false){
  const p=normalizeApiProfile(profile);
  if(models&&p.modelsUrl){
    if(new URL(p.modelsUrl).origin!==new URL(p.url).origin)throw new Error('模型列表地址必须与 API 地址同源');
    return p.modelsUrl;
  }
  if(!models&&p.exact)return p.url;
  let base=p.url;
  if(p.exact){
    if(!/\/(chat\/completions|responses|messages)\/?$/.test(base))throw new Error('自定义端点请另填模型列表地址，或手动填写模型');
    base=base.replace(/\/(chat\/completions|responses|messages)\/?$/,'');
  }
  if(new URL(base).pathname==='/')base+='/v1';
  return base+'/'+(models?'models':p.protocol==='responses'?'responses':p.protocol==='anthropic'?'messages':'chat/completions');
}
export function apiHeaders(profile){
  const p=normalizeApiProfile(profile),headers={'content-type':'application/json'};
  if(p.protocol==='anthropic')Object.assign(headers,{'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true',...(p.key?{'x-api-key':p.key}:{})});
  else if(p.key)headers.authorization=`Bearer ${p.key}`;
  return {...headers,...p.headers};
}
export function nativeApiRequest(profile,request){
  const p=normalizeApiProfile(profile);
  if(p.protocol==='helper')throw new Error('该预设使用酒馆助手连接');
  if(!Array.isArray(request.assembled_messages)&&!Array.isArray(request.ordered_prompts))throw new Error('尚未组装酒馆提示词预设');
  const messages=request.assembled_messages??request.ordered_prompts.map(item=>item==='user_input'?{role:'user',content:request.user_input}:item);
  const body={model:p.model,stream:request.should_stream===true};
  if(p.protocol==='responses'){
    body.input=messages;body.store=false;
    if(p.maxTokens)body.max_output_tokens=p.maxTokens;
  }else if(p.protocol==='anthropic'){
    // Anthropic has a top-level system field. Preserve trailing instructions after
    // the story as user text rather than silently moving them before the story.
    const firstUser=messages.findIndex(m=>m.role==='user');
    body.system=messages.slice(0,firstUser).map(m=>m.content).join('\n\n');
    body.messages=messages.slice(firstUser).map(m=>({role:['system','developer'].includes(m.role)?'user':m.role,content:m.content}));
    body.max_tokens=p.maxTokens;
  }else{
    body.messages=messages;if(p.maxTokens)body[p.tokenField]=p.maxTokens;
  }
  if(p.reasoning!=='auto'){
    if(p.protocol==='responses')body.reasoning={effort:p.reasoning};
    else if(p.protocol==='anthropic'){
      body.thinking={type:p.reasoning==='none'?'disabled':'adaptive'};
      if(p.reasoning!=='none')body.output_config={effort:p.reasoning};
    }else body.reasoning_effort=p.reasoning;
  }
  for(const [key,wire] of [['temperature','temperature'],['topP','top_p'],['topK','top_k'],['frequencyPenalty','frequency_penalty'],['presencePenalty','presence_penalty']]){
    if(p[key]==='unset')continue;
    if(p.protocol==='responses'&&!['temperature','topP'].includes(key))continue;
    if(p.protocol==='anthropic'&&['frequencyPenalty','presencePenalty'].includes(key))continue;
    if(p.protocol==='anthropic'&&key==='topP'&&p.temperature!=='unset')continue;
    if(p.protocol==='anthropic'&&!['auto','none'].includes(p.reasoning)&&['temperature','topP','topK'].includes(key))continue;
    body[wire]=p[key];
  }
  return {url:apiEndpoint(p),headers:apiHeaders(p),body};
}
function apiOutput(data,protocol){
  if(data?.error||['failed','incomplete','cancelled'].includes(data?.status))throw new Error('API 未完成有效响应');
  if(protocol==='responses')return (data.output??[]).filter(item=>item.type==='message'&&item.role==='assistant').flatMap(item=>item.content??[]).filter(c=>c.type==='output_text').map(c=>c.text??'').join('');
  if(protocol==='anthropic'){
    if(data.stop_reason==='max_tokens')throw new Error('API 输出达到长度上限');
    return (data.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join('');
  }
  const choice=data.choices?.[0];
  if(['length','content_filter'].includes(choice?.finish_reason))throw new Error('API 输出未完整完成');
  const content=choice?.message?.content;
  return typeof content==='string'?content:Array.isArray(content)?content.filter(c=>c.type==='text').map(c=>c.text??'').join(''):'';
}
export async function readApiResponse(response,protocol){
  if(!response.ok)throw new Error(`API 请求失败（HTTP ${response.status}），请检查地址、鉴权和协议`);
  if(!response.headers.get('content-type')?.includes('text/event-stream')){
    const text=apiOutput(await response.json(),protocol);
    if(!text.trim())throw new Error('API 没有返回可用文字');
    if(text.length>200000)throw new Error('API 响应过长');
    return text;
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',text='',done=false,total=0;
  const consume=block=>{
    const payload=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!payload)return;
    if(payload==='[DONE]'){if(protocol==='chat')done=true;return;}
    const data=JSON.parse(payload);
    if(data.error||['error','response.failed','response.incomplete'].includes(data.type))throw new Error('API 流式响应失败');
    if(protocol==='responses'){
      if(data.type==='response.output_text.delta')text+=data.delta??'';
      if(data.type==='response.completed'){const final=apiOutput(data.response,protocol);if(final)text=final;done=true;}
    }else if(protocol==='anthropic'){
      if(data.type==='content_block_start'&&data.content_block?.type==='text')text+=data.content_block.text??'';
      if(data.type==='content_block_delta'&&data.delta?.type==='text_delta')text+=data.delta.text??'';
      if(data.type==='message_delta'&&data.delta?.stop_reason==='max_tokens')throw new Error('API 输出达到长度上限');
      if(data.type==='message_stop')done=true;
    }else{
      const choice=data.choices?.[0];
      if(['length','content_filter'].includes(choice?.finish_reason))throw new Error('API 输出未完整完成');
      if(typeof choice?.delta?.content==='string')text+=choice.delta.content;
      if(choice?.finish_reason==='stop')done=true;
    }
    if(text.length>200000)throw new Error('API 响应过长');
  };
  try{
    while(true){
      const chunk=await reader.read();total+=chunk.value?.length??0;
      if(total>4000000)throw new Error('API 响应过长');
      buffer+=decoder.decode(chunk.value??new Uint8Array(),{stream:!chunk.done});
      // Keep a trailing CR until the next chunk, including split CRLF boundaries.
      buffer=buffer.replace(/\r\n/g,'\n').replace(/\r(?!$)/g,'\n');
      let end;while((end=buffer.indexOf('\n\n'))!==-1){consume(buffer.slice(0,end));buffer=buffer.slice(end+2);}
      if(done)break;
      if(chunk.done){if(buffer.trim())consume(buffer.replace(/\r$/,''));break;}
    }
    if(!done||!text.trim())throw new Error('API 流式响应中断或没有返回文字');
    return text;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function callNativeApi(profile,request,signal,fetcher=fetch){
  const p=normalizeApiProfile(profile),native=nativeApiRequest(p,request);
  try{
    const response=await fetcher(native.url,{method:'POST',headers:native.headers,body:JSON.stringify(native.body),signal,credentials:'omit',redirect:'error'});
    return await readApiResponse(response,p.protocol);
  }catch(error){
    // Never surface response bodies, request headers or third-party error text.
    if(signal?.aborted)throw new Error('状态 API 请求已取消');
    if(error.message?.startsWith('API '))throw error;
    throw new Error('API 请求失败，请检查协议、网络与服务的浏览器跨域支持');
  }
}
export async function fetchNativeModels(profile,signal,fetcher=fetch){
  const p=normalizeApiProfile(profile);
  const response=await fetcher(apiEndpoint(p,true),{headers:apiHeaders(p),signal,credentials:'omit',redirect:'error'});
  if(!response.ok)throw new Error('模型列表请求失败');
  const data=await response.json(),items=Array.isArray(data)?data:data.data??data.models??[];
  return items.map(item=>typeof item==='string'?item:item.id??item.name).filter(item=>typeof item==='string');
}
