import { builtinOrderedPrompts } from './builtin-preset.js';
// Local user configuration only. Never copy this namespace to script/card data.
export const API_PROFILE_KEY='lorestate_api_profiles_v1';
export function normalizeApiAddress(value){
  let url;try{url=new URL(String(value??'').trim());}catch{throw new Error('请填写完整的 API 地址');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('API 地址只接受 HTTP/HTTPS，凭据请填写在密钥栏');
  url.pathname=url.pathname.replace(/\/(?:chat\/completions|models)\/?$/,'').replace(/\/$/,'');
  return url.href.replace(/\/$/,'');
}
export function normalizeUpdateSettings(value={}){
  const config={...value,mode:value.mode??'inline',profileId:value.profileId??'',source:value.source??'custom',presetMode:value.presetMode??'builtin',presetName:value.presetName??'',auto:value.auto??true,stream:value.stream??false,attempts:Number(value.attempts??1),timeoutSeconds:Number(value.timeoutSeconds??120)};
  if(!['inline','extra'].includes(config.mode)||!['custom','current'].includes(config.source)||!['builtin','current','named'].includes(config.presetMode))throw new Error('状态更新方式、模型来源或请求预设无效');
  if(typeof config.auto!=='boolean'||typeof config.stream!=='boolean')throw new Error('自动更新和流式设置必须为开关');
  if(!Number.isInteger(config.attempts)||config.attempts<1||config.attempts>5)throw new Error('请求总次数需为 1～5 的整数');
  if(!Number.isInteger(config.timeoutSeconds)||config.timeoutSeconds<15||config.timeoutSeconds>600)throw new Error('总超时需为 15～600 秒的整数');
  if(config.presetMode==='named'&&!config.presetName.trim())throw new Error('请选择酒馆请求预设');
  return config;
}
export function normalizeApiProfile(profile){
  const name=String(profile.name??'').trim(),model=String(profile.model??'').trim();
  if(!name||name.length>40)throw new Error('API 预设名称需为 1～40 个字符');
  if(!model||model.length>200)throw new Error('请填写模型名称（最多 200 字符）');
  const url=normalizeApiAddress(profile.url),maxTokens=Number(profile.maxTokens??4096);
  if(!Number.isInteger(maxTokens)||maxTokens<0||maxTokens>65536)throw new Error('最大回复长度需为 0～65536 的整数，0 表示不发送此参数');
  const sampling={};
  for(const [key,label,min,max,fallback] of [['temperature','温度',0,2,0.2],['topP','Top P',0,1,'unset'],['topK','Top K',0,1000,'unset'],['frequencyPenalty','频率惩罚',-2,2,'unset'],['presencePenalty','存在惩罚',-2,2,'unset']]){
    const raw=profile[key]??fallback;
    if(raw===''||raw==='unset'){sampling[key]='unset';continue;}
    const number=Number(raw);if(!Number.isFinite(number)||number<min||number>max||(key==='topK'&&!Number.isInteger(number)))throw new Error(`${label} 参数范围为 ${min}～${max}${key==='topK'?' 的整数':''}`);
    sampling[key]=key==='topK'&&number===0?'unset':number;
  }
  return {id:profile.id,name,url,key:String(profile.key??'').trim(),model,maxTokens,...sampling};
}
export function saveApiProfile(config,profile){
  const next=normalizeApiProfile(profile),profiles=config.profiles??[];
  if(typeof next.id!=='string'||!next.id)throw new Error('API 预设编号缺失');
  if(profiles.some(p=>p.id!==next.id&&p.name===next.name))throw new Error('已有同名 API 预设');
  if(!profiles.some(p=>p.id===next.id)&&profiles.length>=20)throw new Error('最多保存 20 个 API 预设');
  return {...config,profiles:profiles.some(p=>p.id===next.id)?profiles.map(p=>p.id===next.id?next:p):[...profiles,next]};
}
export function deleteApiProfile(config,id){
  return {...config,profiles:(config.profiles??[]).filter(p=>p.id!==id)};
}
export function boundApiProfile(config,id){
  const profile=(config.profiles??[]).find(p=>p.id===id);
  if(!profile)throw new Error('状态更新绑定的 API 预设不存在，请重新绑定');
  return normalizeApiProfile(profile);
}
export function extraModelRequest(profile,content,story,generationId,options={}){
  const settings=normalizeUpdateSettings(options),task=content+'\n本次只整理已发生剧情的文字状态，不续写剧情。只返回唯一 LoreState 更新块，不附解释、思考或代码围栏。下一条消息是已发生的剧情资料。';
  const request={generation_id:generationId,should_stream:settings.stream,should_silence:true,max_chat_history:0,tools:[]};
  if(settings.source==='custom'){
    const p=normalizeApiProfile(profile);
    request.custom_api={apiurl:p.url,key:p.key,model:p.model,source:'openai',max_tokens:p.maxTokens||'unset',temperature:p.temperature,top_p:p.topP,top_k:p.topK,frequency_penalty:p.frequencyPenalty,presence_penalty:p.presencePenalty};
  }
  if(settings.presetMode==='builtin')Object.assign(request,{user_input:story,ordered_prompts:builtinOrderedPrompts(task)});
  // A preset may omit chat_history, in which case Helper skips in-chat injections.
  // Keep the complete task in user_input so the required protocol cannot disappear.
  else Object.assign(request,{preset_name:settings.presetMode==='current'?'in_use':settings.presetName,user_input:task+'\n\n已发生的剧情资料：\n'+story,overrides:{chat_history:{prompts:[],with_depth_entries:false,author_note:''}},injects:[{role:'system',content:'本次请求只整理文字状态，请按本次输入中的 LoreState 协议返回更新块，不续写剧情。',position:'in_chat',depth:0,should_scan:false}]});
  return request;
}
