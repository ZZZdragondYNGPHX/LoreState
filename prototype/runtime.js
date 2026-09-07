import { PROTO_KEY, TAG_PATTERN, replayState, playPrompt, authorPrompt, inspectFloor, proposeRepair } from './core.js';
import { inspectTemplate, renderTemplate } from './template.js';
import { listPresets, sameSchema, savePreset, deletePreset } from './presets.js';

// Runs inside the owning Tavern Helper character script, including remote imports.
export function startPrototype(defaultHtml) {
  const doc=window.parent.document,ctx=()=>window.parent.SillyTavern.getContext();
  if(doc.getElementById('lorestate-prototype-settings'))throw new Error('已有 LoreState 原型脚本运行，请勿重复启用');
  const settings=()=>getVariables({type:'script'})[PROTO_KEY]??{};
  const chatSettings=()=>getVariables({type:'chat'})[PROTO_KEY]??{};
  const messages=()=>getChatMessages('0-{{lastMessageId}}');
  const identity=()=>[ctx().chat,ctx().getCurrentChatId()];
  const matches=([chat,id])=>!closed&&ctx().chat===chat&&ctx().getCurrentChatId()===id;
  let closed=false,queue=Promise.resolve(),pending=false,uninject=null,view=null,renderKey='',menuObserver;
  const node=(tag,text,parent)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;parent?.append(el);return el;};
  const panel=node('dialog',undefined,doc.body);panel.id='lorestate-prototype-settings';panel.setAttribute('aria-label','LoreState 原型设置');
  panel.style.cssText='width:min(800px,94vw);max-height:88vh;overflow:auto;background:#252723;color:#eee8dc;border:1px solid #858b6c;border-radius:12px;padding:20px';
  const style=node('style',undefined,panel);style.textContent='#lorestate-prototype-settings button,#lorestate-prototype-settings select{font:inherit;margin:6px;padding:7px;background:#3a4033;color:#eee;border:1px solid #7b8765;border-radius:5px}#lorestate-prototype-settings textarea{display:block;width:100%;box-sizing:border-box;min-height:110px;background:#191d18;color:#eee;margin:8px 0}#lorestate-prototype-settings label{display:block;margin-top:12px}';
  node('h2','LoreState · 文字状态原型',panel);
  const status=node('p','选择状态栏条目，再粘贴 HTML。保存后在下一次 AI 回复建立状态。',panel);status.setAttribute('role','status');
  const report=text=>{status.textContent=text;};
  const button=(title,parent,fn)=>{const el=node('button',title,parent);el.type='button';el.onclick=async()=>{el.disabled=true;try{await fn();}catch(e){fault(e,'操作失败');}finally{el.disabled=false;}};return el;};
  const notice=node('aside',undefined,doc.body);notice.hidden=true;notice.setAttribute('role','alert');
  notice.style.cssText='position:fixed;right:12px;top:12px;z-index:100000;max-width:min(440px,92vw);padding:16px;background:#382621;color:#fff;border:2px solid #efb06a;border-radius:8px;white-space:pre-wrap';
  const noticeText=node('p','',notice);
  button('查看诊断',notice,()=>openManager(getResult().errors[0]?.floor));button('关闭提醒',notice,()=>{notice.hidden=true;});
  let noticeKey='',runtimeLogs=[],draft=null;
  function fault(error,stage){
    const message=String(error?.message??error).slice(0,500);
    const entry={time:new Date().toISOString(),stage,message};
    runtimeLogs.push(entry);runtimeLogs=runtimeLogs.slice(-30);
    report(`${stage}：${message}`);noticeText.textContent=`LoreState ${stage}：${message}\n请打开诊断查看；状态可能尚未更新。`;notice.hidden=false;
    console.warn('[LoreState]',stage,message);
  }
  const manager=node('dialog',undefined,doc.body);manager.id='lorestate-state-manager';manager.setAttribute('aria-label','LoreState 状态管理器');
  manager.style.cssText=panel.style.cssText;
  const managerStyle=node('style',undefined,manager);managerStyle.textContent='#lorestate-state-manager{box-sizing:border-box}#lorestate-state-manager button,#lorestate-state-manager select{font:inherit;max-width:100%;margin:4px;padding:8px;border:1px solid #859074;border-radius:5px;background:#343d2c;color:#fff}#lorestate-state-manager button:disabled{opacity:.5}#lorestate-state-manager p{overflow-wrap:anywhere}#lorestate-state-manager textarea{box-sizing:border-box;background:#191d18;color:#eee}#lorestate-state-manager details{margin:12px 0}#lorestate-state-manager summary{cursor:pointer}';
  node('h2','LoreState · 状态管理器',manager);
  node('p','按当前选中回复分支回放。楼层号与酒馆一致，0 楼通常不参与初始化。历史消息被编辑后，这里显示重算结果。',manager);
  button('关闭',manager,()=>manager.close());
  const floorSelect=node('select',undefined,manager);floorSelect.setAttribute('aria-label','AI 楼层');
  const summary=node('p','',manager);summary.setAttribute('role','status');
  const details=node('div',undefined,manager);
  const repairBox=node('textarea',undefined,manager);repairBox.readOnly=true;repairBox.hidden=true;repairBox.setAttribute('aria-label','修复后的消息预览');repairBox.style.cssText='width:100%;height:180px';
  function floorList(){return messages().filter(m=>m.role==='assistant'&&!m.is_hidden);}
  function errorText(e){return `第 ${e.floor} 楼 · ${e.scope}${e.line?` · 原文第 ${e.line} 行 ${e.column} 列`:''}：${e.message}\n建议：${e.hint}`;}
  function showObject(title,value){const section=node('details',undefined,details);node('summary',title,section);const pre=node('pre',JSON.stringify(value,null,2),section);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';}
  function showState(state){
    node('h3','本层完整状态',details);
    if(!state){node('p','尚未建立状态。',details);return;}
    function fields(values,parent){for(const [name,value] of Object.entries(values)){node('h4',name,parent);node('p',value,parent).style.whiteSpace='pre-wrap';}}
    if(Object.keys(state.shared).length){node('h4','公共状态',details);fields(state.shared,details);}
    for(const person of Object.values(state.people)){
      const section=node('details',undefined,details);section.open=person.presence==='active';
      node('summary',`${person.name} · ${person.id} · ${person.presence==='cold'?'离场':'在场'}`,section);
      node('p',person.identity,section);fields(person.fields,section);
    }
    showObject('查看原始状态数据',state);
  }
  function showFloor(){
    draft=null;repairBox.hidden=true;applyRepair.disabled=true;details.replaceChildren();
    if(!floorSelect.value){summary.textContent='当前聊天没有可查看的 AI 楼层。';return;}
    const config=settings();if(!config.schema){summary.textContent='请先配置并启用 LoreState。';return;}
    const item=inspectFloor(messages(),config.schema,chatSettings().start??1,Number(floorSelect.value));
    summary.textContent=item.excluded?'本层在初始化起点之前，未参与状态更新。':item.error?'本层更新失败，整轮未应用。':item.tainted?'本层已应用，但前面存在失败更新，状态有缺口。':'本层更新成功。';
    node('p',`最后连续正常楼层：${item.lastGoodFloor??'尚无'}；最后应用楼层：${item.lastAppliedFloor??'尚无'}`,details);
    for(const error of item.errors)node('p',errorText(error),details).style.whiteSpace='pre-wrap';
    showState(item.state);
    node('h3','本轮实际应用的变化',details);
    if(!item.changes.length)node('p',item.error?'本轮失败，没有应用变化。':'本轮没有状态变化。',details);
    for(const change of item.changes){
      const path=change.path.replace(/^shared /,'公共状态 ').replace(/^people /,'人物 ').replace(' / fields / ',' / ');
      node('h4',`${change.kind} · ${path}`,details);
      node('p',`${change.before??'未记录'} → ${change.after??'已删除'}`,details).style.whiteSpace='pre-wrap';
    }
    const raw=node('details',undefined,details);node('summary','本层消息原文',raw);const pre=node('pre',item.source,raw);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
    if(runtimeLogs.length)showObject('本次运行异常（最多 30 条）',runtimeLogs);
  }
  function syncFloors(preferred=floorSelect.value){
    const list=floorList();floorSelect.replaceChildren();
    for(const m of list){const option=node('option',`第 ${m.message_id} 楼`,floorSelect);option.value=String(m.message_id);}
    floorSelect.value=list.some(m=>String(m.message_id)===String(preferred))?String(preferred):String(list.at(-1)?.message_id??'');showFloor();
  }
  function openManager(floor){if(panel.open)panel.close();if(!manager.open)manager.showModal();syncFloors(floor);}
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
    const result=getResult(),payload={version:'0.5.0',floor:Number(floorSelect.value),lastGoodFloor:result.lastGoodFloor,errors:result.errors,runtimeLogs};
    repairBox.hidden=false;repairBox.value=JSON.stringify(payload,null,2);draft=null;applyRepair.disabled=true;
    try{await navigator.clipboard.writeText(repairBox.value);summary.textContent='诊断报告已复制，不含完整消息和状态正文。';}catch{summary.textContent='请从下方文本框手动复制诊断报告。';}
  });
  button('预览基础格式修复',manager,()=>{
    const id=identity(),list=messages(),floor=Number(floorSelect.value),original=list.find(m=>m.message_id===floor);
    if(!original)throw new Error('请先选择 AI 楼层');
    const repaired=proposeRepair(original.message);if(!repaired){summary.textContent='没有可自动修复的独立 &。请按诊断提示在酒馆编辑原始标签，再重新校验。';return;}
    const candidate=list.map(m=>m===original?{...m,message:repaired}:m),config=settings();
    const check=inspectFloor(candidate,config.schema,chatSettings().start??1,floor);
    if(check.excluded)throw new Error('该楼层不参与状态更新，请使用酒馆原生编辑');
    if(check.error)throw new Error(`格式修复后仍未通过校验：${check.error.message}。请手动编辑原始标签。`);
    const branch=getChatMessages(floor,{include_swipes:true})[0];
    draft={id,floor,original:original.message,repaired,swipe:branch.swipe_id,schema:JSON.stringify(config.schema),start:chatSettings().start??1,history:JSON.stringify(list)};
    repairBox.value=repaired;repairBox.hidden=false;applyRepair.disabled=false;summary.textContent='预览仅把文字中的独立 & 转为 &amp;。本层校验通过；点击应用会修改当前选中回复，并保留一次撤销备份。';
  });
  const applyRepair=button('应用预览修复',manager,async()=>{
    if(hostGenerating())throw new Error('请等待本轮生成结束后再修复');
    const plan=draft;if(!plan)throw new Error('请先预览修复');
    const config=settings(),current=getChatMessages(plan.floor,{include_swipes:true})[0];
    if(!matches(plan.id)||JSON.stringify(messages())!==plan.history||current?.swipe_id!==plan.swipe||JSON.stringify(config.schema)!==plan.schema||(chatSettings().start??1)!==plan.start)throw new Error('聊天、分支或配置已变化，请重新预览');
    if(typeof setChatMessages!=='function')throw new Error('酒馆助手缺少消息写入能力，请手动编辑原文');
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...v[PROTO_KEY],repairBackup:{floor:plan.floor,swipe:plan.swipe,original:plan.original,repaired:plan.repaired}}}),{type:'chat'});
    await setChatMessages([{message_id:plan.floor,message:plan.repaired}],{refresh:'affected'});
    if(!matches(plan.id))return;
    await refresh();syncFloors(plan.floor);
  });applyRepair.disabled=true;
  button('撤销最近一次格式修复',manager,async()=>{
    if(hostGenerating())throw new Error('请等待本轮生成结束后再撤销');
    const backup=chatSettings().repairBackup;if(!backup)throw new Error('本聊天没有格式修复备份');
    const id=identity(),current=getChatMessages(backup.floor,{include_swipes:true})[0];
    if(current?.swipe_id!==backup.swipe||current?.swipes?.[current.swipe_id]!==backup.repaired)throw new Error('目标回复已变化，为避免覆盖，请从备份手动恢复');
    await setChatMessages([{message_id:backup.floor,message:backup.original}],{refresh:'affected'});
    if(!matches(id))return;
    updateVariablesWith(v=>{const next={...v[PROTO_KEY]};delete next.repairBackup;return {...v,[PROTO_KEY]:next};},{type:'chat'});
    await refresh();syncFloors(backup.floor);
  });
  button('查看格式修复备份',manager,()=>{repairBox.value=chatSettings().repairBackup?.original??'没有备份';repairBox.hidden=false;draft=null;applyRepair.disabled=true;});
  manager.append(repairBox,details);
  button('关闭',panel,()=>panel.close());
  const bookLabel=node('label','1. 角色／聊天绑定的世界书',panel),books=node('select',undefined,bookLabel);books.setAttribute('aria-label','世界书');
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
  const htmlLabel=node('label','2. 粘贴网页 AI 生成的 HTML',panel),html=node('textarea',undefined,htmlLabel);html.setAttribute('aria-label','HTML 模板');html.rows=9;html.value=settings().html||defaultHtml;
  const presetLabel=node('label','HTML 预设（随卡保存）',panel),presetSelect=node('select',undefined,presetLabel);presetSelect.setAttribute('aria-label','HTML 预设');
  const nameLabel=node('label','预设名称',panel),presetName=node('input',undefined,nameLabel);presetName.maxLength=40;presetName.setAttribute('aria-label','预设名称');
  function syncPresets(id=settings().activePresetId??'default'){
    presetSelect.replaceChildren();for(const p of listPresets(settings())){const option=node('option',p.name,presetSelect);option.value=p.id;}
    if(listPresets(settings()).some(p=>p.id===id))presetSelect.value=id;
    presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'我的样式';
  }
  function writeConfig(config){updateVariablesWith(v=>({...v,[PROTO_KEY]:config}),{type:'script'});}
  function validateSkin(source){const parsed=inspectTemplate(source),config=settings();if(config.ready&&config.schema&&!sameSchema(parsed.schema,config.schema))throw new Error('预设的栏目必须与当前配置一致；可以调整顺序和外观，不能增删栏目');return parsed;}
  presetSelect.onchange=()=>{presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'';};
  button('另存为新预设',panel,()=>{validateSkin(html.value);const id=crypto.randomUUID();writeConfig(savePreset(settings(),presetName.value,html.value,id));syncPresets(id);report('已保存新预设。点击“应用所选预设”才会切换当前样式。');});
  button('覆盖所选预设',panel,async()=>{validateSkin(html.value);const config=settings(),id=presetSelect.value;if(!id)throw new Error('请先保存一份预设');let next=savePreset(config,presetName.value,html.value,id);if(id===(config.activePresetId??'default'))next={...next,html:html.value};writeConfig(next);syncPresets(id);renderKey='';await refresh();report('预设已更新，聊天状态保留。');});
  button('应用所选预设',panel,async()=>{const config=settings(),preset=listPresets(config).find(p=>p.id===presetSelect.value);if(!preset)throw new Error('请先保存一份预设');validateSkin(preset.html);if(!config.ready)throw new Error('请先点击“保存 HTML 并启用本聊天”完成初始配置');writeConfig({...config,presets:listPresets(config),html:preset.html,activePresetId:preset.id});html.value=preset.html;renderKey='';await refresh();report(`已应用“${preset.name}”，聊天状态保留。`);});
  button('删除所选预设',panel,()=>{writeConfig(deletePreset(settings(),presetSelect.value));syncPresets();report('已删除所选预设，当前展示保留。');});
  syncPresets();
  const preview=node('iframe',undefined,panel);preview.title='LoreState HTML 预览';preview.setAttribute('sandbox','');preview.style.cssText='width:100%;height:260px;border:0;border-radius:8px';
  const getResult=(config=settings(),list=messages())=>replayState(list,config.schema,chatSettings().start??1);
  button('预览 HTML（不保存）',panel,()=>{
    const {schema}=inspectTemplate(html.value),config=settings();
    const example=fields=>Object.fromEntries(fields.map(f=>[f,`${f}的示例文字`]));
    const state=config.schema&&sameSchema(schema,config.schema)?getResult(config).state:null;
    preview.srcdoc=renderTemplate(html.value,state??{shared:example(schema.shared),people:schema.person.length?{P01:{id:'P01',name:'示例人物',identity:'人物识别信息',presence:'active',fields:example(schema.person)}}:{}});
    report(`公共栏目：${schema.shared.join('、')||'无'}；人物栏目：${schema.person.join('、')||'无'}。预览未保存。`);
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
    const {schema}=inspectTemplate(html.value),previous=settings();
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
    maker.value=playPrompt(entry.content,config.schema,getResult(config),doc.getElementById('send_textarea')?.value??'');report('此处仅预览提示，没有调用模型。');
  });
  button('暂停本聊天',panel,async()=>{
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...chatSettings(),enabled:false}}),{type:'chat'});uninject?.();uninject=null;view?.remove();report('已暂停；数据和 HTML 保留，标签过滤正则保留。');
  });
  button('重新读取当前聊天状态',panel,async()=>{renderKey='';await refresh();const result=getResult();report(result.errors.length?`重新校验后仍有 ${result.errors.length} 轮失败，请打开状态管理器。`:'全部参与回放的楼层已通过校验。');});
  button('打开状态管理器',panel,()=>openManager());
  async function open(){if(!panel.open)panel.showModal();html.value=settings().html||html.value;syncPresets();await loadBooks();}
  const menu=node('div');menu.className='extension_container';
  const opener=button('LoreState · 原型设置',menu,open);opener.className='list-group-item';opener.style.cssText='background:transparent;color:inherit;border:0;text-align:left;width:100%;font:inherit';
  const managerOpener=button('LoreState · 状态管理器',menu,()=>openManager());managerOpener.className=opener.className;managerOpener.style.cssText=opener.style.cssText;
  const mount=()=>{const target=doc.getElementById('extensionsMenu');if(target){target.append(menu);menuObserver?.disconnect();}};
  menuObserver=new MutationObserver(mount);menuObserver.observe(doc.body,{childList:true,subtree:true});mount();
  const active=config=>config.ready&&!!ctx().getCurrentChatId()&&chatSettings().enabled!==false;
  function paint(result,list){
    const last=list.findLast(m=>m.role==='assistant'&&!m.is_hidden);if(!last)return;
    const message=doc.querySelector(`#chat .mes[mesid="${last.message_id}"]`);if(!message)return;
    const config=settings(),key=JSON.stringify([last.message_id,result.state,result.errors,config.html]);
    if(view?.isConnected&&renderKey===key)return;
    view?.remove();view=node('section',undefined,message.querySelector('.mes_block')||message);view.className='lorestate-prototype-view';view.style.cssText='margin:12px 0;padding:10px;border-top:1px solid #778063';
    node('small',result.errors.length?`状态存在缺口：${result.errors.length} 轮失败，最早第 ${result.errors[0].floor} 楼；最后连续正常楼层 ${result.lastGoodFloor??'尚无'}。后续有效更新已应用，需核对剧情。`:result.state?'LoreState · 当前状态':'LoreState · 等待首次完整状态',view);
    button('查看历史与诊断',view,()=>openManager(result.errors[0]?.floor));
    function showFrame(state,parent,title){const frame=node('iframe',undefined,parent);frame.title=title;frame.setAttribute('sandbox','');frame.srcdoc=renderTemplate(config.html,state);frame.style.cssText='display:block;width:100%;height:260px;border:0;border-radius:8px;margin-top:8px';}
    if(result.state){
      showFrame(result.state,view,'LoreState 当前状态');
      const cold=Object.values(result.state.people).filter(p=>p.presence==='cold');
      if(cold.length){const archive=node('details',undefined,view);node('summary',`本地离场记忆 · ${cold.length} 人`,archive);
        for(const p of cold){const item=node('details',undefined,archive);node('summary',`${p.name} · ${p.id} · ${p.identity}`,item);
          let loaded=false;item.ontoggle=()=>{if(item.open&&!loaded){for(const f of config.schema.person){node('h4',f,item);const text=node('p',p.fields[f]??'尚未记录',item);text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';}loaded=true;}};
        }
      }
    }
    if(result.errors.length)button('重新读取状态',view,()=>refresh());renderKey=key;
  }
  async function refresh(){
    if(hostGenerating())return;
    const config=settings();if(!active(config)){view?.remove();return;}
    const id=identity(),list=messages(),result=getResult(config,list);
    if(!matches(id))return;
    // Raw messages remain the replay source; this snapshot is a convenient persisted last-good view.
    const record={state:result.state,errors:result.errors,lastGoodFloor:result.lastGoodFloor,tainted:result.tainted,lastFloor:list.at(-1)?.message_id??-1};
    const old=chatSettings();if(JSON.stringify(old.current)!==JSON.stringify(record))updateVariablesWith(v=>({...v,[PROTO_KEY]:{...old,current:record}}),{type:'chat'});
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
  function schedule(){
    if(pending||closed||hostGenerating())return;pending=true;const id=identity();
    queue=queue.then(async()=>{pending=false;if(!matches(id)){if(!closed)schedule();return;}if(!hostGenerating()){await refresh();if(manager.open&&!draft)syncFloors();}}).catch(e=>fault(e,'状态刷新失败'));
  }
  async function beforeGenerate(type,_options,dryRun){
    uninject?.();uninject=null;const config=settings();
    if(dryRun||!active(config)||['quiet','impersonate'].includes(type))return;
    const id=identity();
    try{
      const source=await getWorldbook(config.book);if(!matches(id))return;
      const entry=source.find(e=>e.uid===config.uid);
      if(!entry)throw new Error('世界书关联失效，请在原型设置中重新选择');
      let list=messages();if(['swipe','regenerate'].includes(type)&&list.at(-1)?.role==='assistant')list=list.slice(0,-1);
      const result=getResult(config,list);
      const userText=type==='swipe'||type==='regenerate'?list.findLast(m=>m.role==='user')?.message??'':doc.getElementById('send_textarea')?.value||list.findLast(m=>m.role==='user')?.message||'';
      const content=playPrompt(entry.content,config.schema,result,userText);
      uninject=injectPrompts([{id:PROTO_KEY,position:'in_chat',depth:0,role:'system',content,should_scan:false}]).uninject;
    }catch(e){fault(e,'状态提示未注入');}
  }
  for(const event of ['MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','GENERATION_ENDED','MORE_MESSAGES_LOADED'])if(tavern_events[event])eventOn(tavern_events[event],schedule);
  if(tavern_events.GENERATION_STARTED)eventOn(tavern_events.GENERATION_STARTED,()=>{generating=true;});
  for(const event of ['GENERATION_ENDED','GENERATION_STOPPED'])if(tavern_events[event])eventOn(tavern_events[event],()=>{generating=false;schedule();});
  eventOn(tavern_events.CHAT_CHANGED,()=>{uninject?.();uninject=null;view?.remove();renderKey='';noticeKey='';notice.hidden=true;runtimeLogs=[];draft=null;manager.close();generating=false;schedule();});
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS,beforeGenerate);
  eventOn(getButtonEvent('LoreState 设置'),()=>open().catch(e=>fault(e,'设置打开失败')));
  function dispose(){closed=true;menuObserver?.disconnect();menu.remove();panel.remove();manager.remove();notice.remove();view?.remove();uninject?.();}
  window.addEventListener('pagehide',dispose,{once:true});schedule();
}
