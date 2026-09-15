import { boundApiProfile, saveApiProfile, deleteApiProfile, normalizeApiAddress, normalizeUpdateSettings } from './api-profiles.js';
import { TAG_PATTERN } from './core.js';
import { uiCard, uiNote, uiHeading, uiActions, uiGrid } from './ui-kit.js';
import { fetchNativeModels } from './api-transport.js';

export function createApiPanel({doc,read,write,binding,setBinding,run,cancel,undo,onError,listRequestPresets=()=>[],fetchModels,readDiagnostics=()=>[],clearDiagnostics=()=>{}}){
  const make=(tag,text,parent)=>{const el=doc.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;};
  const panel=make('section');
  const heading=make('header',null,panel);heading.className='ls-page-header';make('h3','模型连接',heading);make('p','保存模型连接，再选择本聊天的状态更新方式。',heading);
  const status=make('p','',panel);status.className='ls-health';status.setAttribute('role','status');
  const updatePanel=make('section');updatePanel.setAttribute('aria-label','最新回复更新');
  const updateStatus=make('p','',updatePanel);updateStatus.className='ls-health';updateStatus.setAttribute('role','status');
  const card=(title,hint,open=false)=>uiCard(doc,panel,{title,hint,open});
  const note=(parent,text)=>uiNote(doc,parent,text);
  const field=(title,type='text',parent=panel)=>{const label=make('label',title,parent),input=make(type==='select'?'select':'input',null,label);input.setAttribute('aria-label',title);if(type!=='select')input.type=type;if(type==='checkbox')label.className='ls-check';return input;};
  const action=(title,fn,parent=panel)=>{const button=make('button',title,parent);button.type='button';button.onclick=async()=>{button.disabled=true;try{await fn();}catch(e){(updatePanel.contains(button)?updateStatus:status).textContent=e.message;onError(e);}finally{button.disabled=false;}};return button;};
  const choices=(select,items)=>{select.replaceChildren();for(const [value,title] of items)make('option',title,select).value=value;};
  // One card per decision, and every card ends with the button that saves it.
  const bindingGroup=card('状态更新绑定','决定谁来整理状态、用哪套请求设置；改动需要保存后生效。',true);
  uiHeading(doc,bindingGroup,'请求内容');
  const mode=field('状态更新方式','select',bindingGroup);choices(mode,[['inline','随正文更新'],['extra','额外模型更新']]);
  const presetRow=uiGrid(doc,bindingGroup);
  const presetMode=field('请求预设','select',presetRow);choices(presetMode,[['builtin','内置预设'],['current','当前酒馆预设'],['named','指定酒馆预设']]);
  const presetName=field('目标酒馆预设','select',presetRow);
  note(bindingGroup,'状态规则与输出格式固定发送，不受预设选择影响。预设用于补充语气、文风等要求；内置预设的补充内容默认留空。酒馆预设只用于本次请求，不切换正文预设；指定预设时，其采样参数按酒馆助手规则优先生效。');
  uiHeading(doc,bindingGroup,'模型来源');
  const sourceRow=uiGrid(doc,bindingGroup);
  const source=field('状态模型来源','select',sourceRow);choices(source,[['custom','绑定 API 预设'],['current','跟随酒馆当前连接']]);
  const bound=field('状态更新 API 预设','select',sourceRow);
  uiHeading(doc,bindingGroup,'请求策略');
  const switchRow=uiGrid(doc,bindingGroup);
  const auto=field('自动更新','checkbox',switchRow),stream=field('兼容流式响应','checkbox',switchRow);
  const limitRow=uiGrid(doc,bindingGroup);
  const attempts=field('请求总次数','number',limitRow),timeout=field('总超时（秒）','number',limitRow);
  attempts.min='1';attempts.max='5';attempts.step='1';timeout.min='0';timeout.max='600';timeout.step='1';
  note(bindingGroup,'默认总共请求 3 次（含首次），总超时默认 0 表示无限制，也可填 15～600 秒。依次失败后重试。返回完整状态块但格式、协议、栏目或读取凭据校验失败时，下一次请求会带上本地校验原因；道歉、拒答、空响应等没有完整状态块的回复直接重试，不附带原因，也不沿用此前的纠错理由；总超时覆盖全部尝试，取消或聊天变化不会重试。流式只用于接收响应，完整校验前不写入状态。');
  note(bindingGroup,'以上请求设置和绑定需保存后生效；可在首次制作 HTML 前保存绑定。外观制作复用模型连接与请求策略，使用独立 HTML 提示词，不使用这里的请求预设。自动更新只用于额外模型模式。随正文模式下，这里的模型与请求设置用于手动重算最新失败回复，无需切换模式。重试与撤销保留剧情正文。');
  const bindingHelp=make('details',null,bindingGroup);make('summary','请求规则与使用说明',bindingHelp);
  for(const explanation of [...bindingGroup.querySelectorAll(':scope > .ls-note')])bindingHelp.append(explanation);
  const bindingActions=uiActions(doc,bindingGroup);
  const runGroup=uiCard(doc,updatePanel,{title:'更新最新回复',hint:'始终处理最新 AI 回复，不受上方查看楼层影响。保留剧情正文，支持取消和撤销。',open:true});
  runGroup.dataset.lsUpdateActions='';
  const updateScope=make('p','',runGroup);updateScope.className='ls-note';
  const runActions=uiActions(doc,runGroup);
  const connectionAction=make('button','配置模型连接',uiActions(doc,runGroup));connectionAction.type='button';connectionAction.onclick=()=>doc.getElementById('ls-tab-api')?.click();
  const profileGroup=card('管理 API 预设','填写状态模型的地址、密钥和模型名称；一份预设可供状态更新、外观制作及多张卡使用。',true);
  profileGroup.parentElement.open=false;panel.insertBefore(profileGroup.parentElement,bindingGroup.parentElement);
  note(profileGroup,'密钥保存在当前酒馆用户的本地设置中，不写入角色卡或聊天记录；完整设置备份仍包含密钥。');
  const select=field('编辑 API 预设','select',profileGroup);
  const profileRow=uiGrid(doc,profileGroup);
  const name=field('API 预设名称','text',profileRow),model=field('API 模型名称','text',profileRow);
  const url=field('API 地址','text',profileGroup),key=field('API 密钥','password',profileGroup),models=field('可用模型','select',profileGroup);
  const protocol=field('API 协议','select',profileGroup);
  choices(protocol,[['helper','OpenAI 兼容（酒馆助手）'],['chat','Chat Completions（直连）'],['responses','OpenAI Responses（直连）'],['anthropic','Anthropic Messages（直连）']]);
  const exact=field('API 地址是完整端点','checkbox',profileGroup),modelsUrl=field('模型列表地址（可选）','text',profileGroup),headers=field('自定义请求头（JSON）','password',profileGroup);
  headers.autocomplete='off';headers.placeholder='{}';
  note(profileGroup,'直连协议支持内置、当前和指定酒馆提示词预设，需要服务允许浏览器跨域请求。基础地址可含 /v1、/v3 或其他前缀；勾选完整端点后原样请求该地址。自定义模型列表地址须同源。不提供列表的服务可手填模型。自定义请求头与密钥同样仅保存在本地。');
  url.placeholder='https://example.com/v1';key.autocomplete='off';name.maxLength=40;model.maxLength=200;
  let editedId='',modelEpoch=0,modelController=null;
  const resetModels=()=>{modelEpoch++;modelController?.abort();choices(models,[['','手动填写模型，或获取列表']]);};
  models.onchange=()=>{if(models.value)model.value=models.value;};
  url.oninput=key.oninput=modelsUrl.oninput=headers.oninput=resetModels;
  protocol.onchange=exact.onchange=resetModels;
  const modelActions=uiActions(doc,profileGroup);
  action('获取模型列表',async()=>{
    if(protocol.value==='helper'&&!fetchModels)throw new Error('当前酒馆助手不支持获取模型列表');
    const address=normalizeApiAddress(url.value,protocol.value,exact.checked),secret=key.value,epoch=++modelEpoch;let timer;
    modelController?.abort();const controller=new AbortController();modelController=controller;
    status.textContent='正在获取模型列表…';
    try{
      const result=await Promise.race([protocol.value==='helper'?fetchModels({apiurl:address,key:secret}):fetchNativeModels({...values(),name:name.value||'模型列表',model:model.value||'待选择'},controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('模型列表请求超时'));},30000);})]);
      if(epoch!==modelEpoch)return;
      const names=[...new Set((Array.isArray(result)?result:[]).filter(v=>typeof v==='string'&&v.length&&v.length<=200))].sort();
      choices(models,[['','请选择模型'],...names.map(v=>[v,v])]);status.textContent=names.length?`获取到 ${names.length} 个模型，选择后请保存 API 预设。`:'服务未返回模型列表，请检查连接或手动填写模型名称。';
    }catch{if(epoch===modelEpoch)throw new Error('获取模型列表失败，请检查地址、密钥和网络，或手动填写模型名称');}
    finally{clearTimeout(timer);}
  },modelActions);
  const advanced=make('details',null,profileGroup);make('summary','高级采样参数',advanced);
  const reasoning=field('思考程度','select',advanced);
  const tokenField=field('Chat Completions 长度参数','select',advanced);choices(tokenField,[['max_tokens','max_tokens（兼容服务）'],['max_completion_tokens','max_completion_tokens（OpenAI 推理模型）']]);
  make('p','长度参数选项仅用于 Chat Completions 直连；Responses 和 Anthropic 自动使用各自字段。',advanced);
  choices(reasoning,[['auto','auto（跟随服务默认）'],['none','关闭（none）'],['minimal','minimal'],['low','low'],['medium','medium'],['high','high'],['xhigh','xhigh'],['max','max'],['ultra','ultra']]);
  make('p','指定思考程度需使用直连协议。可用等级由服务和模型决定，max 不会自动降级；不支持时服务会报错。Anthropic 使用 adaptive thinking 与 effort；思考和回答共用最大 tokens，启用后不发送采样参数。OpenAI 推理模型如不支持温度等参数，请将其留空。',advanced);
  note(advanced,'留空表示不发送该采样参数，使用服务默认值。最大回复长度为 0 时不发送；Top K 为 0 时不发送。不同服务支持的参数不同。');
  const advancedRow=uiGrid(doc,advanced);
  const maxTokens=field('最大回复 tokens','number',advancedRow),temperature=field('更新温度','number',advancedRow),topP=field('Top P','number',advancedRow),topK=field('Top K','number',advancedRow),frequency=field('频率惩罚','number',advancedRow),presence=field('存在惩罚','number',advancedRow);
  for(const [el,min,max,step] of [[maxTokens,0,65536,1],[temperature,0,2,0.1],[topP,0,1,0.05],[topK,0,1000,1],[frequency,-2,2,0.1],[presence,-2,2,0.1]]){el.min=min;el.max=max;el.step=step;}
  const profileActions=uiActions(doc,profileGroup);
  const updateGroup=uiCard(doc,updatePanel,{title:'最近一次 LoreState 更新块',hint:'查看最新 AI 回复里实际存在的完整状态块。'}),updateMeta=make('p','',updateGroup),updateBox=make('textarea',null,updateGroup);
  updateBox.readOnly=true;updateBox.spellcheck=false;updateBox.setAttribute('aria-label','最近一次 LoreState 更新块');updateBox.style.cssText='width:100%;min-height:180px;box-sizing:border-box;white-space:pre;overflow:auto';
  note(updateGroup,'这里显示当前最新 AI 回复中实际存在的完整 LoreState 块。额外模型更新成功后会自动刷新；若自动更新发生在面板关闭期间，重新打开面板或点击刷新即可。');
  function latestUpdateBlock(){
    if(typeof getChatMessages!=='function')return null;
    const latest=getChatMessages('0-{{lastMessageId}}',{include_swipes:true}).findLast(m=>m.role==='assistant');if(!latest)return null;
    const message=latest.swipes?.[latest.swipe_id??0]??latest.message??'',blocks=[...message.matchAll(new RegExp(TAG_PATTERN,'g'))];
    return {floor:latest.message_id,block:blocks.at(-1)?.[0]??''};
  }
  function syncUpdatePreview(){
    const latest=latestUpdateBlock();updateBox.value=latest?.block??'';
    updateMeta.textContent=!latest?'当前聊天还没有 AI 回复。':latest.block?`第 ${latest.floor} 楼 · 找到完整更新块`:`第 ${latest.floor} 楼 · 没有完整 LoreState 更新块`;
  }
  const updateActions=uiActions(doc,updateGroup);
  action('刷新更新块',()=>syncUpdatePreview(),updateActions);
  action('复制更新块',async()=>{
    if(!updateBox.value)throw new Error('当前没有可复制的完整更新块');
    try{await navigator.clipboard.writeText(updateBox.value);updateStatus.textContent='LoreState 更新块已复制。';}
    catch{updateBox.focus();updateBox.select();updateStatus.textContent='浏览器不允许自动复制，请从文本框手动复制。';}
  },updateActions);
  const diagnosticGroup=uiCard(doc,updatePanel,{title:'最近一次 LoreState 更新诊断',hint:'模型返回与本地校验结果，用来定位失败原因。'}),diagnosticMeta=make('p','',diagnosticGroup),diagnosticBox=make('textarea',null,diagnosticGroup);
  diagnosticBox.readOnly=true;diagnosticBox.spellcheck=false;diagnosticBox.setAttribute('aria-label','最近一次 LoreState 更新诊断');diagnosticBox.style.cssText='width:100%;min-height:320px;box-sizing:border-box;white-space:pre;overflow:auto';
  note(diagnosticGroup,'这里记录当前标签页、当前聊天最近 10 次额外模型请求的原始返回和本地校验结果；单次输出最多保留 32000 字符。诊断不保存到聊天或角色卡，不记录请求提示或 API 密钥，切换聊天时清空。');
  function syncDiagnostics(){
    const entries=readDiagnostics(),lines=[];
    for(const [index,item] of entries.entries()){
      lines.push(`========== 第 ${index+1} 次状态模型请求 ==========`,`时间：${item.time}`,`尝试：${item.attempt}/${item.total}`,`接口：${item.method}`,`结果：${item.status}`);
      if(item.requestError)lines.push(`请求错误：${item.requestError}`);
      if(item.localError)lines.push(`本地校验错误：${item.localError}`);
      lines.push('模型原始输出：',item.output||'（没有捕获到文字输出）');
      if(item.truncated)lines.push('【输出过长：仅保留开头和结尾】');
      lines.push('');
    }
    diagnosticBox.value=lines.join('\n').trim();diagnosticMeta.textContent=entries.length?`已捕获 ${entries.length} 次状态模型请求。`:'暂无额外模型诊断。';
  }
  const diagnosticActions=uiActions(doc,diagnosticGroup);
  action('刷新诊断',syncDiagnostics,diagnosticActions);
  action('复制诊断',async()=>{if(!diagnosticBox.value)throw new Error('当前没有可复制的诊断');try{await navigator.clipboard.writeText(diagnosticBox.value);updateStatus.textContent='LoreState 诊断已复制。';}catch{diagnosticBox.focus();diagnosticBox.select();updateStatus.textContent='浏览器不允许自动复制，请从文本框手动复制。';}},diagnosticActions);
  action('清除诊断',()=>{clearDiagnostics();syncDiagnostics();},diagnosticActions);
  function load(){
    resetModels();const p=(read().profiles??[]).find(p=>p.id===select.value);editedId=p?.id??'';
    protocol.value=p?.protocol??'helper';exact.checked=p?.exact??false;modelsUrl.value=p?.modelsUrl??'';headers.value=JSON.stringify(p?.headers??{});reasoning.value=p?.reasoning??'auto';tokenField.value=p?.tokenField??'max_tokens';
    for(const [el,value] of [[name,p?.name??''],[url,p?.url??''],[key,p?.key??''],[model,p?.model??''],[maxTokens,p?.maxTokens??8000],[temperature,p?.temperature??0.2],[topP,p?.topP??''],[topK,p?.topK??''],[frequency,p?.frequencyPenalty??''],[presence,p?.presencePenalty??'']])el.value=value==='unset'?'':value;
  }
  function visibility(){presetName.parentElement.hidden=presetMode.value!=='named';bound.parentElement.hidden=source.value!=='custom';}
  presetMode.onchange=source.onchange=visibility;
  let loadedSignature=null;
  function sync(preferred=editedId){
    const signature=JSON.stringify([read(),binding(),listRequestPresets()]);
    // Navigation refreshes read-only operation summaries without discarding unsaved fields.
    if(signature===loadedSignature&&preferred===editedId){refreshOperations();return;}
    loadedSignature=signature;
    const profiles=read().profiles??[];choices(select,[['','新建预设'],...profiles.map(p=>[p.id,p.name])]);choices(bound,[['','未绑定'],...profiles.map(p=>[p.id,p.name])]);
    select.value=preferred;const config=normalizeUpdateSettings(binding());bound.value=config.profileId;mode.value=config.mode;source.value=config.source;presetMode.value=config.presetMode;
    choices(presetName,[['','请选择预设'],...listRequestPresets().map(name=>[name,name])]);presetName.value=config.presetName;
    auto.checked=config.auto;stream.checked=config.stream;attempts.value=config.attempts;timeout.value=config.timeoutSeconds;
    const current=profiles.find(p=>p.id===config.profileId);
    status.textContent=`当前模式：${config.mode==='extra'?'额外模型':'随正文更新'}；状态模型：${config.source==='current'?'酒馆当前连接':current?.name??(config.profileId?'预设已删除，请重新绑定':'未绑定')}。`;
    load();visibility();refreshOperations();
  }
  select.onchange=load;
  const values=()=>({id:editedId||crypto.randomUUID(),name:name.value,url:url.value,key:key.value,model:model.value,maxTokens:maxTokens.value,temperature:temperature.value,topP:topP.value,topK:topK.value,frequencyPenalty:frequency.value,presencePenalty:presence.value,protocol:protocol.value,exact:exact.checked,modelsUrl:modelsUrl.value,headers:headers.value,reasoning:reasoning.value,tokenField:tokenField.value});
  action('保存 API 预设',()=>{const p=values();write(saveApiProfile(read(),p));sync(p.id);status.textContent+=' API 预设已保存。';},profileActions).classList.add('ls-primary');
  action('另存为新 API 预设',()=>{const p={...values(),id:crypto.randomUUID()};write(saveApiProfile(read(),p));sync(p.id);},profileActions);
  action('删除 API 预设',()=>{if(!editedId)throw new Error('请选择要删除的预设');write(deleteApiProfile(read(),editedId));sync('');},profileActions).classList.add('ls-danger');
  action('保存状态更新绑定',()=>{
    const config=normalizeUpdateSettings({...binding(),mode:mode.value,profileId:bound.value,source:source.value,presetMode:presetMode.value,presetName:presetName.value,auto:auto.checked,stream:stream.checked,attempts:attempts.value,timeoutSeconds:timeout.value});
    if(config.mode==='extra'&&config.source==='custom')boundApiProfile(read(),config.profileId);
    if(config.presetMode==='named'&&!listRequestPresets().includes(config.presetName))throw new Error('所选酒馆预设已失效');
    setBinding(config);sync();
  },bindingActions).classList.add('ls-primary');
  const runButton=action('重新更新最新回复状态',async()=>{await run();syncUpdatePreview();},runActions);runButton.classList.add('ls-primary');
  action('取消状态更新',cancel,runActions);action('撤销最近一次状态更新',async()=>{await undo();syncUpdatePreview();},runActions);
  function refreshOperations(){
    const config=normalizeUpdateSettings(binding()),latest=latestUpdateBlock(),profile=(read().profiles??[]).find(p=>p.id===config.profileId);
    runButton.textContent=config.mode==='inline'?'重新计算最新失败回复状态':'重新更新最新回复状态';
    updateScope.textContent=(latest?`目标：第 ${latest.floor} 楼。`:'当前聊天还没有 AI 回复。')+(config.mode==='inline'?'随正文模式：只重算失败回复；尾部截断会先要求核对分界。':'额外模型模式：重新整理最新回复状态。')+` 模型：${config.source==='current'?'酒馆当前连接':profile?.name??'未绑定，请先配置模型连接'}。`;
    syncUpdatePreview();syncDiagnostics();
  }
  return {panel,updatePanel,sync,refreshOperations,report:text=>{updateStatus.textContent=text;},refreshUpdate:syncUpdatePreview,refreshDiagnostics:syncDiagnostics,clear:()=>{modelEpoch++;modelController?.abort();headers.value='{}';loadedSignature=null;key.value='';updateStatus.textContent='';updateScope.textContent='';updateBox.value='';updateMeta.textContent='';diagnosticBox.value='';diagnosticMeta.textContent='';}};
}
