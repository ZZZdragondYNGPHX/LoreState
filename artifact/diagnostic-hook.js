(()=>{
'use strict';
const FLAG=Symbol.for('lorestate.extraDiagnosticWrapped');
const UI_ID='lorestate-extra-update-diagnostic';
const MAX_ATTEMPTS=10,MAX_OUTPUT=32000;
const parentDoc=()=>{try{return window.parent.document;}catch{return document;}};
const chatId=()=>{try{return window.parent.SillyTavern?.getContext?.().getCurrentChatId?.()??'unknown';}catch{return 'unknown';}};
const storageKey=()=>`lorestate-extra-diagnostic-v1:${chatId()}`;
function empty(){return {version:1,updatedAt:'',lastStatus:'',attempts:[]};}
function read(){
  try{const value=JSON.parse(sessionStorage.getItem(storageKey())||'null');return value&&Array.isArray(value.attempts)?value:empty();}
  catch{return empty();}
}
function write(value){
  value.updatedAt=new Date().toISOString();value.attempts=value.attempts.slice(-MAX_ATTEMPTS);
  try{sessionStorage.setItem(storageKey(),JSON.stringify(value));}catch{}
  render();
}
function clip(value){
  const text=typeof value==='string'?value:value==null?'':String(value);
  if(text.length<=MAX_OUTPUT)return {text,truncated:false};
  const half=Math.floor((MAX_OUTPUT-32)/2);
  return {text:text.slice(0,half)+'\n…[中间内容因诊断长度限制省略]…\n'+text.slice(-half),truncated:true};
}
function requestTexts(request){
  const list=[];
  if(typeof request?.user_input==='string')list.push(request.user_input);
  if(Array.isArray(request?.ordered_prompts))for(const item of request.ordered_prompts)if(item&&typeof item==='object'&&typeof item.content==='string')list.push(item.content);
  return list;
}
function isLoreStateRequest(request){
  return requestTexts(request).some(text=>text.includes('LoreState 统一文字状态 v3')||text.includes('只返回唯一 LoreState 更新块')||text.includes('本次只整理已发生剧情的文字状态'));
}
function retryReason(request){
  const text=requestTexts(request).join('\n');
  return text.match(/上一次状态输出未通过本地校验：([^\n]+)/)?.[1]?.trim()??'';
}
function expectedOpening(request){
  const text=requestTexts(request).join('\n');
  const found=[...text.matchAll(/<LoreState version="3" mode="(full|delta)" read="([a-f\d-]{36})">/g)].at(-1);
  return found?`<LoreState version="3" mode="${found[1]}" read="${found[2]}">`:'';
}
function basicCheck(output,opening){
  if(typeof output!=='string')return '状态模型没有返回文字。';
  const text=output.trim().replace(/^```(?:xml)?\s*\n([\s\S]*?)\n```$/,'$1').trim();
  const blocks=[...text.matchAll(/<LoreState\b[^>]*>[\s\S]*?<\/LoreState>/g)];
  if(blocks.length!==1||blocks[0][0]!==text)return '基础检查失败：模型没有只返回一个完整 LoreState 更新块。';
  if(opening&&!text.startsWith(opening))return '基础检查失败：外层 mode 或 read 读取凭据与本次请求不一致。';
  return '';
}
function beginAttempt(method,request){
  const state=read(),reason=retryReason(request),previous=state.attempts.at(-1);
  if(reason&&previous&&!previous.localError){previous.localError=reason;previous.status='validation-failed';}
  const entry={id:crypto.randomUUID?.()??String(Date.now()+Math.random()),time:new Date().toISOString(),method,status:'requesting',localError:'',requestError:'',basicError:'',output:'',truncated:false,opening:expectedOpening(request)};
  state.attempts.push(entry);state.lastStatus='正在请求状态模型';write(state);return entry.id;
}
function updateAttempt(id,patch){
  const state=read(),entry=state.attempts.find(item=>item.id===id);if(!entry)return;
  Object.assign(entry,patch);write(state);
}
function wrap(name){
  const original=globalThis[name];if(typeof original!=='function'||original[FLAG])return;
  const wrapped=async function(...args){
    const request=args[0];if(!isLoreStateRequest(request))return original.apply(this,args);
    const id=beginAttempt(name,request);
    try{
      const output=await original.apply(this,args),saved=clip(output),error=basicCheck(output,expectedOpening(request));
      updateAttempt(id,{status:error?'basic-failed':'returned-awaiting-validation',basicError:error,output:saved.text,truncated:saved.truncated});
      return output;
    }catch(error){
      updateAttempt(id,{status:'request-error',requestError:String(error?.message??error).slice(0,2000)});throw error;
    }
  };
  try{Object.defineProperty(wrapped,FLAG,{value:true});Object.defineProperty(wrapped,'name',{value:original.name||name,configurable:true});globalThis[name]=wrapped;}catch{}
}
function install(){wrap('generateRaw');wrap('generate');}
function format(state){
  if(!state.attempts.length)return '尚未捕获额外模型的 LoreState 请求。\n\n复现一次“额外模型更新”后，这里会显示每次隐藏请求的原始模型输出和校验线索。';
  const lines=[];
  lines.push(`最近状态：${state.lastStatus||'未知'}`);
  if(state.updatedAt)lines.push(`更新时间：${state.updatedAt}`);
  for(const [index,item] of state.attempts.entries()){
    lines.push('',`========== 第 ${index+1} 次隐藏状态模型输出 ==========`,`时间：${item.time}`,`接口：${item.method}`,`结果：${item.status}`);
    if(item.localError)lines.push(`LoreState 本地校验错误：${item.localError}`);
    if(item.basicError)lines.push(`诊断基础检查：${item.basicError}`);
    if(item.requestError)lines.push(`请求错误：${item.requestError}`);
    lines.push('模型原始输出：',item.output||'（没有捕获到文字输出）');
    if(item.truncated)lines.push('【输出过长：仅保留开头和结尾用于诊断】');
  }
  return lines.join('\n');
}
function syncRuntimeStatus(){
  const doc=parentDoc(),text=doc.querySelector('.ls-health')?.textContent?.trim()??'';if(!text)return;
  const state=read();if(text===state.lastStatus)return;
  const last=state.attempts.at(-1);
  if(last){
    if(/状态已更新/.test(text)){last.status='validated-success';last.localError='';}
    else if(/未通过协议、栏目或读取凭据校验|状态模型输出未通过/.test(text)&&last.status!=='request-error'){last.status='validation-failed-final';if(!last.localError)last.localError=text;}
    else if(/状态 API 请求失败/.test(text)){last.status='request-error';if(!last.requestError)last.requestError=text;}
  }
  state.lastStatus=text;write(state);
}
function mount(){
  const doc=parentDoc(),old=doc.querySelector('textarea[aria-label="最近一次 LoreState 更新块"]');if(!old)return;
  const group=old.closest('details');if(!group)return;
  const summary=group.querySelector(':scope > summary');if(summary)summary.textContent='最近一次 LoreState 更新诊断';
  let ui=group.querySelector(`#${UI_ID}`);
  if(!ui){
    for(const child of [...group.children])if(child!==summary)child.hidden=true;
    ui=doc.createElement('div');ui.id=UI_ID;ui.hidden=false;
    const meta=doc.createElement('p');meta.dataset.role='meta';ui.append(meta);
    const box=doc.createElement('textarea');box.readOnly=true;box.spellcheck=false;box.setAttribute('aria-label','最近一次 LoreState 更新诊断');box.style.cssText='width:100%;min-height:320px;box-sizing:border-box;white-space:pre;overflow:auto';ui.append(box);
    const note=doc.createElement('p');note.textContent='这里记录额外模型更新时每一次隐藏 AI 请求的原始返回。重试开始时还会补记上一轮 LoreState 本地校验原因；最终失败至少保留原始输出，便于判断是模型格式错误还是插件校验问题。诊断只保存在当前标签页会话中，不记录请求提示或 API 密钥。';ui.append(note);
    const refresh=doc.createElement('button');refresh.type='button';refresh.textContent='刷新诊断';refresh.onclick=()=>render();ui.append(refresh);
    const copy=doc.createElement('button');copy.type='button';copy.textContent='复制诊断';copy.onclick=async()=>{const value=box.value;if(!value)return;try{await navigator.clipboard.writeText(value);meta.textContent='诊断已复制。';}catch{box.focus();box.select();meta.textContent='浏览器不允许自动复制，请手动复制。';}};ui.append(copy);
    const clear=doc.createElement('button');clear.type='button';clear.textContent='清除诊断';clear.onclick=()=>{try{sessionStorage.removeItem(storageKey());}catch{}render();};ui.append(clear);
    group.append(ui);
  }
  ui.hidden=false;
}
let rendered='';
function render(){
  mount();const doc=parentDoc(),ui=doc.getElementById(UI_ID);if(!ui)return;
  const state=read(),text=format(state),box=ui.querySelector('textarea'),meta=ui.querySelector('[data-role="meta"]');
  const key=storageKey()+'\n'+text;if(key===rendered)return;rendered=key;
  box.value=text;meta.textContent=state.attempts.length?`已捕获 ${state.attempts.length} 次隐藏状态模型输出。`:'暂无额外模型诊断。';
}
install();
const timer=setInterval(()=>{install();syncRuntimeStatus();render();},500);
window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
