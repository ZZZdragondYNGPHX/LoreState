import {startPrototype} from '../prototype/runtime.js';
import {PROTO_KEY} from '../prototype/core.js';
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
  const source=await(await fetch('../artifact/bundle.js?v=0.6.0')).text();Function(source)();
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
  const saved=variables.chat[PROTO_KEY].snapshots;assert(saved.length===2);
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
  const count=variables.chat[PROTO_KEY].snapshots.length;
  variables.chat=JSON.parse(JSON.stringify(variables.chat));
  window.dispatchEvent(new Event('pagehide'));handlers.clear();startPrototype(html);await tick();await tick();
  assert(variables.chat[PROTO_KEY].snapshots.length===count);
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
output.textContent=results.join('\n');if(new URLSearchParams(location.search).has('preview'))await click('LoreState');window.testResults=results;
