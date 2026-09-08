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
  SillyTavern:{getContext:()=>({chat:chatRef,getCurrentChatId:()=>chatId})},
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
const manager=document.querySelector('[aria-label="LoreState 控制中心"]'),notice=document.querySelector('aside[role="alert"]');
await check('启动立即告警并显示具体错误楼层',async()=>{
  assert(!notice.hidden);assert(notice.textContent.includes('第 3 楼'));
  await click('查看诊断',notice);assert(manager.open);assert(manager.querySelector('select').value==='3');manager.close();
});
await check('魔法棒管理器查看旧楼层，不显示未来状态',async()=>{
  await click('LoreState');assert(manager.open);
  await click('上一 AI 层',manager);assert(manager.textContent.includes('车站'));assert(manager.textContent.includes('本层更新成功'));
});
await check('单入口、三页签、设置草稿和键盘导航',async()=>{
  assert(document.querySelectorAll('#extensionsMenu button').length===1);
  const tabs=[...manager.querySelectorAll('[role="tab"]')];assert(tabs.length===3);
  tabs[2].click();await tick();assert(!document.getElementById('lorestate-prototype-settings').hidden);assert(document.getElementById('ls-page-state').hidden);
  const editor=manager.querySelector('[aria-label="HTML 模板"]');const original=editor.value;editor.value='未保存草稿';
  tabs[0].click();tabs[2].click();await tick();assert(editor.value==='未保存草稿');editor.value=original;
  tabs[2].dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert(tabs[0].getAttribute('aria-selected')==='true');
  tabs[1].click();assert(!document.getElementById('ls-page-diagnostics').hidden);
});
await check('336px 窄容器三个页面均无横向溢出',async()=>{
  manager.style.width='336px';
  for(const tab of manager.querySelectorAll('[role="tab"]')){tab.click();await tick();assert(manager.scrollWidth<=manager.clientWidth+1,'页面横向溢出：'+tab.textContent);}
  manager.style.width='';manager.querySelector('#ls-tab-diagnostics').click();
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
await check('同层续写在读取世界书前中止，不改变历史或状态',async()=>{
  controller=new AbortController();const count=stops,before=JSON.stringify(variables.chat),history=JSON.stringify(list);let reads=0;
  window.getWorldbook=async()=>{reads++;return [];};
  try{await generate('continue');assert(controller.signal.aborted&&stops===count+1&&reads===0);assert(JSON.stringify(variables.chat)===before&&JSON.stringify(list)===history);}
  finally{window.getWorldbook=originalWorldbook;}
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
output.textContent=results.join('\n');if(new URLSearchParams(location.search).has('preview'))await click('LoreState');window.testResults=results;
