import {startPrototype} from '../prototype/runtime.js';
import {PROTO_KEY} from '../prototype/core.js';
import {readSnapshots} from '../prototype/snapshot-store.js';
const output=document.getElementById('result'),results=[];
const html='<p data-lore-field="地点"></p>';
const wrap=(text,mode='delta')=>`<LoreState version="3" mode="${mode}"><Shared><地点>${text}</地点></Shared></LoreState>`;
let list=[{message_id:1,role:'assistant',message:wrap('车站','full'),swipe_id:0},{message_id:3,role:'assistant',message:wrap('A & B'),swipe_id:0}];
let chatId='test',chatRef=[],variables={script:{[PROTO_KEY]:{ready:true,schema:{shared:['地点'],entity:[]},html}},chat:{[PROTO_KEY]:{enabled:true,start:1}}};
const handlers=new Map();
Object.assign(window,{
  getCharWorldbookNames:()=>({primary:'test-book',additional:[]}),
  getChatWorldbookName:()=>null,
  getWorldbook:async()=>[{uid:1,name:'状态规则',content:'记录地点'}],
  SillyTavern:{getContext:()=>({chat:chatRef,getCurrentChatId:()=>chatId,mainApi:'openai',chatCompletionSettings:{model:'synthetic-current-model'}})},
  getVariables:({type})=>variables[type],
  updateVariablesWith:(fn,{type})=>{variables[type]=fn(variables[type]);},
  getChatMessages:(range,options)=>{const items=typeof range==='number'?list.filter(m=>m.message_id===range):list;return structuredClone(items.map(m=>options?.include_swipes?{...m,swipes:[m.message]}:m));},
  setChatMessages:async edits=>{for(const edit of edits)Object.assign(list.find(m=>m.message_id===edit.message_id),edit);},
  tavern_events:Object.fromEntries(['MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','CHARACTER_MESSAGE_RENDERED','GENERATION_ENDED','GENERATION_STARTED','GENERATION_STOPPED','CHAT_CHANGED','GENERATION_AFTER_COMMANDS'].map(x=>[x,x])),
  eventOn:(name,fn)=>{handlers.set(name,[...(handlers.get(name)??[]),fn]);},
  getButtonEvent:name=>name,
});
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
async function emit(name){for(const fn of handlers.get(name)??[])await fn();await tick();}
function assert(ok,message='断言失败'){if(!ok)throw new Error(message);}
async function check(name,fn){try{await fn();results.push('PASS '+name);}catch(e){results.push('FAIL '+name+': '+e.message);}}
function button(label,root=document){return [...root.querySelectorAll('button')].find(el=>el.textContent===label);}
async function click(label,root=document){const el=button(label,root);assert(el,'找不到 '+label);await el.onclick();await tick();}
for(const m of list){const el=document.createElement('div');el.className='mes';el.setAttribute('mesid',m.message_id);document.getElementById('chat').append(el);}
if(new URLSearchParams(location.search).has('bundle')){
  const source=await(await fetch('../artifact/bundle.js?v=0.8.0')).text();Function(source)();
}else startPrototype(html);
await tick();
let manager=document.querySelector('[aria-label="LoreState 控制中心"]'),notice=document.querySelector('aside[role="alert"]');
await check('启动立即告警并显示具体错误楼层',async()=>{
  assert(!notice.hidden);assert(notice.textContent.includes('第 3 楼'));
  await click('查看诊断',notice);assert(manager.open);assert(manager.querySelector('select').value==='3');manager.close();
});
await check('魔法棒管理器查看旧楼层，不显示未来状态',async()=>{
  await click('LoreState');assert(manager.open);
  await click('上一 AI 层',manager);assert(manager.textContent.includes('车站'));assert(manager.textContent.includes('本层更新成功'));
});
await check('单入口、四页签、设置草稿和键盘导航',async()=>{
  assert(document.querySelectorAll('#extensionsMenu button').length===1);
  const tabs=[...manager.querySelectorAll('[role="tab"]')];assert(tabs.length===4);
  assert(tabs.every(tab=>tab.getBoundingClientRect().height>=44),'页签触控热区不足 44px');
  tabs[2].click();await tick();assert(!document.getElementById('lorestate-prototype-settings').hidden);assert(document.getElementById('ls-page-state').hidden);
  const settingCards=[...document.querySelectorAll('#lorestate-prototype-settings>.ls-card')];
  assert(settingCards.length===5,'设置页必须保持五步卡片结构');assert(settingCards.filter(card=>card.open).length===1,'设置页默认只展开第一步');
  const editor=manager.querySelector('[aria-label="HTML 模板"]');const original=editor.value;editor.value='未保存草稿';
  tabs[0].click();tabs[2].click();await tick();assert(editor.value==='未保存草稿');editor.value=original;
  tabs[2].dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert(tabs[0].getAttribute('aria-selected')==='true');
  tabs[1].click();assert(!document.getElementById('ls-page-diagnostics').hidden);
});
await check('336px 窄容器四个页面均无横向溢出',async()=>{
  manager.style.width='336px';
  for(const tab of manager.querySelectorAll('[role="tab"]')){tab.click();await tick();assert(manager.scrollWidth<=manager.clientWidth+1,'页面横向溢出：'+tab.textContent);}
  manager.style.width='';manager.querySelector('#ls-tab-diagnostics').click();
});
await check('宿主主题覆盖下复选框仍是可见可点的原生控件',async()=>{
  // 模拟 SillyTavern 主题：抹掉原生对勾、压掉热区，再用伪元素画自己的勾。
  const theme=document.createElement('style');
  theme.textContent='input[type=checkbox]:not(#nonexistent){-webkit-appearance:none;appearance:none;width:auto;height:auto;min-height:0;padding:6px;border:1px solid #444;border-radius:4px;background:#111;box-shadow:none}input[type=checkbox]:not(#nonexistent)::before{content:"\\2713";display:inline-block}';
  document.head.append(theme);
  try{
    manager.querySelector('#ls-tab-api').click();await tick();
    const auto=manager.querySelector('[aria-label="自动更新"]'),style=getComputedStyle(auto),box=auto.getBoundingClientRect();
    assert(style.appearance!=='none'&&style.webkitAppearance!=='none','原生复选框被宿主主题抹掉');
    assert(getComputedStyle(auto,'::before').content==='none','宿主主题的伪元素盖住了对勾');
    assert(box.width>=20&&box.height>=20,'复选框热区过小：'+box.width+'x'+box.height);
    const row=auto.closest('label');assert(row?.className==='ls-check','复选框必须在整行热区里');
    const before=auto.checked;row.click();assert(auto.checked!==before,'点击整行无法切换复选框');row.click();assert(auto.checked===before);
    assert(button('保存状态更新绑定',auto.closest('details')),'保存按钮必须和它保存的字段同卡片');
  }finally{theme.remove();manager.querySelector('#ls-tab-diagnostics').click();await tick();}
});
await check('错误轮、修复预览、写回、备份、撤销和告警恢复',async()=>{
  await click('返回最新',manager);assert(manager.textContent.includes('本层更新失败'));
  await click('预览基础格式修复',manager);assert(manager.querySelector('textarea').value.includes('&amp;'));assert(list[1].message.includes('A & B'));
  await click('应用预览修复',manager);assert(list[1].message.includes('&amp;'));assert(notice.hidden);assert(manager.textContent.includes('本层更新成功'));
  await click('撤销最近一次格式修复',manager);assert(list[1].message.includes('A & B'));assert(!notice.hidden);
});
await check('关闭告警后同一错误不重复弹出',async()=>{
  notice.hidden=true;await emit('MESSAGE_UPDATED');assert(notice.hidden);
});
await check('预览后分支变化拒绝写回',async()=>{
  await click('预览基础格式修复',manager);list[1].swipe_id=1;
  await click('应用预览修复',manager);assert(list[1].message.includes('A & B'));assert(notice.textContent.includes('已变化'));list[1].swipe_id=0;
});
await check('流式未完成期间不写错误快照，结束后复验',async()=>{
  await emit('GENERATION_STARTED');const before=JSON.stringify(variables.chat);
  list.push({message_id:5,role:'assistant',message:'<LoreState',swipe_id:0});await emit('MESSAGE_RECEIVED');assert(JSON.stringify(variables.chat)===before);
  list[2].message=wrap('街道');await emit('GENERATION_ENDED');assert(variables.chat[PROTO_KEY].current.lastFloor===5);
});
await check('快速切换聊天不保留旧弹窗或写入旧状态',async()=>{
  list=[{message_id:1,role:'assistant',message:wrap('新聊天','full'),swipe_id:0}];chatId='other';chatRef=[];variables.chat={[PROTO_KEY]:{enabled:true,start:1}};
  await emit('MESSAGE_UPDATED');await emit('CHAT_CHANGED');assert(!manager.open);assert(notice.hidden);assert(variables.chat[PROTO_KEY].current.state.shared.地点==='新聊天');
});
await check('正文全宽、大窗口展开与关闭恢复焦点',async()=>{
  const view=document.querySelector('.lorestate-prototype-view'),frame=view.querySelector('iframe');
  assert(frame.getBoundingClientRect().width>=view.clientWidth-2);assert(frame.getBoundingClientRect().height>=360);
  const expand=button('展开状态窗口',view);expand.focus();await click('展开状态窗口',view);
  const window=document.getElementById('lorestate-state-window'),large=window.querySelector('iframe');
  assert(window.open);assert(large.getBoundingClientRect().height>300);assert(large.getBoundingClientRect().width>=window.clientWidth-34);assert(large.getAttribute('sandbox')==='');
  assert(large.srcdoc===frame.srcdoc);button('关闭状态窗口',window).click();await tick();assert(!window.open);assert(document.activeElement===expand);
});
await check('宿主重建聊天楼层后状态栏自动恢复',async()=>{
  const oldView=document.querySelector('.lorestate-prototype-view');
  const chat=document.getElementById('chat');chat.replaceChildren();
  for(const m of list){const el=document.createElement('div');el.className='mes';el.setAttribute('mesid',m.message_id);chat.append(el);}
  await new Promise(resolve=>setTimeout(resolve,120));
  const repaired=document.querySelector('.lorestate-prototype-view');
  assert(!oldView.isConnected,'旧状态栏应随宿主楼层重建而脱离');
  assert(repaired&&repaired!==oldView,'应在新楼层挂载新的状态栏');
  assert(repaired.parentElement?.getAttribute('mesid')===String(list.findLast(m=>m.role==='assistant').message_id),'状态栏应挂到最新 AI 楼层');
  assert(repaired.querySelector('iframe.lorestate-state-frame')?.srcdoc,'恢复后的状态栏 iframe 不应为空');
});
await check('未配置或暂停聊天时 DOM 变化不读取历史、不抛异常',async()=>{
  const saved=variables.script,enabled=variables.chat[PROTO_KEY].enabled,read=window.getChatMessages,errors=[];
  let reads=0;const onError=e=>{errors.push(e.message);e.preventDefault();};
  window.addEventListener('error',onError);
  window.getChatMessages=(...args)=>{reads++;return read(...args);};
  const marker=document.createElement('span');
  try{
    variables.script={};document.getElementById('chat').append(marker);
    await new Promise(resolve=>setTimeout(resolve,120));
    assert(!errors.length,errors.join('; '));assert(reads===0,'未配置不应读取历史');
    variables.script=saved;variables.chat[PROTO_KEY].enabled=false;marker.append(document.createElement('span'));
    await new Promise(resolve=>setTimeout(resolve,120));
    assert(!errors.length,errors.join('; '));assert(reads===0,'暂停时不应读取历史');
  }finally{variables.script=saved;variables.chat[PROTO_KEY].enabled=enabled;window.getChatMessages=read;window.removeEventListener('error',onError);marker.remove();}
});
await check('状态栏恢复读取失败进入诊断，后续 DOM 重建仍能恢复',async()=>{
  const read=window.getChatMessages,errors=[],oldView=document.querySelector('.lorestate-prototype-view');
  const onError=e=>{errors.push(e.message);e.preventDefault();};
  window.addEventListener('error',onError);
  try{
    window.getChatMessages=()=>{throw new Error('合成历史读取失败');};oldView.remove();
    await new Promise(resolve=>setTimeout(resolve,120));
    assert(!errors.length,errors.join('; '));
    assert(!notice.hidden&&notice.textContent.includes('状态栏恢复失败')&&notice.textContent.includes('合成历史读取失败'));
  }finally{window.getChatMessages=read;window.removeEventListener('error',onError);}
  const marker=document.createElement('span');document.getElementById('chat').append(marker);
  await new Promise(resolve=>setTimeout(resolve,120));marker.remove();
  assert(document.querySelector('.lorestate-prototype-view iframe.lorestate-state-frame')?.srcdoc,'读取恢复后应重建状态栏');
});
await check('完整快照回档、原子写入、保留正文与撤销',async()=>{
  variables.chat.unrelated={keep:true};
  list.push({message_id:3,role:'assistant',message:wrap('未来地点'),swipe_id:0});await emit('MESSAGE_UPDATED');
  await click('LoreState');
  const select=manager.querySelector('[aria-label="历史状态快照"]');
  const saved=readSnapshots(variables.chat[PROTO_KEY]);assert(saved.length===2);
  select.value=saved.find(s=>s.floor===1).id;
  await click('预览快照回档');const original=JSON.stringify(list);await click('确认回档');
  assert(JSON.stringify(list)===original);assert(variables.chat.unrelated.keep);
  assert(variables.chat[PROTO_KEY].current.state.shared.地点==='新聊天');
  await click('撤销上次回档');assert(variables.chat[PROTO_KEY].current.state.shared.地点==='未来地点');
  select.value=saved.find(s=>s.floor===1).id;await click('预览快照回档');
  list[1].message+='编辑';await click('确认回档');assert(!variables.chat[PROTO_KEY].checkpoint);
  await click('预览快照回档');await click('确认回档');
  list.push({message_id:5,role:'assistant',message:wrap('回档后的新地点'),swipe_id:0});await emit('MESSAGE_UPDATED');
  assert(variables.chat[PROTO_KEY].current.state.shared.地点==='回档后的新地点');
  await click('撤销上次回档');assert(variables.chat[PROTO_KEY].checkpoint);assert(notice.textContent.includes('聊天已变化'));
  manager.close();
});
await check('重新启动保留快照和回档基线，不重复归档',async()=>{
  const count=readSnapshots(variables.chat[PROTO_KEY]).length;
  variables.chat=JSON.parse(JSON.stringify(variables.chat));
  window.dispatchEvent(new Event('pagehide'));handlers.clear();
  if(new URLSearchParams(location.search).has('bundle'))Function(await(await fetch('../artifact/bundle.js?v=0.8.0')).text())();else startPrototype(html);
  await tick();await tick();
  assert(readSnapshots(variables.chat[PROTO_KEY]).length===count);
  assert(variables.chat[PROTO_KEY].current.state.shared.地点==='回档后的新地点');
});
await check('世界实体冷档展示与生成提示接入，活动事件始终注入且预取不改状态',async()=>{
  const entityHtml='<p data-lore-field="时间"></p><article data-lore-entity><b data-lore-name></b><small data-lore-type></small><p data-lore-field="概况"></p></article>';
  variables.script[PROTO_KEY]={ready:true,book:'test-book',uid:1,schema:{shared:['时间'],entity:['概况']},html:entityHtml};
  variables.chat={[PROTO_KEY]:{enabled:true,start:1}};chatId='world-v3';chatRef=[];
  list=[{message_id:1,role:'assistant',swipe_id:0,message:'<LoreState version="3" mode="full"><Shared><时间>第三天</时间></Shared><Entity id="N01" name="北境公国" type="国家" identity="北方国家" mode="full" presence="cold"><概况>国库尚有三百金币</概况></Entity><Entity id="E01" name="送货承诺" type="事件" identity="港口订单" mode="full" pending="true"><概况>明天交付货物</概况></Entity></LoreState>'}];
  await emit('CHAT_CHANGED');await tick();
  assert(document.body.textContent.includes('本地冷档 · 1 个实体'));assert(document.body.textContent.includes('国家 · 北境公国'));
  let prompt='';window.injectPrompts=items=>{prompt=items[0].content;return {uninject(){}};};
  const generate=async()=>{for(const fn of handlers.get('GENERATION_AFTER_COMMANDS')??[])await fn('normal',{},false);};
  await generate();assert(prompt.includes('明天交付货物'));assert(!prompt.includes('国库尚有三百金币'));
  const input=document.createElement('textarea');input.id='send_textarea';input.value='访问北境公国';document.body.append(input);
  const before=JSON.stringify(variables.chat[PROTO_KEY].current.state);await generate();
  assert(prompt.includes('国库尚有三百金币'));assert(prompt.includes('最后事实更新楼层：1'));assert(JSON.stringify(variables.chat[PROTO_KEY].current.state)===before);
  for(const type of ['quiet','impersonate']){prompt='';for(const fn of handlers.get('GENERATION_AFTER_COMMANDS')??[])await fn(type,{},false);assert(prompt==='','特殊生成不应注入状态提示');}
  input.remove();
});
const generate=async(type='normal',dryRun=false)=>{for(const fn of handlers.get('GENERATION_AFTER_COMMANDS')??[])await fn(type,{},dryRun);};
const originalContext=window.SillyTavern.getContext,originalWorldbook=window.getWorldbook;
let controller,stops=0,injected=0,cleaned=0;
window.SillyTavern.getContext=()=>({...originalContext(),stopGeneration(){stops++;controller.abort();return true;}});
window.injectPrompts=()=>{injected++;return {uninject(){cleaned++;}};};
for(const failure of ['世界书读取失败','世界书关联失效','提示预算超限','回档前缀失效','注入失败'])await check(`生成准备失败阻断请求：${failure}`,async()=>{
  controller=new AbortController();const config=variables.script[PROTO_KEY],saved=variables.chat[PROTO_KEY],oldCheckpoint=saved.checkpoint,inject=window.injectPrompts;
  const before=JSON.stringify(list),previousStops=stops,previousInjections=injected;
  if(failure==='世界书读取失败')window.getWorldbook=async()=>{throw new Error('读取失败');};
  if(failure==='世界书关联失效')window.getWorldbook=async()=>[];
  if(failure==='提示预算超限')window.getWorldbook=async()=>[{uid:config.uid,content:'字'.repeat(24000)}];
  if(failure==='回档前缀失效')saved.checkpoint={schema:JSON.stringify([config.schema,saved.start]),cutoff:1,prefix:'失效前缀'};
  if(failure==='注入失败')window.injectPrompts=()=>{throw new Error('注入失败');};
  try{
    const stateBefore=JSON.stringify(variables.chat);await generate();
    assert(controller.signal.aborted&&stops===previousStops+1,'失败必须中止宿主请求');
    assert(injected===previousInjections,'失败不应留下新的状态注入');
    assert(JSON.stringify(list)===before&&JSON.stringify(variables.chat)===stateBefore,'生成准备不能改写消息或状态');
    assert(document.querySelector('aside[role="alert"]').textContent.includes('本轮生成已停止'));
  }finally{window.getWorldbook=originalWorldbook;window.injectPrompts=inject;if(oldCheckpoint===undefined)delete saved.checkpoint;else saved.checkpoint=oldCheckpoint;}
});
await check('修正配置后正常生成恢复，旧注入被清理',async()=>{
  controller=new AbortController();const count=stops,previousInjections=injected,previousCleaned=cleaned;
  await generate();await generate();
  assert(!controller.signal.aborted&&stops===count&&injected===previousInjections+2);
  assert(cleaned>=previousCleaned+1,'不能叠加旧状态注入');
});
await check('预览、暂停和特殊生成不误触发中止',async()=>{
  controller=new AbortController();const count=stops,previousInjections=injected,saved=variables.chat[PROTO_KEY];
  window.getWorldbook=async()=>{throw new Error('不应读取');};
  try{await generate('normal',true);await generate('quiet');await generate('impersonate');saved.enabled=false;await generate();}
  finally{saved.enabled=true;window.getWorldbook=originalWorldbook;}
  assert(stops===count&&injected===previousInjections&&!controller.signal.aborted);
});
await check('旧聊天异步失败不会中止新聊天生成',async()=>{
  controller=new AbortController();const count=stops,id=chatId,ref=chatRef;let reject;
  window.getWorldbook=()=>new Promise((_,fail)=>{reject=fail;});
  const pending=generate();chatId='new-generation';chatRef=[];reject(new Error('旧聊天读取失败'));
  try{await pending;assert(stops===count&&!controller.signal.aborted);}
  finally{chatId=id;chatRef=ref;window.getWorldbook=originalWorldbook;}
});
await check('宿主中止失败时提示手动停止，不虚报成功',async()=>{
  window.getWorldbook=async()=>{throw new Error('读取失败');};
  const context=window.SillyTavern.getContext;
  try{for(const stopGeneration of [()=>false,()=>{throw new Error('停止接口异常');}]){
    window.SillyTavern.getContext=()=>({...originalContext(),stopGeneration});await generate();
    const text=document.querySelector('aside[role="alert"]').textContent;
    assert(text.includes('手动停止')&&!text.includes('本轮生成已停止'));
  }}finally{window.SillyTavern.getContext=context;window.getWorldbook=originalWorldbook;}
});
await check('读取凭据保存失败时撤销注入并中止，清理异常也不能绕过中止',async()=>{
  const write=window.updateVariablesWith,inject=window.injectPrompts;let removed=0;
  window.injectPrompts=()=>({uninject(){removed++;}});controller=new AbortController();
  window.updateVariablesWith=()=>{throw new Error('模拟保存失败');};
  try{await generate();assert(controller.signal.aborted&&removed===1);}
  finally{window.updateVariablesWith=write;}
  window.injectPrompts=()=>({uninject(){throw new Error('模拟清理失败');}});controller=new AbortController();await generate();controller=new AbortController();await generate();assert(controller.signal.aborted);
  window.injectPrompts=inject;
});
await check('用户消息不允许状态续写，在读取世界书前中止',async()=>{
  list.push({message_id:99,role:'user',message:'用户消息'});
  controller=new AbortController();const count=stops,before=JSON.stringify(variables.chat),history=JSON.stringify(list);let reads=0;
  window.getWorldbook=async()=>{reads++;return [];};
  try{await generate('continue');assert(controller.signal.aborted&&stops===count+1&&reads===0);assert(JSON.stringify(variables.chat)===before&&JSON.stringify(list)===history);}
  finally{window.getWorldbook=originalWorldbook;list.pop();}
});
let authorPromptText='';
await check('作者初始档案预览、保存默认值与当前空聊天应用分离',async()=>{
  variables.script[PROTO_KEY]={ready:true,book:'test-book',uid:1,schema:{shared:['地点'],entity:['状态']},html:'<p data-lore-field="地点"></p><article data-lore-entity><b data-lore-name></b><p data-lore-field="状态"></p></article>'};
  variables.chat={[PROTO_KEY]:{enabled:true,start:1}};chatId='author-policy';chatRef=[];list=[{message_id:0,role:'assistant',message:'开场白',swipe_id:0}];await emit('CHAT_CHANGED');
  await click('LoreState');document.querySelector('#ls-tab-settings').click();await tick();
  const initial=document.querySelector('[aria-label="作者初始档案"]'),constraints=document.querySelector('[aria-label="字段约束"]');
  initial.value='<LoreState version="3" mode="full"><Shared><地点>作者港口</地点></Shared><Entity id="P1" name="访客" identity="约定来访者" mode="full" presence="cold"><状态>等待</状态></Entity></LoreState>';
  constraints.value='{"shared":{"地点":{"required":true}},"entity":{"状态":{"enum":["等待","完成","未知"]}}}';
  await click('预览作者配置');assert(!variables.script[PROTO_KEY].authorPolicy&&!variables.chat[PROTO_KEY].policy.initial,'预览不可写入');
  await click('保存为新聊天默认配置');assert(variables.script[PROTO_KEY].authorPolicy.initial.includes('作者港口'));assert(!variables.chat[PROTO_KEY].policy.initial,'保存默认值不能重解释当前聊天');
  await click('应用到尚未开始的本聊天');assert(variables.chat[PROTO_KEY].current.state.shared.地点==='作者港口');assert(variables.chat[PROTO_KEY].current.state.entities.P1.confirmedFloor===null);
});
await check('初始冷档在首轮完整预取后可当轮更新并保存凭据',async()=>{
  controller=new AbortController();window.injectPrompts=items=>{authorPromptText=items[0].content;return {uninject(){}};};
  const input=document.createElement('textarea');input.id='send_textarea';input.value='与 P1 见面';document.body.append(input);
  await generate();input.remove();assert(!controller.signal.aborted);assert(authorPromptText.includes('mode="delta"'));assert(authorPromptText.includes('当轮可更新的冷档编号：P1'));
  const token=authorPromptText.match(/read="([a-f\d-]+)"/)[1];assert(variables.chat[PROTO_KEY].snapshotStore.receipts[token]);
  list.push({message_id:1,role:'user',message:'与 P1 见面',swipe_id:0},{message_id:2,role:'assistant',swipe_id:0,message:`<LoreState version="3" mode="delta" read="${token}"><Entity id="P1" mode="delta"><状态>完成</状态></Entity></LoreState>`});
  const el=document.createElement('div');el.className='mes';el.setAttribute('mesid','2');document.getElementById('chat').append(el);
  await emit('GENERATION_ENDED');const saved=variables.chat[PROTO_KEY];assert(saved.current.errors.length===0);assert(saved.current.state.entities.P1.fields.状态==='完成');assert(saved.current.state.entities.P1.presence==='cold');assert(saved.current.state.entities.P1.confirmedFloor===2);
  assert(!saved.snapshots&&readSnapshots(saved).length===1);assert(Object.keys(saved.snapshotStore.states).length===2,'凭据前态与更新后态各保留一份');
});
await check('生成重抽从更新前初值读取，字段约束阻止整批错误',async()=>{
  controller=new AbortController();await generate('regenerate');assert(authorPromptText.includes('<状态>等待</状态>'),'重抽必须排除末尾更新后的状态');
  const token=authorPromptText.match(/read="([a-f\d-]+)"/)[1],old=list[2];
  list[2]={...old,swipe_id:0,message:`<LoreState version="3" mode="delta" read="${token}"><Shared><地点>不应提交</地点></Shared><Entity id="P1" mode="delta"><状态>非法值</状态></Entity></LoreState>`};
  await emit('MESSAGE_EDITED');assert(variables.chat[PROTO_KEY].current.errors.length===1);assert(variables.chat[PROTO_KEY].current.state.shared.地点==='作者港口');
  list[2]=old;await emit('MESSAGE_EDITED');assert(variables.chat[PROTO_KEY].current.errors.length===0);
});
await check('已有聊天拒绝应用新初值，新默认值只影响后续新聊天',async()=>{
  await click('LoreState');const initial=document.querySelector('[aria-label="作者初始档案"]');initial.value=initial.value.replace('作者港口','新默认地点');
  await click('预览作者配置');await click('保存为新聊天默认配置');const before=JSON.stringify(variables.chat[PROTO_KEY].policy);
  await click('应用到尚未开始的本聊天');assert(JSON.stringify(variables.chat[PROTO_KEY].policy)===before);assert(document.querySelector('aside[role="alert"]').textContent.includes('已有状态历史'));
  const prior=variables.chat;variables.chat={[PROTO_KEY]:{enabled:true,start:1}};chatId='new-author-default';chatRef=[];list=[{message_id:0,role:'assistant',message:'开场白',swipe_id:0}];await emit('CHAT_CHANGED');
  assert(variables.chat[PROTO_KEY].current.state.shared.地点==='新默认地点');assert(prior[PROTO_KEY].current.state.shared.地点==='作者港口');
});
await check('去重存档与读取凭据序列化重载后仍能回放，容量可见',async()=>{
  const input=document.createElement('textarea');input.id='send_textarea';input.value='P1';document.body.append(input);controller=new AbortController();await generate();input.remove();
  const token=authorPromptText.match(/read="([a-f\d-]+)"/)[1];list.push({message_id:1,role:'assistant',swipe_id:0,message:`<LoreState version="3" mode="delta" read="${token}"><Entity id="P1" mode="delta"><状态>完成</状态></Entity></LoreState>`});await emit('GENERATION_ENDED');
  const count=readSnapshots(variables.chat[PROTO_KEY]).length;variables.chat=JSON.parse(JSON.stringify(variables.chat));window.dispatchEvent(new Event('pagehide'));handlers.clear();
  if(new URLSearchParams(location.search).has('bundle'))Function(await(await fetch('../artifact/bundle.js?v=0.8.0')).text())();else startPrototype(html);
  await tick();await tick();assert(variables.chat[PROTO_KEY].current.state.entities.P1.fields.状态==='完成');assert(variables.chat[PROTO_KEY].current.errors.length===0);assert(readSnapshots(variables.chat[PROTO_KEY]).length===count);
  await click('LoreState');assert(document.body.textContent.includes('MiB'));assert(document.body.textContent.includes('共用'));
});
const moduleRules=await(await fetch('../prototype/module-example.txt')).text();
const moduleHtml=await(await fetch('../prototype/module-example.html')).text();
await check('新聊天从模块条目保存配置，预览分类实体并生成真实注入文本',async()=>{
  variables.script={[PROTO_KEY]:{}};variables.chat={[PROTO_KEY]:{enabled:true,start:1}};chatId='module-chat';chatRef=[];list=[{message_id:0,role:'assistant',message:'开场白',swipe_id:0}];
  window.getWorldbook=async()=>[{uid:1,name:'模块状态',content:moduleRules}];
  await emit('CHAT_CHANGED');await click('LoreState');await click('刷新世界书列表');
  document.querySelector('[aria-label="HTML 模板"]').value=moduleHtml;
  await click('预览 HTML（不保存）');assert(!variables.script[PROTO_KEY].schema);
  await click('保存 HTML 并启用本聊天');assert(variables.script[PROTO_KEY].schema.modules.人物.includes('身体状况'));
  controller=new AbortController();await generate();assert(!controller.signal.aborted);assert(authorPromptText.includes('模块目录'));assert(authorPromptText.includes('受伤或恢复'));
});
await check('模块更新在最终 bundle 中跨类提交，下一轮省略无关详细规则',async()=>{
  const token=authorPromptText.match(/read="([a-f\d-]+)"/)[1];
  list.push({message_id:1,role:'assistant',swipe_id:0,message:`正文<LoreState version="3" mode="full" read="${token}"><Shared><地点>港口</地点><时间>清晨</时间></Shared><Entity id="P1" name="林舟" type="人物" identity="书商" mode="full"><身体状况>健康</身体状况><当前目标>返回书店</当前目标></Entity><Entity id="I1" name="铜钥匙" type="物品" identity="仓库钥匙" mode="full"><持有者>守卫</持有者><完好状况>完好</完好状况></Entity></LoreState>`});
  const el=document.createElement('div');el.className='mes';el.setAttribute('mesid','1');document.getElementById('chat').append(el);
  await emit('GENERATION_ENDED');assert(variables.chat[PROTO_KEY].current.errors.length===0);assert(variables.chat[PROTO_KEY].current.state.entities.I1.fields.持有者==='守卫');
  controller=new AbortController();await generate();assert(!controller.signal.aborted);assert(authorPromptText.includes('交付、拾取或遗失'));assert(!authorPromptText.includes('发生明确政治事件'));assert(authorPromptText.includes('国家：政局、外交'));
  const next=authorPromptText.match(/read="([a-f\d-]+)"/)[1];
  list.push({message_id:2,role:'assistant',swipe_id:0,message:`<LoreState version="3" mode="delta" read="${next}"><Entity id="P1" mode="delta"><当前目标>取回钥匙</当前目标></Entity><Entity id="I1" mode="delta"><持有者>林舟</持有者></Entity></LoreState>`});
  const last=document.createElement('div');last.className='mes';last.setAttribute('mesid','2');document.getElementById('chat').append(last);
  await emit('GENERATION_ENDED');assert(variables.chat[PROTO_KEY].current.errors.length===0);assert(variables.chat[PROTO_KEY].current.state.entities.I1.fields.持有者==='林舟');assert(variables.chat[PROTO_KEY].current.state.entities.P1.fields.当前目标==='取回钥匙');
});
await check('隐藏助手隐藏初始化后，最终脚本仍回放、诊断并为生成提供当前状态',async()=>{
  const before=JSON.stringify(variables.chat[PROTO_KEY].current.state);
  const count=readSnapshots(variables.chat[PROTO_KEY]).length;
  list.find(m=>m.message_id===1).is_hidden=true;
  await emit('MESSAGE_UPDATED');
  assert(variables.chat[PROTO_KEY].current.errors.length===0);
  assert(JSON.stringify(variables.chat[PROTO_KEY].current.state)===before);
  assert(readSnapshots(variables.chat[PROTO_KEY]).length===count);
  await click('LoreState');
  const floors=manager.querySelector('select');
  assert([...floors.options].some(o=>o.value==='1'));
  floors.value='1';floors.onchange();assert(manager.textContent.includes('本层更新成功'));
  controller=new AbortController();await generate();assert(!controller.signal.aborted);
  assert(authorPromptText.includes('取回钥匙'));
  assert(list.find(m=>m.message_id===1).is_hidden===true);
});
await check('模块归属变化在请求前中止，状态与快照不被重解释',async()=>{
  const before=JSON.stringify(variables.chat[PROTO_KEY]);
  window.getWorldbook=async()=>[{uid:1,name:'模块状态',content:moduleRules.replace('栏目：政局、外交','栏目：身体状况、外交')}];
  controller=new AbortController();await generate();assert(controller.signal.aborted);assert(JSON.stringify(variables.chat[PROTO_KEY])===before);
  window.getWorldbook=originalWorldbook;
});
const apiKey='lorestate_api_profiles_v1';
let extraCalls=[],extraStops=[],extraPlace='书店',pendingReply;
const extraReply=request=>{const source=request.ordered_prompts.find(item=>item?.content?.includes('<LoreState version="3"'))?.content??request.user_input;const token=source.match(/read="([a-f\d-]+)"/)[1],mode=source.match(/<LoreState version="3" mode="(full|delta)"/)[1];return `<LoreState version="3" mode="${mode}" read="${token}"><Shared><地点>${extraPlace}</地点></Shared></LoreState>`;};
const normalExtra=async request=>{extraCalls.push(request);const count=stops;await generate();assert(stops===count,'独立请求重入宿主钩子不应停止正文控制器');return extraReply(request);};
const input=(label,value)=>{const el=manager.querySelector(`[aria-label="${label}"]`);el.value=value;return el;};
await check('API 预设只存全局，当前聊天独立绑定；保存和删除不影响正文设置',async()=>{
  manager=document.querySelector('[aria-label="LoreState 控制中心"]');notice=document.querySelector('aside[role="alert"]');
  chatId='api-test';chatRef=[];
  variables={global:{keep:'global'},script:{[PROTO_KEY]:{ready:true,schema:{shared:['地点'],entity:[]},html,book:'test-book',uid:1}},chat:{[PROTO_KEY]:{enabled:true,start:1}}};
  list=[{message_id:0,role:'user',message:'去书店'},{message_id:1,role:'assistant',message:'我们抵达书店。',swipe_id:0}];
  window.getWorldbook=async()=>[{uid:1,content:'记录地点'}];window.generateRaw=normalExtra;window.stopGenerationById=id=>{extraStops.push(id);return true;};
  await emit('CHAT_CHANGED');await click('LoreState');await click('API 预设');
  input('API 预设名称','A');input('API 地址','https://example.com/v1/chat/completions');input('API 密钥','synthetic-private-key');input('API 模型名称','model-A');await click('保存 API 预设');
  assert(variables.global[apiKey],notice.textContent+' / '+manager.querySelector('#ls-page-api').textContent);const first=variables.global[apiKey].profiles[0];assert(first.url==='https://example.com/v1');
  input('状态更新方式','extra');input('状态更新 API 预设',first.id);await click('保存状态更新绑定');
  input('API 预设名称','B');input('API 模型名称','model-B');await click('另存为新 API 预设');
  assert(variables.chat[PROTO_KEY].variableUpdate.profileId===first.id);assert(variables.global.keep==='global');
  assert(!JSON.stringify(variables.script).includes('synthetic-private-key'));assert(!JSON.stringify(variables.chat).includes('synthetic-private-key'));
  await click('删除 API 预设');assert(variables.global[apiKey].profiles.length===1);
});
await check('额外模型初次更新、重试与撤销保留正文；重试始终读取本轮前态',async()=>{
  await click('重新更新最新回复状态');const firstDiagnostic=manager.querySelector('textarea[aria-label="最近一次 LoreState 更新诊断"]')?.value??'';assert(variables.chat[PROTO_KEY].current?.state?.shared?.地点==='书店',notice.textContent+'\n'+firstDiagnostic);assert(firstDiagnostic.includes('validated-success'));assert(list[1].message.startsWith('我们抵达书店。'));
  assert(extraCalls.at(-1).custom_api.model==='model-A');assert(extraCalls.at(-1).max_chat_history===0);
  const first=list[1].message;extraPlace='公园';await click('重新更新最新回复状态');assert(variables.chat[PROTO_KEY].current.state.shared.地点==='公园');
  assert(extraCalls.at(-1).ordered_prompts.some(item=>item?.content?.includes('尚未建立')));assert((list[1].message.match(/<LoreState /g)||[]).length===1);
  await click('撤销最近一次状态更新');assert(list[1].message===first);assert(variables.chat[PROTO_KEY].current.state.shared.地点==='书店');
});
await check('状态请求失败或输出不合法不覆盖消息，日志不泄露请求密钥',async()=>{
  const before=list[1].message;
  window.generateRaw=async()=>{throw new Error('synthetic-private-key raw provider error');};await click('重新更新最新回复状态');assert(list[1].message===before);assert(!notice.textContent.includes('synthetic-private-key'));
  let diagnostic=manager.querySelector('textarea[aria-label="最近一次 LoreState 更新诊断"]');assert(diagnostic.value.includes('request-error'));assert(diagnostic.value.includes('[REDACTED]'));assert(!diagnostic.value.includes('synthetic-private-key'));
  window.generateRaw=async()=>'<LoreState version="3" mode="full"></LoreState>';await click('重新更新最新回复状态');assert(list[1].message===before);assert(notice.textContent.includes('校验'));
  diagnostic=manager.querySelector('textarea[aria-label="最近一次 LoreState 更新诊断"]');assert(diagnostic.value.includes('validation-failed'));assert(diagnostic.value.includes('mode 或读取凭据不匹配'));assert(diagnostic.value.includes('<LoreState version="3" mode="full"></LoreState>'));
  window.generateRaw=normalExtra;
});
await check('请求中编辑消息、切换分支或修改绑定拒绝迟到结果',async()=>{
  for(const mutate of [()=>{list[1].message+='手工编辑';},()=>{list[1].swipe_id=1;},()=>{variables.chat[PROTO_KEY].variableUpdate.profileId='missing';}]){
    const baseline=structuredClone(list),binding=structuredClone(variables.chat[PROTO_KEY].variableUpdate);
    window.generateRaw=request=>new Promise(resolve=>{pendingReply=()=>resolve(extraReply(request));});
    const running=button('重新更新最新回复状态').onclick();await tick();mutate();const changed=JSON.stringify(list);pendingReply();await running;assert(JSON.stringify(list)===changed);assert(notice.textContent.includes('变化')||notice.textContent.includes('不存在'));
    list=baseline;variables.chat[PROTO_KEY].variableUpdate=binding;
  }
  window.generateRaw=normalExtra;
});
await check('手动取消请求后迟到结果不写入，也不影响下一次重试',async()=>{
  const original=list[1].message;
  window.generateRaw=request=>new Promise(resolve=>{pendingReply=()=>resolve(extraReply(request));});
  const running=button('重新更新最新回复状态').onclick();await tick();const late=pendingReply;await click('取消状态更新');await running;assert(extraStops.length>0);late();await tick();assert(list[1].message===original);
  window.generateRaw=normalExtra;extraPlace='书店';await click('重新更新最新回复状态');assert(variables.chat[PROTO_KEY].current.state.shared.地点==='书店');
});
await check('自动更新只在正文成功结束后运行一次；消息渲染或重载不重复请求',async()=>{
  const calls=extraCalls.length;controller=new AbortController();await generate();assert(!controller.signal.aborted);assert(authorPromptText.includes('仅输出剧情正文'));assert(!authorPromptText.includes('<LoreState version='));
  await emit('GENERATION_STARTED');list.push({message_id:2,role:'user',message:'去公园'},{message_id:3,role:'assistant',swipe_id:0,message:'我们来到了公园。'});extraPlace='公园';
  await emit('MESSAGE_RECEIVED');assert(extraCalls.length===calls);
  await emit('GENERATION_ENDED');await tick();await tick();assert(extraCalls.length===calls+1);assert(variables.chat[PROTO_KEY].current.state.shared.地点==='公园');
  for(const name of ['MESSAGE_UPDATED','CHARACTER_MESSAGE_RENDERED','GENERATION_ENDED'])await emit(name);
  assert(extraCalls.length===calls+1);
});
await check('请求超时按请求编号取消，写入失败不宣称更新成功',async()=>{
  const original=list.at(-1).message,nativeTimeout=window.setTimeout;let timeout;
  window.setTimeout=(fn,ms,...args)=>{if(ms===120000){timeout=fn;return nativeTimeout(()=>{},120000);}return nativeTimeout(fn,ms,...args);};
  window.generateRaw=request=>new Promise(resolve=>{pendingReply=()=>resolve(extraReply(request));});
  try{const running=button('重新更新最新回复状态').onclick();await tick();timeout();await running;pendingReply();await tick();assert(list.at(-1).message===original);assert(notice.textContent.includes('超时'));}
  finally{window.setTimeout=nativeTimeout;window.generateRaw=normalExtra;}
  const write=window.setChatMessages;window.setChatMessages=async()=>{throw new Error('模拟消息写入失败');};
  try{await click('重新更新最新回复状态');assert(list.at(-1).message===original);assert(notice.textContent.includes('写入失败'));}
  finally{window.setChatMessages=write;}
});
await check('正文中止不自动调用状态模型，暂停后不接收自动更新',async()=>{
  const calls=extraCalls.length;controller=new AbortController();await generate();await emit('GENERATION_STARTED');
  list.push({message_id:4,role:'assistant',swipe_id:0,message:'未完成正文'});await emit('GENERATION_STOPPED');await emit('GENERATION_ENDED');assert(extraCalls.length===calls);list.pop();
  controller=new AbortController();await generate();variables.chat[PROTO_KEY].enabled=false;
  list.push({message_id:4,role:'assistant',swipe_id:0,message:'暂停后的正文'});await emit('GENERATION_ENDED');assert(extraCalls.length===calls);list.pop();variables.chat[PROTO_KEY].enabled=true;
});
await check('重抽自动更新从上一轮状态计算，不保留被替换分支的状态',async()=>{
  controller=new AbortController();await generate('swipe');assert(!controller.signal.aborted);const calls=extraCalls.length;
  list.at(-1).message='这次走到了海边。';extraPlace='海边';await emit('GENERATION_ENDED');await tick();await tick();
  assert(extraCalls.length===calls+1);assert(extraCalls.at(-1).ordered_prompts.some(item=>item?.content?.includes('书店')));assert(variables.chat[PROTO_KEY].current.state.shared.地点==='海边');
});
await check('请求期间更改世界书规则拒绝写回；已有后续消息不能撤销旧更新',async()=>{
  const original=list.at(-1).message,worldbook=window.getWorldbook;
  window.generateRaw=request=>new Promise(resolve=>{pendingReply=()=>resolve(extraReply(request));});
  const running=button('重新更新最新回复状态').onclick();await tick();window.getWorldbook=async()=>[{uid:1,content:'改过的规则'}];pendingReply();await running;assert(list.at(-1).message===original);assert(notice.textContent.includes('规则已变化'));
  window.getWorldbook=worldbook;window.generateRaw=normalExtra;
  list.push({message_id:4,role:'user',message:'后续输入'});await click('撤销最近一次状态更新');assert(list.at(-2).message===original);assert(notice.textContent.includes('历史已变化'));list.pop();
});
await check('请求中切换聊天会取消旧请求，迟到结果不污染新聊天',async()=>{
  window.generateRaw=request=>new Promise(resolve=>{pendingReply=()=>resolve(extraReply(request));});
  const running=button('重新更新最新回复状态').onclick();await tick();const late=pendingReply;
  chatId='api-other';chatRef=[];list=[{message_id:1,role:'assistant',swipe_id:0,message:wrap('新聊天','full')}];variables.chat={[PROTO_KEY]:{enabled:true,start:1}};
  await emit('CHAT_CHANGED');await running;late();await tick();assert(list[0].message===wrap('新聊天','full'));assert(!variables.chat[PROTO_KEY].variableUpdateBackup);assert(!manager.open);
  assert(!variables.chat[PROTO_KEY].variableUpdate);window.generateRaw=normalExtra;
});
await check('API 设置 JSON 重载后可读取；失效绑定禁止请求且不回退',async()=>{
  variables=JSON.parse(JSON.stringify(variables));await click('LoreState');await click('API 预设');assert(manager.querySelector('[aria-label="编辑 API 预设"]').options.length===2);
  variables.chat[PROTO_KEY].variableUpdate={mode:'extra',profileId:'deleted'};const before=extraCalls.length;await click('重新更新最新回复状态');assert(extraCalls.length===before);assert(notice.textContent.includes('不存在'));
});
let presetRevision=1,presetCalls=[];
window.getPresetNames=()=>['整理测试'];window.getPreset=name=>({name,revision:presetRevision});
window.generate=async request=>{presetCalls.push(request);await generate();return extraReply({...request,ordered_prompts:[{content:request.user_input}]});};
await check('状态术语统一；请求参数保存重载，当前和指定预设均真实接入请求',async()=>{
  list.at(-1).message='我们在车站休息。\n'+list.at(-1).message;
  variables.chat[PROTO_KEY].variableUpdate={mode:'extra',profileId:variables.global[apiKey].profiles[0].id};await click('API 预设');
  assert(!document.querySelector('#ls-page-api').textContent.includes('\u53d8\u91cf'));
  input('请求预设','current');input('状态模型来源','current');input('请求总次数','2');input('总超时（秒）','180');input('自动更新','').checked=false;input('兼容流式响应','').checked=true;
  await click('保存状态更新绑定');variables=JSON.parse(JSON.stringify(variables));await click('API 预设');
  assert(input('请求总次数','2').value==='2');assert(manager.querySelector('[aria-label="自动更新"]').checked===false);
  extraPlace='内置测试地点';await click('重新更新最新回复状态');assert(presetCalls.length===1,'请求次数 '+presetCalls.length+' / '+notice.textContent);assert(presetCalls[0].preset_name==='in_use','预设名称');assert(!presetCalls[0].custom_api,'自定义API应省略');assert(presetCalls[0].should_stream===true,'流式开关');assert(variables.chat[PROTO_KEY].current.state.shared.地点==='内置测试地点','状态未写入 / '+notice.textContent);
  input('请求预设','named');input('目标酒馆预设','整理测试');await click('保存状态更新绑定');await click('重新更新最新回复状态');assert(presetCalls.at(-1).preset_name==='整理测试','指定预设 / '+notice.textContent);
});
await check('关闭自动更新不请求，手动仍可更新；状态请求失败按次数重试并只提交一次',async()=>{
  const count=presetCalls.length;controller=new AbortController();await generate();list.push({message_id:2,role:'assistant',swipe_id:0,message:'我们返回车站。'});await emit('GENERATION_ENDED');await tick();assert(presetCalls.length===count);
  let tries=0,ids=[];window.generate=async request=>{tries++;ids.push(request.generation_id);if(tries===1)throw new Error('synthetic provider failure');return extraReply({...request,ordered_prompts:[{content:request.user_input}]});};
  await click('重新更新最新回复状态');assert(tries===2);assert(new Set(ids).size===2);assert((list.at(-1).message.match(/<LoreState /g)||[]).length===1);
  tries=0;window.generate=async()=>{tries++;return '不合法响应';};const original=list.at(-1).message;await click('重新更新最新回复状态');assert(tries===2);assert(list.at(-1).message===original);
});
await check('预设编辑或取消终止整个重试流程，迟到结果不提交',async()=>{
  let tries=0;window.generate=request=>{tries++;return new Promise(resolve=>{pendingReply=()=>resolve(extraReply({...request,ordered_prompts:[{content:request.user_input}]}));});};
  const original=list.at(-1).message;
  let running=button('重新更新最新回复状态').onclick();await tick();presetRevision++;pendingReply();await running;assert(tries===1);assert(list.at(-1).message===original);assert(notice.textContent.includes('预设或当前连接已变化'));
  running=button('重新更新最新回复状态').onclick();await tick();const late=pendingReply;await click('取消状态更新');await running;late();await tick();assert(tries===2);assert(list.at(-1).message===original);
});
await check('模型列表经指定地址读取并选择保存，切换地址后拒绝旧列表',async()=>{
  await click('API 预设');const p=variables.global[apiKey].profiles[0];input('编辑 API 预设',p.id).onchange();let request;
  window.getModelList=async value=>{request=value;return ['model-A','model-C','model-C'];};await click('获取模型列表');assert(request.apiurl===p.url);assert(request.key===p.key);
  input('可用模型','model-C').onchange();input('Top P','0.7');input('Top K','40');input('频率惩罚','0.2');input('存在惩罚','-0.1');await click('保存 API 预设');assert(variables.global[apiKey].profiles[0].model==='model-C');assert(variables.global[apiKey].profiles[0].topP===0.7);
  window.getModelList=()=>new Promise(resolve=>{pendingReply=()=>resolve(['obsolete-model']);});const running=button('获取模型列表').onclick();await tick();input('API 地址','https://other.example/v1').oninput();pendingReply();await running;assert(!manager.querySelector('[aria-label="可用模型"]').textContent.includes('obsolete-model'));
});
let continuationPrompt='';
async function resetContinuation(mode='inline',auto=true){
  chatId='continuation-'+Math.random();chatRef=[];
  variables.script[PROTO_KEY]={ready:true,schema:{shared:['地点'],entity:[]},html,book:'test-book',uid:1};
  variables.chat={[PROTO_KEY]:{enabled:true,start:1,variableUpdate:{mode,source:'current',presetMode:'builtin',auto}}};
  list=[{message_id:0,role:'user',message:'出门'},{message_id:1,role:'assistant',swipe_id:0,message:'抵达车站。'+wrap('车站','full')}];
  window.injectPrompts=items=>{continuationPrompt=items[0].content;return {uninject(){}};};
  window.generateRaw=normalExtra;controller=new AbortController();await emit('CHAT_CHANGED');
}
await check('随正文连续两次同层续写，从本层前态重算且始终只有一个状态块',async()=>{
  await resetContinuation();
  for(const place of ['书店','港口']){
    await emit('GENERATION_STARTED');await generate('continue');assert(!controller.signal.aborted);
    assert(continuationPrompt.includes('该回复开始前的状态'));
    const token=continuationPrompt.match(/read="([a-f\d-]+)"/)[1];
    list[1].message+='随后前往'+place+wrap(place,'full').replace('mode="full"',`mode="full" read="${token}"`);
    await emit('GENERATION_ENDED');await tick();
    assert(!variables.chat[PROTO_KEY].continuationPending);assert(variables.chat[PROTO_KEY].current.state.shared.地点===place);
    assert((list[1].message.match(/<LoreState /g)||[]).length===1);
  }
  assert(list[1].message.includes('抵达车站。随后前往书店随后前往港口'));
});
await check('额外模式同层续写自动更新一次，收到完整正文且不重复应用原块',async()=>{
  await resetContinuation('extra');extraPlace='港口';const count=extraCalls.length;
  await emit('GENERATION_STARTED');await generate('continue');list[1].message+='又到了港口。';
  await emit('GENERATION_ENDED');await tick();await emit('GENERATION_ENDED');
  assert(extraCalls.length===count+1);assert(extraCalls.at(-1).user_input.includes('抵达车站。又到了港口。'));
  assert(variables.chat[PROTO_KEY].current.state.shared.地点==='港口');assert((list[1].message.match(/<LoreState /g)||[]).length===1);
});
await check('关闭自动更新及停止部分续写，保留新增正文并显示状态缺口，可手动补算',async()=>{
  for(const stopped of [false,true]){
    await resetContinuation('extra',stopped);const count=extraCalls.length;
    await emit('GENERATION_STARTED');await generate('continue');list[1].message+='新增剧情';
    await emit(stopped?'GENERATION_STOPPED':'GENERATION_ENDED');await emit('GENERATION_ENDED');await tick();
    assert(extraCalls.length===count);assert(list[1].message==='抵达车站。新增剧情');assert(variables.chat[PROTO_KEY].current.errors.length===1);
    await click('重新更新最新回复状态');assert(variables.chat[PROTO_KEY].current.errors.length===0);
  }
});
await check('无新增内容的停止不改变原回复；非法续写状态块不会复用旧状态',async()=>{
  await resetContinuation();const original=list[1].message;
  await emit('GENERATION_STARTED');await generate('continue');await emit('GENERATION_STOPPED');assert(list[1].message===original);
  await emit('GENERATION_STARTED');await generate('continue');list[1].message+='新增剧情'+wrap('错误地点');await emit('GENERATION_ENDED');
  assert(variables.chat[PROTO_KEY].current.errors.length===1);assert(!list[1].message.includes('<LoreState'));
});
await check('快照回档后额外模式新回复、重算、撤销与同层续写共用回档基线',async()=>{
  await resetContinuation('extra');list.push({message_id:2,role:'assistant',swipe_id:0,message:'旧未来'+wrap('未来')});await emit('MESSAGE_UPDATED');await click('LoreState');
  const select=manager.querySelector('[aria-label="历史状态快照"]');select.value=readSnapshots(variables.chat[PROTO_KEY]).find(s=>s.floor===1).id;
  await click('预览快照回档');await click('确认回档');const prefix=JSON.stringify(list);
  await click('重新更新最新回复状态');assert(JSON.stringify(list)===prefix);assert(notice.textContent.includes('回档前保留'));
  for(const type of ['continue','swipe','regenerate']){controller=new AbortController();await generate(type);assert(controller.signal.aborted);}
  controller=new AbortController();await emit('GENERATION_STARTED');await generate();assert(!controller.signal.aborted);extraPlace='新分支';
  list.push({message_id:3,role:'user',message:'继续旅行'},{message_id:4,role:'assistant',swipe_id:0,message:'新旅程'});await emit('GENERATION_ENDED');await tick();
  assert(extraCalls.at(-1).ordered_prompts.some(item=>item?.content?.includes('<地点>车站</地点>')));
  assert(variables.chat[PROTO_KEY].current.state.shared.地点==='新分支');assert(JSON.stringify(list.slice(0,3))===prefix);
  await click('撤销最近一次状态更新');assert(list.at(-1).message==='新旅程');await click('重新更新最新回复状态');
  await emit('GENERATION_STARTED');await generate('continue');list.at(-1).message+='续写新旅程';extraPlace='新终点';await emit('GENERATION_ENDED');await tick();
  assert(variables.chat[PROTO_KEY].current.state.shared.地点==='新终点');assert(JSON.stringify(list.slice(0,3))===prefix);
});
await check('未完成续写重载后自动整理，不把旧块当作新剧情状态',async()=>{
  await resetContinuation('extra',false);await emit('GENERATION_STARTED');await generate('continue');list[1].message+='重载前新增';
  variables.chat=JSON.parse(JSON.stringify(variables.chat));window.dispatchEvent(new Event('pagehide'));handlers.clear();
  if(new URLSearchParams(location.search).has('bundle'))Function(await(await fetch('../artifact/bundle.js')).text())();else startPrototype(html);
  await tick();await tick();manager=document.querySelector('[aria-label="LoreState 控制中心"]');notice=document.querySelector('aside[role="alert"]');
  assert(!variables.chat[PROTO_KEY].continuationPending);assert(list[1].message==='抵达车站。重载前新增');assert(variables.chat[PROTO_KEY].current.errors.length===1);
});
await check('续写写入失败可重试；消息已写入而完成标记保存失败时能恢复',async()=>{
  for(const committed of [false,true]){
    await resetContinuation('extra',false);await emit('GENERATION_STARTED');await generate('continue');list[1].message+='待保存剧情';
    const write=window.setChatMessages,save=window.updateVariablesWith;let wrote=false;
    window.setChatMessages=async edits=>{if(!committed)throw new Error('模拟消息保存失败');await write(edits);wrote=true;};
    window.updateVariablesWith=(fn,options)=>{if(wrote)throw new Error('模拟完成标记保存失败');return save(fn,options);};
    await emit('GENERATION_ENDED');await tick();assert(variables.chat[PROTO_KEY].continuationPending);
    window.setChatMessages=write;window.updateVariablesWith=save;
    await emit('MESSAGE_UPDATED');await tick();assert(!variables.chat[PROTO_KEY].continuationPending);assert(list[1].message==='抵达车站。待保存剧情');
  }
});
await check('续写时切换分支不覆盖，恢复原分支后可以完成整理',async()=>{
  await resetContinuation('extra',false);await emit('GENERATION_STARTED');await generate('continue');const original=list[1].message;
  list[1].swipe_id=1;list[1].message='其他分支';await emit('GENERATION_ENDED');assert(list[1].message==='其他分支');assert(variables.chat[PROTO_KEY].continuationPending);
  list[1].swipe_id=0;list[1].message=original+'原分支续写';await emit('MESSAGE_UPDATED');assert(!variables.chat[PROTO_KEY].continuationPending);assert(list[1].message==='抵达车站。原分支续写');
});
output.textContent=results.join('\n');
// ?preview[=state|diagnostics|settings|api] leaves the control center open for a visual check.
const preview=new URLSearchParams(location.search).get('preview');
if(preview!==null){await click('LoreState');document.querySelector('#ls-tab-'+(preview||'state'))?.click();}
window.testResults=results;
