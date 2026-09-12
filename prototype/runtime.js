import { entityFields } from './modules.js';
import { historyIdentity, historyMatches, snapshotSchema, collectSnapshots, replaySnapshots, planRestore } from './snapshots.js';
import { emptySnapshotStore, readSnapshots, packSnapshots, addReadReceipt, readReceipt, snapshotStorageInfo } from './snapshot-store.js';
import { createStateFrame, createStateWindow } from './state-frame.js';
import { PROTO_KEY, TAG_PATTERN, replayState, playPrompt, preparePrompt, authorPrompt, authorPolicy, initialResult, inspectFloor } from './core.js';
import { renderTemplate, templateSchema, validateTemplateSchema } from './template.js';
import { createControlCenter } from './control-center.js';
import { listPresets, sameSchema, savePreset, deletePreset } from './presets.js';
import { API_PROFILE_KEY, boundApiProfile, extraModelRequest, normalizeUpdateSettings } from './api-profiles.js';
import { createApiPanel } from './api-panel.js';
import { variableStory, validateExtraUpdate, settleContinuedMessage, splitTruncatedUpdate } from './extra-update.js';

export function shouldReloadForChatChange(loadedChatId,nextChatId){
  return nextChatId!==undefined&&nextChatId!==loadedChatId;
}

// Runs inside the owning Tavern Helper character script, including remote imports.
export function startPrototype(defaultHtml) {
  const doc=window.parent.document,ctx=()=>window.parent.SillyTavern.getContext();
  const runtimeSlot='__lorestatePrototypeRuntime';
  const previousRuntime=window.parent[runtimeSlot];
  if(typeof previousRuntime?.dispose==='function')previousRuntime.dispose();
  else if(doc.getElementById('lorestate-prototype-settings'))throw new Error('已有 LoreState 原型脚本运行，请勿重复启用');
  const loadedChatId=ctx().getCurrentChatId();
  let runtimeRegistration=null;
  const settings=()=>getVariables({type:'script'})[PROTO_KEY]??{};
  const chatSettings=()=>getVariables({type:'chat'})[PROTO_KEY]??{};
  const apiSettings=()=>getVariables({type:'global'})?.[API_PROFILE_KEY]??{profiles:[]};
  const updateBinding=()=>normalizeUpdateSettings(chatSettings().variableUpdate);
  const requestPresets=()=>typeof getPresetNames==='function'?getPresetNames():[];
  const selectedStateModel=binding=>binding.source==='custom'?boundApiProfile(apiSettings(),binding.profileId):null;
  function checkRequestPreset(binding){
    if(binding.source==='current'&&ctx().mainApi!=='openai')throw new Error('跟随当前连接需要酒馆使用 Chat Completion；其他连接请绑定独立 API');
    if(binding.presetMode!=='builtin'&&typeof generate!=='function')throw new Error('当前酒馆助手缺少预设生成接口');
    if(binding.presetMode==='named'&&!requestPresets().includes(binding.presetName))throw new Error('指定的酒馆请求预设不存在，请重新选择');
  }
  function requestContextIdentity(binding){
    const preset=binding.presetMode==='builtin'?null:typeof getPreset==='function'?getPreset(binding.presetMode==='current'?'in_use':binding.presetName):null;
    if(binding.presetMode!=='builtin'&&preset===null)throw new Error('当前酒馆助手缺少读取请求预设的接口');
    return JSON.stringify([preset,binding.source==='current'?[ctx().mainApi,ctx().chatCompletionSettings]:null]);
  }
  const messages=()=>{const store=chatSettings().snapshotStore;return getChatMessages('0-{{lastMessageId}}',{include_swipes:true}).map(m=>{
    const message=m.swipes?.[m.swipe_id??0]??m.message??'';
    return {message_id:m.message_id,role:m.role,is_hidden:m.is_hidden,swipe_id:m.swipe_id??0,message,readReceipt:readReceipt(message,store)};
  });};
  const currentPolicy=(config=settings())=>chatSettings().policy??(messages().some(m=>m.message_id>=(chatSettings().start??1)&&m.role==='assistant')?{}:config.authorPolicy??{});
  const schemaFor=(config=settings())=>config.schema?{...config.schema,...currentPolicy(config)}:undefined;
  function freezePolicy(){
    if(chatSettings().policy!==undefined)return;
    const policy=structuredClone(currentPolicy());
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],policy}}),{type:'chat'});
  }
  const identity=()=>[ctx().chat,ctx().getCurrentChatId()];
  const matches=([chat,id])=>!closed&&ctx().chat===chat&&ctx().getCurrentChatId()===id;
  let closed=false,queue=Promise.resolve(),pending=false,uninject=null,view=null,renderKey='',menuObserver,chatObserver,chatRepairTimer=null;
  let extraJob=null,autoUpdate=null,autoTimer=null,chatEpoch=0,continuationWork=null;
  const node=(tag,text,parent)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;parent?.append(el);return el;};
  const stateWindow=createStateWindow(doc);
  // Grid themes flatten .mes_block with display:contents. Keep the summary host
  // from contributing its long, single-line preview to an auto-sized grid column.
  const floorLayout=node('style','#chat .mes:has(.lorestate-prototype-view) > .mes_block > .bbs-fp-host,#chat .mes:has(.lorestate-prototype-view) > .bbs-fp-host{min-width:0;grid-column:1 / -1}',doc.head);
  floorLayout.id='lorestate-floor-layout';
  const panel=node('section',undefined,doc.body);panel.id='lorestate-prototype-settings';panel.setAttribute('aria-label','LoreState 原型设置');
  const status=node('p','选择状态栏条目，再粘贴 HTML。保存后在下一次 AI 回复建立状态。',panel);status.setAttribute('role','status');
  const report=text=>{status.textContent=text;};
  const actions=new Map();
  const button=(title,parent,fn)=>{const el=node('button',title,parent);el.type='button';actions.set(title,el);el.onclick=async()=>{el.disabled=true;try{await fn();}catch(e){fault(e,'操作失败');}finally{el.disabled=false;}};return el;};
  const notice=node('aside',undefined,doc.body);notice.hidden=true;notice.setAttribute('role','alert');
  notice.style.cssText='position:fixed;right:12px;top:12px;z-index:100000;max-width:min(440px,92vw);padding:16px;background:#382621;color:#fff;border:2px solid #efb06a;border-radius:8px;white-space:pre-wrap';
  const noticeText=node('p','',notice);
  button('查看诊断',notice,()=>openManager(chatSettings().current?.errors?.[0]?.floor));button('关闭提醒',notice,()=>{notice.hidden=true;});
  let noticeKey='',runtimeLogs=[],extraDiagnostics=[];
  function diagnosticText(value,limit=32000){
    const text=typeof value==='string'?value:value==null?'':String(value);if(text.length<=limit)return {text,truncated:false};
    const half=Math.floor((limit-32)/2);return {text:text.slice(0,half)+'\n…[中间内容因诊断长度限制省略]…\n'+text.slice(-half),truncated:true};
  }
  function safeDiagnosticError(error,secrets=[]){
    let text=String(error?.message??error).replace(/[\r\n]+/g,' ').slice(0,2000);
    for(const secret of secrets)if(typeof secret==='string'&&secret.length>=4)text=text.split(secret).join('[REDACTED]');
    return text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]');
  }
  function beginExtraDiagnostic(attempt,total,method){
    const entry={time:new Date().toISOString(),attempt,total,method,status:'requesting',requestError:'',localError:'',output:'',truncated:false};
    extraDiagnostics.push(entry);extraDiagnostics=extraDiagnostics.slice(-10);return entry;
  }
  function fault(error,stage){
    const message=String(error?.message??error).slice(0,500);
    const entry={time:new Date().toISOString(),stage,message};
    runtimeLogs.push(entry);runtimeLogs=runtimeLogs.slice(-30);
    report(`${stage}：${message}`);noticeText.textContent=`LoreState ${stage}：${message}\n请打开诊断查看；状态可能尚未更新。`;notice.hidden=false;
    console.warn('[LoreState]',stage,message);
  }
  const manager=node('dialog',undefined,doc.body);manager.id='lorestate-state-manager';manager.setAttribute('aria-label','LoreState 状态管理器');
  const floorSelect=node('select',undefined,manager);floorSelect.setAttribute('aria-label','AI 楼层');
  const summary=node('p','',manager);summary.setAttribute('role','status');
  const details=node('div',undefined,manager),diagnostics=node('div',undefined,manager);
  const repairBox=node('textarea',undefined,manager);repairBox.readOnly=true;repairBox.hidden=true;repairBox.setAttribute('aria-label','诊断报告与旧修复备份');repairBox.style.cssText='width:100%;height:180px';
  function floorList(){return messages().filter(m=>m.role==='assistant');}
  function errorText(e){return `第 ${e.floor} 楼 · ${e.scope}${e.line?` · 原文第 ${e.line} 行 ${e.column} 列`:''}：${e.message}\n建议：${e.hint}`;}
  function showObject(title,value){const section=node('details',undefined,details);node('summary',title,section);const pre=node('pre',JSON.stringify(value,null,2),section);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';}
  function showState(state){
    node('h3','本层完整状态',details);
    if(!state){node('p','尚未建立状态。',details);return;}
    function fields(values,parent){const grid=node('dl',undefined,parent);grid.className='ls-fields';for(const [name,value] of Object.entries(values)){const pair=node('div',undefined,grid);node('dt',name,pair);node('dd',value,pair).style.whiteSpace='pre-wrap';}}
    if(Object.keys(state.shared).length){node('h4','公共状态',details);fields(state.shared,details);}
    for(const entity of Object.values(state.entities)){
      const section=node('details',undefined,details);section.open=entity.presence==='active';
      node('summary',`${entity.type} · ${entity.name} · ${entity.id} · ${entity.presence==='cold'?'冷档':'热档'}${entity.pending?' · 未完成事件':''}`,section);
      node('p',`${entity.identity} · 最后确认：${entity.confirmed??'剧情时间未知'} · 更新楼层：${entity.confirmedFloor??'未知'} · 关联：${entity.links.join('、')||'无'}`,section);fields(entity.fields,section);
    }
    showObject('查看原始状态数据',state);
  }
  function showFloor(){
    syncSnapshots();
    repairBox.hidden=true;recalculate.hidden=true;previewTail.hidden=true;
    if(tailDraft&&(!tailCurrent(tailDraft)||tailDraft.floor!==Number(floorSelect.value)))clearTailPreview();
    details.replaceChildren();diagnostics.replaceChildren();
    if(!floorSelect.value){summary.textContent='当前聊天没有可查看的 AI 楼层。';return;}
    const config=settings();if(!schemaFor(config)){summary.textContent='请先配置并启用 LoreState。';return;}
    const item=inspectFloor(messages(),schemaFor(config),chatSettings().start??1,Number(floorSelect.value));
    recalculate.hidden=updateBinding().mode!=='inline'||!item.error||item.excluded||item.floor!==messages().at(-1)?.message_id;
    previewTail.hidden=recalculate.hidden||!splitTruncatedUpdate(item.source);
    if(!previewTail.hidden)recalculate.hidden=true;
    summary.textContent=item.excluded?'本层在初始化起点之前，未参与状态更新。':item.error?'本层更新失败，整轮未应用。':item.tainted?'本层已应用，但前面存在失败更新，状态有缺口。':'本层更新成功。';
    node('p',`最后连续正常楼层：${item.lastGoodFloor??'尚无'}；最后应用楼层：${item.lastAppliedFloor??'尚无'}`,details);
    summary.dataset.error=String(item.tainted);
    if(!item.errors.length)node('p','截至本层没有发现更新错误。',diagnostics);
    for(const error of item.errors)node('p',errorText(error),diagnostics).style.whiteSpace='pre-wrap';
    if(chatSettings().checkpoint)node('p','已启用状态回档。这里展示原文回放；当前生效状态请看正文状态栏。',details);
    showState(item.state);
    const changes=node('details',undefined,details);node('summary',`本轮变化 · ${item.changes.length} 项`,changes);
    if(!item.changes.length)node('p',item.error?'本轮失败，没有应用变化。':'本轮没有状态变化。',changes);
    for(const change of item.changes){
      const path=change.path.replace(/^shared /,'公共状态 ').replace(/^entities /,'实体 ').replace(' / fields / ',' / ');
      node('h4',`${change.kind} · ${path}`,changes);
      node('p',`${change.before??'未记录'} → ${change.after??'已删除'}`,changes).style.whiteSpace='pre-wrap';
    }
    const raw=node('details',undefined,details);node('summary','本层消息原文',raw);const pre=node('pre',item.source,raw);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
    if(runtimeLogs.length)showObject('本次运行异常（最多 30 条）',runtimeLogs);
  }
  function syncFloors(preferred=floorSelect.value){
    const list=floorList();floorSelect.replaceChildren();
    for(const m of list){const option=node('option',`第 ${m.message_id} 楼`,floorSelect);option.value=String(m.message_id);}
    floorSelect.value=list.some(m=>String(m.message_id)===String(preferred))?String(preferred):String(list.at(-1)?.message_id??'');showFloor();
  }
  function openManager(floor){center.open(floor!==undefined?'diagnostics':'state');syncFloors(floor);}
  floorSelect.onchange=()=>{try{showFloor();}catch(e){fault(e,'历史读取失败');}};
  button('上一 AI 层',manager,()=>{floorSelect.selectedIndex=Math.max(0,floorSelect.selectedIndex-1);showFloor();});
  button('下一 AI 层',manager,()=>{floorSelect.selectedIndex=Math.min(floorSelect.options.length-1,floorSelect.selectedIndex+1);showFloor();});
  button('返回最新',manager,()=>syncFloors(-1));
  button('定位聊天消息',manager,()=>{
    const target=doc.querySelector(`#chat .mes[mesid="${Number(floorSelect.value)}"]`);
    if(!target){summary.textContent='该楼层尚未加载到聊天页面，请向上加载历史；管理器仍可查看其状态。';return;}
    manager.close();target.scrollIntoView({block:'center',behavior:'smooth'});
  });
  button('重新校验全部楼层',manager,async()=>{await refresh();syncFloors();});
  button('复制诊断报告',manager,async()=>{
    const result=getResult(),payload={version:'0.6.0',floor:Number(floorSelect.value),lastGoodFloor:result.lastGoodFloor,errors:result.errors,runtimeLogs};
    repairBox.hidden=false;repairBox.value=JSON.stringify(payload,null,2);
    try{await navigator.clipboard.writeText(repairBox.value);summary.textContent='诊断报告已复制，不含完整消息和状态正文。';}catch{summary.textContent='请从下方文本框手动复制诊断报告。';}
  });
  const recalculate=button('重新计算本层状态',manager,async()=>{
    const floor=Number(floorSelect.value);
    center.open('api');apiUi.sync();
    try{await runExtraUpdate({repair:true,floor});apiUi.refreshUpdate();}
    catch(error){apiUi.report(error.message);throw error;}
  });recalculate.hidden=true;
  let tailDraft=null;
  const tailPreview=node('section');tailPreview.hidden=true;
  node('p','确认下方分界：保留正文应完整，待替换尾部不应包含需要保留的剧情。若正文也截断，请先补完正文。确认后才请求状态模型；失败或取消不会删除原文。',tailPreview);
  function tailText(label){
    const field=node('label',label,tailPreview),box=node('textarea',undefined,field);
    box.readOnly=true;box.setAttribute('aria-label',label);box.style.cssText='width:100%;height:180px;box-sizing:border-box';return box;
  }
  const keptStory=tailText('将保留的正文'),removedTail=tailText('将替换的截断尾部');
  const tailContext=()=>JSON.stringify([historyIdentity(messages()),settings(),schemaFor(),updateBinding(),apiSettings(),chatSettings().checkpoint??null,chatSettings().start??1]);
  const tailCurrent=plan=>!!plan&&matches(plan.id)&&chatEpoch===plan.epoch&&tailContext()===plan.context;
  function clearTailPreview(){tailDraft=null;tailPreview.hidden=true;keptStory.value='';removedTail.value='';}
  function previewTruncatedTail(floor=Number(floorSelect.value)){
    clearTailPreview();
    if(extraJob||hostGenerating())throw new Error('请等待生成结束或取消状态更新');
    const config=settings(),saved=chatSettings(),list=messages(),last=list.at(-1);
    if(!active(config)||updateBinding().mode!=='inline')throw new Error('尾部截断重算仅用于已启用的随正文模式');
    if(!last||last.role!=='assistant'||floor!==last.message_id||floor<(saved.start??1))throw new Error('仅支持最新 AI 回复的截断预览');
    if(saved.checkpoint&&floor<=saved.checkpoint.cutoff)throw new Error('不能改写回档前保留的正文');
    const result=getResult(config,list),previous=getResult(config,list.slice(0,-1));
    if(previous.errors.length)throw new Error(`此前第 ${previous.errors[0].floor} 楼存在状态缺口，请先手动修复历史`);
    if(!result.errors.some(error=>error.floor===floor))throw new Error('本层状态已通过校验，无需修复');
    const split=splitTruncatedUpdate(last.message);
    if(!split)throw new Error('尾部边界不明确，请手动修复；不支持模糊前缀、多起点或嵌套标签');
    syncFloors(floor);
    tailDraft={...split,floor,id:identity(),epoch:chatEpoch,context:tailContext()};
    keptStory.value=split.story;removedTail.value=split.tail;tailPreview.hidden=false;
    center.open('diagnostics');tailPreview.closest('details').open=true;
    summary.textContent='尾部截断预览未修改消息，也未调用模型；请核对分界后确认。';
  }
  const previewTail=button('预览尾部截断修复',manager,previewTruncatedTail);previewTail.hidden=true;
  button('确认边界并重算',tailPreview,async()=>{
    const plan=tailDraft;
    if(!tailCurrent(plan)){clearTailPreview();throw new Error('聊天、回复或配置已变化，请重新预览截断尾部');}
    clearTailPreview();center.open('api');apiUi.sync();
    try{await runExtraUpdate({repair:true,floor:plan.floor,tailPlan:plan});apiUi.refreshUpdate();}
    catch(error){apiUi.report(error.message);throw error;}
  });
  button('取消截断预览',tailPreview,clearTailPreview);
  manager.addEventListener('close',clearTailPreview);
  button('撤销最近一次格式修复',manager,async()=>{
    if(extraJob||hostGenerating())throw new Error('请等待生成结束或取消状态更新');
    if(chatSettings().checkpoint)throw new Error('恢复旧格式修复备份前请先撤销回档');
    const backup=chatSettings().repairBackup;if(!backup)throw new Error('本聊天没有格式修复备份');
    const id=identity(),current=getChatMessages(backup.floor,{include_swipes:true})[0];
    if(current?.swipe_id!==backup.swipe||current?.swipes?.[current.swipe_id]!==backup.repaired)throw new Error('目标回复已变化，为避免覆盖，请从备份手动恢复');
    await setChatMessages([{message_id:backup.floor,message:backup.original}],{refresh:'affected'});
    if(!matches(id))return;
    updateVariablesWith(v=>{const next={...v[PROTO_KEY]};delete next.repairBackup;return {...v,[PROTO_KEY]:next};},{type:'chat'});
    await refresh();syncFloors(backup.floor);
  });
  button('查看格式修复备份',manager,()=>{repairBox.value=chatSettings().repairBackup?.original??'没有备份';repairBox.hidden=false;});
  let restoreDraft=null,capturedKey='';
  const snapshotPanel=node('section'),snapshotSelect=node('select',undefined,snapshotPanel);
  snapshotSelect.setAttribute('aria-label','历史状态快照');
  const snapshotInfo=node('p','',snapshotPanel),snapshotPreview=node('pre','',snapshotPanel);
  snapshotPreview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto';
  function syncSnapshots(){
    const old=snapshotSelect.value, saved=chatSettings();snapshotSelect.replaceChildren();
    for(const snap of [...readSnapshots(saved)].reverse()){
      const o=node('option',`第 ${snap.floor} 楼 · 回复 ${snap.swipe+1} · ${snap.result.tainted?'有缺口':'正常'} · ${snap.id.slice(0,8)}`,snapshotSelect);o.value=snap.id;
    }
    if([...snapshotSelect.options].some(o=>o.value===old))snapshotSelect.value=old;
    const info=snapshotStorageInfo(saved);
    snapshotInfo.textContent=`已保存 ${info.count} 份历史快照，共用 ${info.bodies} 份状态正文；存档约 ${(info.bytes/1024/1024).toFixed(2)} MiB，不自动裁剪。`+(info.bytes>20*1024*1024?' 存档较大，建议导出备份后分段聊天。':'')+(saved.checkpoint?`当前从第 ${saved.checkpoint.floor} 楼快照继续。`:'')+' 回档保留所有正文，旧剧情仍在 AI 上下文中。';
  }
  snapshotSelect.onchange=()=>{restoreDraft=null;snapshotPreview.textContent='';};
  button('预览快照回档',snapshotPanel,()=>{
    const saved=chatSettings(),config=settings(),list=messages();
    const plan=planRestore(readSnapshots(saved).find(s=>s.id===snapshotSelect.value),list,schemaFor(config),saved.start??1,saved.checkpoint??null);
    restoreDraft={...plan,identity:identity(),previous:JSON.stringify(saved.checkpoint??null)};
    snapshotPreview.textContent='确认后仅恢复以下完整状态，已有后续正文不再参与状态回放。\n'+JSON.stringify(plan.snapshot.result.state,null,2);
  });
  button('确认回档',snapshotPanel,async()=>{
    const plan=restoreDraft,saved=chatSettings();
    if(hostGenerating())throw new Error('请等待生成结束后回档');
    if(!plan||!matches(plan.identity)||historyIdentity(messages())!==plan.undo.prefix||snapshotSchema(schemaFor(),saved.start??1)!==plan.checkpoint.schema||JSON.stringify(saved.checkpoint??null)!==plan.previous)throw new Error('请重新预览快照，聊天或配置可能已变化');
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],checkpoint:plan.checkpoint,restoreUndo:plan.undo,current:structuredClone(plan.checkpoint.result)}}),{type:'chat'});
    restoreDraft=null;snapshotPreview.textContent='回档完成。正文保留，新回复从此状态继续。';renderKey='';await refresh();syncSnapshots();
  });
  button('撤销上次回档',snapshotPanel,async()=>{
    if(hostGenerating())throw new Error('请等待生成结束后撤销');
    const saved=chatSettings(),undo=saved.restoreUndo;
    if(!undo)throw new Error('没有可撤销的回档');
    if(!historyMatches(messages(),undo.prefix))throw new Error('回档后聊天已变化，请重新选择并预览快照，避免覆盖新进度');
    const result=replaySnapshots(messages(),schemaFor(),saved.start??1,undo.checkpoint);
    updateVariablesWith(v=>{const next={...v[PROTO_KEY],checkpoint:undo.checkpoint,current:result};delete next.restoreUndo;return {...v,[PROTO_KEY]:next};},{type:'chat'});
    restoreDraft=null;snapshotPreview.textContent='已撤销上次回档。';renderKey='';await refresh();syncSnapshots();
  });
  manager.append(repairBox,details);
  const bookLabel=node('label','角色／聊天绑定的世界书',panel),books=node('select',undefined,bookLabel);books.setAttribute('aria-label','世界书');
  const entryLabel=node('label','状态栏条目',panel),entries=node('select',undefined,entryLabel);entries.setAttribute('aria-label','状态栏条目');
  const rules=node('textarea',undefined,panel);rules.readOnly=true;rules.setAttribute('aria-label','条目内容');
  let loadedEntries=[];
  const selectedEntry=()=>loadedEntries.find(e=>String(e.uid)===entries.value);
  async function loadEntries(){
    const id=identity(),name=books.value;if(!name){loadedEntries=[];entries.replaceChildren();rules.value='';return;}
    const data=await getWorldbook(name);if(!matches(id)||books.value!==name)return;
    loadedEntries=data;entries.replaceChildren();for(const e of data){const opt=node('option',e.name||`条目 ${e.uid}`,entries);opt.value=String(e.uid);}
    const saved=settings();if(saved.book===name&&data.some(e=>e.uid===saved.uid))entries.value=String(saved.uid);
    rules.value=selectedEntry()?.content??'';
  }
  async function loadBooks(){
    const bound=getCharWorldbookNames('current'),chatBook=getChatWorldbookName('current');
    const names=[...new Set([bound.primary,...bound.additional,chatBook].filter(Boolean))];books.replaceChildren();
    for(const name of names)node('option',name,books).value=name;
    if(names.includes(settings().book))books.value=settings().book;
    await loadEntries();if(!names.length)report('当前角色没有绑定世界书。请先在酒馆绑定状态栏世界书，再刷新列表。');
  }
  books.onchange=()=>loadEntries().catch(e=>fault(e,'世界书读取失败'));entries.onchange=()=>{rules.value=selectedEntry()?.content??'';};
  button('刷新世界书列表',panel,loadBooks);
  const maker=node('textarea',undefined,panel);maker.readOnly=true;maker.setAttribute('aria-label','HTML 制作提示词');maker.placeholder='点击下方按钮生成提示词，可复制给网页 AI';
  button('生成并复制 HTML 制作提示词',panel,async()=>{
    if(!selectedEntry()?.content?.trim())throw new Error('请先选择有内容的状态栏条目');
    maker.value=authorPrompt(selectedEntry().content);
    try{await navigator.clipboard.writeText(maker.value);report('制作提示词已复制。交给网页 AI 后，将 HTML 粘贴到下方。');}
    catch{report('制作提示词已生成，请从文本框手动复制。');}
  });
  const htmlLabel=node('label','粘贴网页 AI 生成的 HTML',panel),html=node('textarea',undefined,htmlLabel);html.setAttribute('aria-label','HTML 模板');html.rows=9;html.value=settings().html||defaultHtml;
  const presetLabel=node('label','HTML 预设（随卡保存）',panel),presetSelect=node('select',undefined,presetLabel);presetSelect.setAttribute('aria-label','HTML 预设');
  const nameLabel=node('label','预设名称',panel),presetName=node('input',undefined,nameLabel);presetName.maxLength=40;presetName.setAttribute('aria-label','预设名称');
  function syncPresets(id=settings().activePresetId??'default'){
    presetSelect.replaceChildren();for(const p of listPresets(settings())){const option=node('option',p.name,presetSelect);option.value=p.id;}
    if(listPresets(settings()).some(p=>p.id===id))presetSelect.value=id;
    presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'我的样式';
  }
  function writeConfig(config){updateVariablesWith(v=>({...v,[PROTO_KEY]:config}),{type:'script'});}
  function validateSkin(source){const config=settings(),parsed={schema:validateTemplateSchema(source,config.schema??null)};if(config.ready&&schemaFor(config)&&!sameSchema(parsed.schema,schemaFor(config)))throw new Error('预设的栏目必须与当前配置一致；可以调整顺序和外观，不能增删栏目');return parsed;}
  presetSelect.onchange=()=>{presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'';};
  button('另存为新预设',panel,()=>{validateSkin(html.value);const id=crypto.randomUUID();writeConfig(savePreset(settings(),presetName.value,html.value,id));syncPresets(id);report('已保存新预设。点击“应用所选预设”才会切换当前样式。');});
  button('覆盖所选预设',panel,async()=>{validateSkin(html.value);const config=settings(),id=presetSelect.value;if(!id)throw new Error('请先保存一份预设');let next=savePreset(config,presetName.value,html.value,id);if(id===(config.activePresetId??'default'))next={...next,html:html.value};writeConfig(next);syncPresets(id);renderKey='';await refresh();report('预设已更新，聊天状态保留。');});
  button('应用所选预设',panel,async()=>{const config=settings(),preset=listPresets(config).find(p=>p.id===presetSelect.value);if(!preset)throw new Error('请先保存一份预设');validateSkin(preset.html);if(!config.ready)throw new Error('请先点击“保存 HTML 并启用本聊天”完成初始配置');writeConfig({...config,presets:listPresets(config),html:preset.html,activePresetId:preset.id});html.value=preset.html;renderKey='';await refresh();report(`已应用“${preset.name}”，聊天状态保留。`);});
  button('删除所选预设',panel,()=>{writeConfig(deletePreset(settings(),presetSelect.value));syncPresets();report('已删除所选预设，当前展示保留。');});
  syncPresets();
  const preview=createStateFrame(doc,'LoreState HTML 预览');panel.append(preview);
  const getResult=(config=settings(),list=messages())=>{
    const pending=chatSettings().continuationPending;
    if(pending&&list.some(m=>m.message_id===pending.floor&&m.message!==pending.original))throw new Error('续写尚未整理完成，请重新读取当前聊天状态；原分支变化时需先恢复原分支');
    return replaySnapshots(list,schemaFor(config),chatSettings().start??1,chatSettings().checkpoint);
  };
  button('预览 HTML（不保存）',panel,()=>{
    const schema=templateSchema(html.value,selectedEntry()?.content??''),config=settings();
    const example=fields=>Object.fromEntries(fields.map(f=>[f,`${f}的示例文字`]));
    const state=schemaFor(config)&&sameSchema(schema,schemaFor(config))?getResult(config).state:null;
    preview.srcdoc=renderTemplate(html.value,state??{shared:example(schema.shared),entities:schema.modules?Object.fromEntries(Object.entries(schema.modules).map(([type,fields],i)=>['X'+i,{id:'X'+i,name:type+'示例',identity:'实体识别信息',type,confirmed:null,presence:'active',fields:example(fields)}])):schema.entity.length?{P01:{id:'P01',name:'示例实体',identity:'实体识别信息',type:'通用',confirmed:null,presence:'active',fields:example(schema.entity)}}:{}});
    report(`公共栏目：${schema.shared.join('、')||'无'}；实体栏目：${schema.entity.join('、')||'无'}。预览未保存。`);
  });
  const regexId='lorestate-text-prototype-tags-v1';
  async function installRegex(){
    await updateTavernRegexesWith(old=>[
      ...old.filter(r=>![regexId,`${regexId}-display`,`${regexId}-prompt`].includes(r.id)),
      ...['display','prompt'].map(destination=>({id:`${regexId}-${destination}`,script_name:`LoreState 原型｜${destination==='display'?'仅显示：隐藏更新标签':'仅提示词：过滤历史更新标签'}（保留正文）`,enabled:true,find_regex:`/${TAG_PATTERN}/g`,replace_string:'',trim_strings:[],source:{user_input:false,ai_output:true,slash_command:false,world_info:false,reasoning:false},destination:{display:destination==='display',prompt:destination==='prompt'},run_on_edit:true,min_depth:null,max_depth:null})),
    ],{type:'character'});
  }
  button('保存 HTML 并启用本聊天',panel,async()=>{
    const original=identity(),entry=selectedEntry(),book=books.value;
    if(!entry?.content?.trim())throw new Error('请先选中状态栏条目');
    if(!ctx().getCurrentChatId()||!messages().length)throw new Error('请先打开角色聊天');
    if(ctx().chatMetadata?.wishnote_v1?.enabled||ctx().chatMetadata?.lorestate_v1?.enabled)throw new Error('本聊天启用了旧扩展状态，请先停用旧版或使用新测试聊天');
    const schema=templateSchema(html.value,entry.content),previous=settings();
    if(previous.ready&&previous.schema&&!sameSchema(schema,previous.schema))throw new Error('已有配置不支持改变栏目，以免影响其他聊天。新栏目请使用独立角色脚本。');
    const activePresetId=previous.activePresetId??'default';
    const activeName=listPresets(previous).find(p=>p.id===activePresetId)?.name??'默认样式';
    const config=savePreset({...previous,version:4,ready:true,book,uid:entry.uid,entryName:entry.name,html:html.value,schema,activePresetId},activeName,html.value,activePresetId);
    updateVariablesWith(v=>({...v,[PROTO_KEY]:config}),{type:'script'});
    const old=chatSettings();updateVariablesWith(v=>({...v,[PROTO_KEY]:{...old,enabled:true,start:old.start??(previous.ready?1:Math.max(1,messages().length))}}),{type:'chat'});
    // Separate display and prompt copy filters; neither edits the source message.
    await installRegex();if(!matches(original))return;
    if(!isCharacterTavernRegexesEnabled())report('已保存，但本卡局部正则未启用。请启用局部正则后生成，否则历史标签仍会进入上下文。');
    else report('已保存到随卡脚本，并安装本卡标签过滤正则。首次 AI 回复需完整状态，之后只写变化。');
    renderKey='';await refresh();
  });
  button('查看下一轮状态提示',panel,async()=>{
    const config=settings(),source=await getWorldbook(config.book),entry=source.find(e=>e.uid===config.uid);
    if(!entry)throw new Error('保存的世界书关联已失效，请重新选择');
    maker.value=playPrompt(entry.content,schemaFor(config),getResult(config),doc.getElementById('send_textarea')?.value??'');report('此处仅预览提示，没有调用模型。');
  });
  button('暂停本聊天',panel,async()=>{
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...chatSettings(),enabled:false}}),{type:'chat'});uninject?.();uninject=null;stateWindow.close();view?.remove();report('已暂停；数据和 HTML 保留，标签过滤正则保留。');
  });
  button('重新读取当前聊天状态',panel,async()=>{renderKey='';await refresh();const result=getResult();report(result.errors.length?`重新校验后仍有 ${result.errors.length} 轮失败，请打开状态管理器。`:'全部参与回放的楼层已通过校验。');});
  const authorHelp=node('p','可选：作者初始档案让首轮直接从确定事实增量更新；字段规则只做文字约束。保存的默认值用于新聊天，已有聊天保留自己的配置。');authorHelp.className='ls-note';
  const initialLabel=node('label','初始档案（完整 LoreState v3 标签；留空则首轮生成）'),initialEditor=node('textarea',undefined,initialLabel);initialEditor.rows=6;initialEditor.setAttribute('aria-label','作者初始档案');initialEditor.value=settings().authorPolicy?.initial??'';
  const constraintLabel=node('label','字段规则（JSON；可留空）'),constraintEditor=node('textarea',undefined,constraintLabel);constraintEditor.rows=5;constraintEditor.setAttribute('aria-label','字段约束');constraintEditor.value=JSON.stringify(settings().authorPolicy?.constraints??{},null,2);constraintEditor.placeholder='{"shared":{"地点":{"required":true}},"entity":{}}';
  const policyPreview=node('pre','尚未预览');policyPreview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto';let policyDraft=null;
  button('生成初始档案模板',panel,()=>{
    const schema=settings().schema;if(!schema)throw new Error('请先保存 HTML 栏目配置');
    initialEditor.value='<LoreState version="3" mode="full">'+(schema.shared.length?'\n<Shared>\n'+schema.shared.map(f=>`<${f}>未知</${f}>`).join('\n')+'\n</Shared>':'')+'\n</LoreState>';policyDraft=null;
  });
  button('预览作者配置',panel,()=>{
    if(constraintEditor.value.length>20000)throw new Error('字段规则最多 20000 字符');
    const schema=settings().schema,policy=authorPolicy(schema,initialEditor.value,JSON.parse(constraintEditor.value.trim()||'{}'));
    const result=initialResult({...schema,...policy});playPrompt('',{...schema,...policy},result);
    policyDraft={policy,schema:JSON.stringify(schema),initial:initialEditor.value,constraints:constraintEditor.value};
    policyPreview.textContent='校验通过，尚未保存。\n'+JSON.stringify({constraints:policy.constraints??{},initialState:result.state},null,2);
  });
  function checkedPolicy(){
    if(hostGenerating())throw new Error('请等待生成结束后修改作者配置');
    if(!policyDraft||policyDraft.schema!==JSON.stringify(settings().schema)||policyDraft.initial!==initialEditor.value||policyDraft.constraints!==constraintEditor.value)throw new Error('配置已变化，请重新预览');
    return structuredClone(policyDraft.policy);
  }
  button('保存为新聊天默认配置',panel,()=>{const policy=checkedPolicy();freezePolicy();writeConfig({...settings(),authorPolicy:policy});report('已保存新聊天默认配置；当前聊天保持原配置。');});
  button('应用到尚未开始的本聊天',panel,async()=>{
    const policy=checkedPolicy(),saved=chatSettings();
    if(!active(settings()))throw new Error('请先启用本聊天');
    if(saved.checkpoint||readSnapshots(saved).length||messages().some(m=>m.message_id>=(saved.start??1)&&m.role==='assistant'))throw new Error('本聊天已有状态历史，请使用新聊天，避免重解释已有剧情');
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],policy}}),{type:'chat'});renderKey='';capturedKey='';await refresh();report('作者配置已用于本聊天，首轮将按初始档案更新。');
  });
  async function loadSettings(){try{syncPresets();await loadBooks();}catch(e){fault(e,'设置读取失败');}}
  async function open(){if(!settings().ready){center.open('settings');await loadSettings();}else openManager();}
  const a=title=>actions.get(title);
  function cancelExtraUpdate(){
    autoUpdate=null;clearTimeout(autoTimer);autoTimer=null;
    if(extraJob)extraJob.cancel();
  }
  const apiUi=createApiPanel({doc,read:apiSettings,
    listRequestPresets:requestPresets,fetchModels:params=>{if(typeof getModelList!=='function')throw new Error('当前酒馆助手缺少模型列表接口');return getModelList(params);},
    write:config=>{cancelExtraUpdate();updateVariablesWith(v=>({...v,[API_PROFILE_KEY]:config}),{type:'global'});},
    binding:updateBinding,setBinding:value=>{if(!active(settings()))throw new Error('请先配置并启用本聊天');cancelExtraUpdate();updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],variableUpdate:value}}),{type:'chat'});},
    run:()=>{if(updateBinding().mode==='inline'&&splitTruncatedUpdate(messages().at(-1)?.message)){return previewTruncatedTail(messages().at(-1)?.message_id);}return runExtraUpdate();},cancel:()=>{const committed=extraJob?.committed;cancelExtraUpdate();apiUi.report(committed?'状态已经写入，如需恢复请撤销最近一次更新。':'状态更新已取消，原消息保留。');},undo:undoExtraUpdate,onError:e=>fault(e,'状态更新操作失败'),
    readDiagnostics:()=>extraDiagnostics,clearDiagnostics:()=>{extraDiagnostics=[];}});
  const ruleDisclosure=node('details');node('summary','查看条目原文',ruleDisclosure);ruleDisclosure.append(rules);
  const makerDisclosure=node('details');node('summary','制作提示词与下一轮提示预览',makerDisclosure);makerDisclosure.append(a('生成并复制 HTML 制作提示词'),a('查看下一轮状态提示'),maker);
  const center=createControlCenter({doc,manager,panel,summary,status,floorSelect,details,diagnostics,repairBox,tailPreview,snapshotPanel,apiPanel:apiUi.panel,loadApi:apiUi.sync,actions,loadSettings,settingsGroups:[
    {title:'世界书与规则',hint:'选择随卡世界书里的状态栏条目；它决定 LoreState 记录哪些栏目。',items:[bookLabel,entryLabel,[a('刷新世界书列表')],ruleDisclosure]},
    {title:'外观模板',hint:'粘贴网页 AI 生成的 HTML，预览确认后保存并启用本聊天。',items:[htmlLabel,[a('预览 HTML（不保存）'),a('保存 HTML 并启用本聊天')],preview,makerDisclosure]},
    {title:'外观预设',hint:'同一套栏目可以保存多份外观，随角色卡保存，随时切换。',items:[presetLabel,nameLabel,[a('应用所选预设'),a('另存为新预设'),a('覆盖所选预设'),a('删除所选预设')]]},
    {title:'初始档案与字段约束',hint:'可选：给新聊天一份确定的初始状态，并用文字规则约束字段。',items:[authorHelp,initialLabel,[a('生成初始档案模板')],constraintLabel,[a('预览作者配置')],policyPreview,[a('保存为新聊天默认配置'),a('应用到尚未开始的本聊天')]]},
    {title:'聊天维护',hint:'重新计算本聊天状态，或暂停本聊天的状态更新。',items:[[a('重新读取当前聊天状态'),a('暂停本聊天')]]},
  ]});
  const menu=node('div');menu.className='extension_container';
  const opener=button('LoreState',menu,open);opener.className='list-group-item';opener.style.cssText='background:transparent;color:inherit;border:0;text-align:left;width:100%;font:inherit';
  const mount=()=>{const target=doc.getElementById('extensionsMenu');if(target){target.append(menu);menuObserver?.disconnect();}};
  menuObserver=new MutationObserver(mount);menuObserver.observe(doc.body,{childList:true,subtree:true});mount();
  const active=config=>config.ready&&!!ctx().getCurrentChatId()&&chatSettings().enabled!==false;
  function expectedViewParent(last){
    const message=last&&doc.querySelector(`#chat .mes[mesid="${last.message_id}"]`);
    return message&&(message.querySelector('.mes_block')||message);
  }
  function viewIsIntact(last,result){
    if(!view?.isConnected||view.parentElement!==expectedViewParent(last))return false;
    if(!result.state)return true;
    const frame=view.querySelector('iframe.lorestate-state-frame');
    return !!frame?.isConnected;
  }
  function startChatObserver(){
    const chat=doc.getElementById('chat');if(!chat||chatObserver)return;
    chatObserver=new MutationObserver(()=>{
      if(closed||chatRepairTimer)return;
      chatRepairTimer=setTimeout(()=>{
        chatRepairTimer=null;if(closed)return;
        try{
          if(hostGenerating())return;
          const config=settings();if(!active(config))return;
          const list=messages(),last=list.findLast(m=>m.role==='assistant');if(!last)return;
          const result=getResult(config,list);
          if(!viewIsIntact(last,result)){view?.remove();view=null;renderKey='';schedule();}
        }catch(e){fault(e,'状态栏恢复失败');}
      },50);
    });
    chatObserver.observe(chat,{childList:true,subtree:true});
  }
  function paint(result,list){
    const last=list.findLast(m=>m.role==='assistant');if(!last)return;
    const message=doc.querySelector(`#chat .mes[mesid="${last.message_id}"]`);if(!message)return;
    const config=settings(),key=JSON.stringify([last.message_id,result.state,result.errors,config.html,chatSettings().checkpoint?.id]);
    if(viewIsIntact(last,result)&&renderKey===key)return;
    view?.remove();view=node('section',undefined,message.querySelector('.mes_block')||message);view.className='lorestate-prototype-view';view.style.cssText='display:block;position:relative;width:100%;max-width:100%;min-width:0;box-sizing:border-box;flex:1 0 100%;grid-column:1 / -1;clear:both;margin:12px 0;padding:12px 0;border-top:1px solid #778063';
    node('small',result.errors.length?`状态存在缺口：${result.errors.length} 轮失败，最早第 ${result.errors[0].floor} 楼；最后连续正常楼层 ${result.lastGoodFloor??'尚无'}。后续有效更新已应用，需核对剧情。`:result.state?'LoreState · 当前状态':'LoreState · 等待首次完整状态',view);
    if(chatSettings().checkpoint)node('p',`状态已回档至第 ${chatSettings().checkpoint.floor} 楼快照；旧正文保留。`,view);
    button('查看历史与诊断',view,()=>openManager(result.errors[0]?.floor));
    if(result.state){
      const source=renderTemplate(config.html,result.state);
      const expand=button('展开状态窗口',view,()=>stateWindow.open(source));expand.style.cssText='display:inline-block;min-height:44px;margin:8px 8px 12px 0;padding:8px 12px;cursor:pointer';
      const frame=createStateFrame(doc,'LoreState 当前状态');frame.srcdoc=source;view.append(frame);stateWindow.update(source);
      const cold=Object.values(result.state.entities).filter(p=>p.presence==='cold');
      if(cold.length){const archive=node('details',undefined,view);node('summary',`本地冷档 · ${cold.length} 个实体`,archive);
        for(const p of cold){const item=node('details',undefined,archive);node('summary',`${p.type} · ${p.name} · ${p.id} · ${p.identity} · 最后确认：${p.confirmed??'剧情时间未知'} · 更新楼层：${p.confirmedFloor??'未知'}`,item);
          let loaded=false;item.ontoggle=()=>{if(item.open&&!loaded){for(const f of entityFields(schemaFor(config),p.type)){node('h4',f,item);const text=node('p',p.fields[f]??'尚未记录',item);text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';}loaded=true;}};
        }
      }
    }
    if(result.errors.length)button('重新读取状态',view,()=>refresh());renderKey=key;
  }
  async function refresh(){
    if(hostGenerating()||autoUpdate||autoTimer||(extraJob&&!extraJob.committed))return;
    await settleContinuation();
    const config=settings();if(!active(config)){view?.remove();return;}freezePolicy();
    const id=identity(),list=messages(),schema=schemaFor(config),result=getResult(config,list);
    if(!matches(id))return;
    const old=chatSettings(),start=old.start??1,signature=historyIdentity(list),checkpoint=JSON.stringify(old.checkpoint??null);
    const schemaKey=snapshotSchema(schema,start),captureKey=JSON.stringify([ctx().getCurrentChatId(),signature,schemaKey,checkpoint]);
    const snapshots=capturedKey===captureKey?readSnapshots(old):await collectSnapshots(list,schema,start,old.checkpoint,readSnapshots(old));
    const packed=capturedKey===captureKey&&old.snapshotStore?old.snapshotStore:await packSnapshots(snapshots,old.snapshotStore??emptySnapshotStore());
    if(!matches(id)||hostGenerating()||historyIdentity(messages())!==signature||snapshotSchema(schemaFor(),chatSettings().start??1)!==schemaKey||JSON.stringify(chatSettings().checkpoint??null)!==checkpoint)return;
    const record={...result,lastFloor:list.at(-1)?.message_id??-1};
    updateVariablesWith(v=>{
      const current=v[PROTO_KEY]??{},store=current.snapshotStore??emptySnapshotStore(),merged=new Map(store.snapshots.map(s=>[s.id,s]));
      for(const snap of packed.snapshots)merged.set(snap.id,snap);
      const next={...current,current:record,snapshotStore:{...packed,states:{...packed.states,...store.states},schemas:{...packed.schemas,...store.schemas},receipts:{...packed.receipts,...store.receipts},snapshots:[...merged.values()]}};
      delete next.snapshots;return {...v,[PROTO_KEY]:next};
    },{type:'chat'});
    capturedKey=captureKey;
    paint(result,list);
    const key=JSON.stringify(result.errors);
    if(result.errors.length&&key!==noticeKey){noticeText.textContent=`LoreState：${result.errors.length} 轮状态更新失败\n${errorText(result.errors[0])}\n最后连续正常楼层：${result.lastGoodFloor??'尚无'}。`;notice.hidden=false;}
    if(!result.errors.length&&noticeKey){notice.hidden=true;}
    noticeKey=result.errors.length?key:'';
  }
  let generating=false;
  // Tavern Helper reads SillyTavern's live is_send_press flag. Event pairs are
  // still kept as a compatibility fallback, but can be unbalanced by host-side
  // slash commands and message edits.
  const hostGenerating=()=>window.parent.TavernHelper?.builtin?.duringGenerating?.()??generating;
  async function settleContinuation(){
    if(continuationWork)return continuationWork;
    const saved=chatSettings(),plan=saved.continuationPending;if(!plan)return;
    const id=identity(),epoch=chatEpoch;
    continuationWork=(async()=>{
      const list=messages(),last=list.at(-1),schema=schemaFor();
      if(last?.message_id!==plan.floor||last.swipe_id!==plan.swipe||historyIdentity(list.slice(0,-1))!==plan.prefix||JSON.stringify(schema)!==plan.schema||JSON.stringify(saved.checkpoint??null)!==plan.checkpoint)throw new Error('续写期间历史、分支或配置变化，请恢复原分支后重试');
      const previous=replaySnapshots(list.slice(0,-1),schema,saved.start??1,saved.checkpoint);
      const receipt=readReceipt(`<LoreState read="${plan.token}">`,saved.snapshotStore);
      const updated=plan.normalized===last.message?last.message:settleContinuedMessage(plan.original,last.message,plan.mode,previous.state,schema,last.message_id,receipt);
      if(!matches(id)||epoch!==chatEpoch||hostGenerating())return;
      if(updated!==last.message){
        // A reload between the message write and metadata cleanup must recognize its own committed result.
        updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],continuationPending:{...plan,normalized:updated}}}),{type:'chat'});
        await setChatMessages([{message_id:last.message_id,message:updated}],{refresh:'affected'});
      }
      if(!matches(id)||epoch!==chatEpoch)return;
      updateVariablesWith(v=>{const next={...v[PROTO_KEY]};delete next.continuationPending;return {...v,[PROTO_KEY]:next};},{type:'chat'});
    })();
    try{await continuationWork;}finally{continuationWork=null;}
  }
  async function runExtraUpdate({repair=updateBinding().mode==='inline',floor,tailPlan}={}){
    if(tailPlan&&(!repair||!tailCurrent(tailPlan)))throw new Error('截断预览已失效，请重新预览');
    if(extraJob)throw new Error('状态更新正在进行，请等待或取消');
    if(hostGenerating())throw new Error('请等待正文生成结束');
    generating=false; // Live helper readiness supersedes a stale core preview event.
    if(!repair)await settleContinuation();
    if(extraJob||hostGenerating())throw new Error('已有生成或状态更新正在进行，请稍后重试');
    const config=settings(),saved=chatSettings(),binding=updateBinding();
    if(!active(config))throw new Error('请先配置并启用本聊天');
    if(binding.mode!==(repair?'inline':'extra'))throw new Error('状态更新方式已变化，请重新打开对应入口');
    if(typeof generateRaw!=='function'||typeof stopGenerationById!=='function'||typeof setChatMessages!=='function')throw new Error('需要酒馆助手的独立生成、取消与消息写入接口');
    checkRequestPreset(binding);
    const profile=selectedStateModel(binding),id=identity(),epoch=chatEpoch,list=messages(),last=list.at(-1);
    if(!last||last.role!=='assistant'||last.message_id<(saved.start??1))throw new Error('请在最新一条 AI 回复后更新状态');
    if(saved.checkpoint&&last.message_id<=saved.checkpoint.cutoff)throw new Error('这条回复属于回档前保留的正文，请先发送新一轮，再更新新回复状态');
    if(repair){
      if(floor!==undefined&&floor!==last.message_id)throw new Error('仅支持重新计算最新 AI 回复；历史楼层请手动编辑原文');
      const result=getResult(config,list);
      if(!result.errors.some(error=>error.floor===last.message_id))throw new Error('最新回复状态已通过校验，无需修复');
    }
    const replacementSource=tailPlan?tailPlan.story:last.message;
    const story=variableStory(replacementSource);if(!story.trim())throw new Error('最新 AI 回复没有剧情正文，无法重新判断状态');
    const schema=schemaFor(config),previous=getResult(config,list.slice(0,-1));
    if(previous.errors.length)throw new Error(`此前第 ${previous.errors[0].floor} 楼存在状态缺口，请先手动修复历史再更新最新回复`);
    const history=historyIdentity(list),schemaKey=JSON.stringify(schema),configKey=JSON.stringify(config),bindingKey=JSON.stringify(binding),profileKey=JSON.stringify(profile),requestContextKey=requestContextIdentity(binding);
    const token=crypto.randomUUID();let generationId=crypto.randomUUID();
    let rejectCancel,timer;
    const cancelled=new Promise((_,reject)=>{rejectCancel=reject;});
    const job={cancelled:false,committed:false,cancel(){if(job.cancelled||job.committed)return;job.cancelled=true;try{stopGenerationById(generationId);}catch{}rejectCancel(new Error('状态更新已取消或超时，原消息保留'));}};
    extraJob=job;autoUpdate=null;
    const current=()=>matches(id)&&chatEpoch===epoch&&!job.cancelled;
    const assertCurrent=()=>{
      if(!current()||hostGenerating()||!active(settings())||historyIdentity(messages())!==history||JSON.stringify(schemaFor())!==schemaKey||JSON.stringify(settings())!==configKey||JSON.stringify(updateBinding())!==bindingKey||JSON.stringify(chatSettings().checkpoint??null)!==JSON.stringify(saved.checkpoint??null)||(chatSettings().start??1)!==(saved.start??1)||JSON.stringify(selectedStateModel(binding))!==profileKey)throw new Error('聊天、回复分支或配置已变化，状态结果未写入');
      checkRequestPreset(binding);
      if(requestContextIdentity(binding)!==requestContextKey)throw new Error('酒馆预设或当前连接已变化，状态结果未写入');
    };
    apiUi.report(`正在使用“${profile?.name??'酒馆当前连接'}”更新第 ${last.message_id} 楼状态…`);
    timer=setTimeout(job.cancel,binding.timeoutSeconds*1000);
    try{
      await Promise.race([cancelled,(async()=>{
        const source=await getWorldbook(config.book);assertCurrent();
        const entry=source.find(e=>e.uid===config.uid);if(!entry)throw new Error('世界书关联失效，请重新选择');
        const user=list.slice(0,-1).findLast(m=>m.role==='user')?.message??'';
        const {content,readIds}=preparePrompt(entry.content,schema,previous,user+'\n'+story,token);
        const store=saved.snapshotStore??await packSnapshots(readSnapshots(saved));assertCurrent();
        const prepared=await addReadReceipt(store,token,previous.state,schema,readIds);assertCurrent();
        const narrative='本轮用户输入：\n'+variableStory(user)+'\n\n本轮已经发生的 AI 剧情（只据此更新，不续写）：\n'+story;
        if(narrative.length+content.length>96000)throw new Error('本轮更新资料超过 96000 字符，请缩短正文后重试；未截断剧情');
        // Helper 4.9.5 emits the core AFTER_COMMANDS hook even for generateRaw.
        // Remove our narration injection before that request builds its prompts.
        const cleanup=uninject;uninject=null;cleanup?.();assertCurrent();
        const receipt=readReceipt(`<LoreState read="${token}">`,prepared);
        let updated;
        for(let attempt=1;attempt<=binding.attempts;attempt++){
          assertCurrent();generationId=crypto.randomUUID();
          apiUi.report(`第 ${last.message_id} 楼状态更新：第 ${attempt}/${binding.attempts} 次请求…`);
          const diagnostic=beginExtraDiagnostic(attempt,binding.attempts,binding.presetMode==='builtin'?'generateRaw':'generate');apiUi.refreshDiagnostics();
          let output,failure;
          try{
            const request=extraModelRequest(profile,content,narrative,generationId,binding);
            output=await (binding.presetMode==='builtin'?generateRaw(request):generate(request));
            const savedOutput=diagnosticText(output);Object.assign(diagnostic,{status:'returned-awaiting-validation',output:savedOutput.text,truncated:savedOutput.truncated});
          }catch(error){failure='状态 API 请求失败，请检查连接配置和网络';Object.assign(diagnostic,{status:'request-error',requestError:safeDiagnosticError(error,[profile?.key])});}
          assertCurrent();
          if(!failure){try{updated=validateExtraUpdate(output,replacementSource,previous.state,schema,last.message_id,receipt);diagnostic.status='validated-success';}catch(error){failure='状态模型输出未通过协议、栏目或读取凭据校验';Object.assign(diagnostic,{status:'validation-failed',localError:safeDiagnosticError(error)});}}
          apiUi.refreshDiagnostics();
          if(!failure)break;
          if(attempt===binding.attempts)throw new Error(`${failure}；已尝试 ${attempt} 次，原消息保留`);
        }
        assertCurrent();
        // Re-read rules too: an edited worldbook must not commit an outdated request.
        const latestSource=await getWorldbook(config.book);assertCurrent();
        if(latestSource.find(e=>e.uid===config.uid)?.content!==entry.content)throw new Error('状态规则已变化，请重新更新');
        assertCurrent();
        // Persist the receipt before the message; an interrupted write leaves only an unused receipt and a recovery backup.
        updateVariablesWith(v=>{const current=v[PROTO_KEY]??{},latest=current.snapshotStore??store;return {...v,[PROTO_KEY]:{...current,snapshotStore:{...latest,states:{...latest.states,...prepared.states},schemas:{...latest.schemas,...prepared.schemas},receipts:{...latest.receipts,[token]:prepared.receipts[token]}},variableUpdateBackup:{floor:last.message_id,swipe:last.swipe_id,original:last.message,updated}}};},{type:'chat'});
        assertCurrent();
        await setChatMessages([{message_id:last.message_id,message:updated}],{refresh:'affected'});
        job.committed=true;
        clearTimeout(timer);
        if(!current())return;
        renderKey='';await refresh();if(!current())return;
        syncFloors(last.message_id);apiUi.report(`第 ${last.message_id} 楼状态已更新，正文保留。可撤销最近一次更新。`);
      })()]);
    }catch(e){if(matches(id)&&chatEpoch===epoch){apiUi.report(e.message);throw e;}}
    finally{clearTimeout(timer);if(extraJob===job)extraJob=null;if(matches(id)&&chatEpoch===epoch)schedule();}
  }
  async function undoExtraUpdate(){
    if(extraJob||hostGenerating())throw new Error('请等待生成结束或取消状态更新');
    const saved=chatSettings(),backup=saved.variableUpdateBackup,last=messages().at(-1),id=identity(),epoch=chatEpoch;
    if(saved.checkpoint&&backup?.floor<=saved.checkpoint.cutoff)throw new Error('不能改写回档前保留的正文');
    if(!backup)throw new Error('没有可撤销的状态更新');
    if(last?.message_id!==backup.floor||last.swipe_id!==backup.swipe||last.message!==backup.updated)throw new Error('目标回复或后续历史已变化，不能撤销覆盖');
    await setChatMessages([{message_id:backup.floor,message:backup.original}],{refresh:'affected'});
    if(!matches(id)||epoch!==chatEpoch)return;
    updateVariablesWith(v=>{const next={...v[PROTO_KEY]};delete next.variableUpdateBackup;return {...v,[PROTO_KEY]:next};},{type:'chat'});
    renderKey='';await refresh();syncFloors(backup.floor);apiUi.report('已撤销最近一次状态更新。');
  }
  function finishAutoUpdate(){
    const planned=autoUpdate;if(!planned)return;autoUpdate=null;
    const wait=attempt=>{
      autoTimer=null;
      if(!matches(planned.id)||chatEpoch!==planned.epoch||closed)return;
      if(hostGenerating()){if(attempt<100)autoTimer=setTimeout(()=>wait(attempt+1),50);else apiUi.report('正文生成尚未结束，请稍后手动更新状态。');return;}
      if(historyIdentity(messages())===planned.history)return;
      const last=messages().at(-1);
      if(!last||last.role!=='assistant'||(!['swipe','regenerate','continue'].includes(planned.type)&&last.message_id<=planned.lastFloor))return;
      runExtraUpdate({repair:false}).catch(e=>{if(matches(planned.id)&&chatEpoch===planned.epoch){fault(e,'自动状态更新失败');schedule();}});
    };
    autoTimer=setTimeout(()=>wait(0),0);
  }
  function schedule(){
    if(pending||closed||hostGenerating())return;pending=true;const id=identity();
    queue=queue.then(async()=>{pending=false;if(!matches(id)){if(!closed)schedule();return;}if(!hostGenerating()){await refresh();if(manager.open)syncFloors();}}).catch(e=>fault(e,'状态刷新失败'));
  }
  async function beforeGenerate(type,_options,dryRun){
    if(closed)return;
    // Core generation emits GENERATION_STARTED first; silent Helper generation does not.
    // Do not recursively prepare narration or stop the core controller for our own request.
    if(extraJob&&!generating&&!hostGenerating())return;
    const config=settings(),id=identity(),prepare=!dryRun&&active(config)&&!['quiet','impersonate'].includes(type);
    try{
      const cleanup=uninject;uninject=null;cleanup?.();
      if(!prepare)return;
      if(extraJob||autoTimer)throw new Error('状态更新正在进行，请等待完成或取消后再生成正文');
      autoUpdate=null;
      if(chatSettings().continuationPending)throw new Error('上次续写尚未整理完成，请先重新读取当前聊天状态');
      const continuing=type==='continue',target=messages().at(-1);
      if(continuing){
        if(!target||target.role!=='assistant'||target.message_id<(chatSettings().start??1))throw new Error('只能续写已参与状态更新的最新 AI 回复');
        if(typeof setChatMessages!=='function')throw new Error('续写需要酒馆助手的消息写入接口');
        variableStory(target.message);
      }
      if(['continue','swipe','regenerate'].includes(type)&&chatSettings().checkpoint&&target?.message_id<=chatSettings().checkpoint.cutoff)throw new Error('不能改写回档前保留的正文，请发送新一轮继续');
      freezePolicy();
      const source=await getWorldbook(config.book);if(!matches(id))return;
      const entry=source.find(e=>e.uid===config.uid);
      if(!entry)throw new Error('世界书关联失效，请在原型设置中重新选择');
      let list=messages();if(['swipe','regenerate','continue'].includes(type)&&list.at(-1)?.role==='assistant')list=list.slice(0,-1);
      const result=getResult(config,list);
      const userText=type==='swipe'||type==='regenerate'?list.findLast(m=>m.role==='user')?.message??'':doc.getElementById('send_textarea')?.value||list.findLast(m=>m.role==='user')?.message||'';
      const schema=schemaFor(config),history=historyIdentity(messages()),token=crypto.randomUUID();
      const extra=updateBinding().mode==='extra';
      if(extra){
        selectedStateModel(updateBinding());checkRequestPreset(updateBinding());
        if(typeof generateRaw!=='function'||typeof stopGenerationById!=='function')throw new Error('当前酒馆助手缺少独立生成或取消接口');
        if(result.errors.length)throw new Error('此前状态更新未完成，请先重新更新或修复历史');
      }
      const {content:baseContent,readIds}=preparePrompt(entry.content,schema,result,userText+(continuing?'\n'+variableStory(target.message):''),extra?'':token,extra?'narration':'combined');
      const content=baseContent+(continuing?'\n本次续写同一条 AI 回复。以上状态是该回复开始前的状态。继续原剧情；'+(extra?'不要输出状态块。':'末尾输出一个替代旧块的新状态块，覆盖原回复与本次新增剧情的全部变化；忽略旧块的读取凭据，使用本次指定凭据。'):'');
      const old=chatSettings(),store=old.snapshotStore??await packSnapshots(readSnapshots(old));
      const prepared=await addReadReceipt(store,token,result.state,schema,readIds);
      if(!matches(id))return;
      if(!active(settings())||historyIdentity(messages())!==history||JSON.stringify(schemaFor())!==JSON.stringify(schema)||JSON.stringify(chatSettings().checkpoint??null)!==JSON.stringify(old.checkpoint??null))throw new Error('生成准备期间历史、回档或配置变化，请重试');
      uninject=injectPrompts([{id:PROTO_KEY,position:'in_chat',depth:0,role:'system',content,should_scan:false}]).uninject;
      updateVariablesWith(v=>{
        const current=v[PROTO_KEY]??{},latest=current.snapshotStore??store;
        return {...v,[PROTO_KEY]:{...current,...(continuing?{continuationPending:{floor:target.message_id,swipe:target.swipe_id,original:target.message,prefix:historyIdentity(list),schema:JSON.stringify(schema),checkpoint:JSON.stringify(old.checkpoint??null),token,mode:extra?'extra':'inline'}}:{}),snapshotStore:{...latest,states:{...latest.states,...prepared.states},schemas:{...latest.schemas,...prepared.schemas},receipts:{...latest.receipts,[token]:prepared.receipts[token]}}}};
      },{type:'chat'});
      autoUpdate=extra&&updateBinding().auto?{id,epoch:chatEpoch,history,type,lastFloor:messages().at(-1)?.message_id??-1}:null;
    }catch(e){
      // ST catches event-listener errors; throwing here alone cannot cancel a request.
      // A rejected read from a previous chat must not stop the current chat's generation.
      if(!matches(id))return;
      if(!prepare){fault(e,'状态提示清理失败');return;}
      autoUpdate=null;
      try{const cleanup=uninject;uninject=null;cleanup?.();}catch(cleanupError){console.warn('[LoreState] 提示清理失败',String(cleanupError?.message??cleanupError));}
      let stopped=false;
      try{stopped=ctx().stopGeneration();}catch(stopError){console.warn('[LoreState] 无法停止生成',String(stopError?.message??stopError));}
      fault(e,stopped?'本轮生成已停止，状态提示未注入':'状态提示未注入，请立即手动停止生成');
    }
  }
  for(const event of ['MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','GENERATION_ENDED','MORE_MESSAGES_LOADED'])if(tavern_events[event])eventOn(tavern_events[event],schedule);
  if(tavern_events.GENERATION_STARTED)eventOn(tavern_events.GENERATION_STARTED,()=>{generating=true;});
  for(const event of ['GENERATION_ENDED','GENERATION_STOPPED'])if(tavern_events[event])eventOn(tavern_events[event],()=>{generating=false;if(event==='GENERATION_ENDED')finishAutoUpdate();else{autoUpdate=null;clearTimeout(autoTimer);autoTimer=null;}schedule();});
  runtimeRegistration={dispose};window.parent[runtimeSlot]=runtimeRegistration;startChatObserver();
  eventOn(tavern_events.CHAT_CHANGED,newChatId=>{
    if(shouldReloadForChatChange(loadedChatId,newChatId)){dispose();window.location.reload();return;}
    chatEpoch++;clearTailPreview();cancelExtraUpdate();extraDiagnostics=[];apiUi.clear();uninject?.();uninject=null;stateWindow.close();view?.remove();renderKey='';noticeKey='';notice.hidden=true;runtimeLogs=[];restoreDraft=null;capturedKey='';snapshotPreview.textContent='';report('设置随角色保存；修改后请预览并保存。');manager.close();generating=false;schedule();
  });
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS,beforeGenerate);
  eventOn(getButtonEvent('LoreState 设置'),()=>open().catch(e=>fault(e,'设置打开失败')));
  function dispose(){
    if(closed)return;
    closed=true;cancelExtraUpdate();apiUi.clear();menuObserver?.disconnect();chatObserver?.disconnect();chatObserver=null;if(chatRepairTimer){clearTimeout(chatRepairTimer);chatRepairTimer=null;}floorLayout.remove();stateWindow.dispose();menu.remove();panel.remove();manager.remove();notice.remove();view?.remove();
    const cleanup=uninject;uninject=null;cleanup?.();
    if(runtimeRegistration&&window.parent[runtimeSlot]===runtimeRegistration)delete window.parent[runtimeSlot];
  }
  window.addEventListener('pagehide',dispose,{once:true});schedule();
}
