import { uiCard, uiActions } from './ui-kit.js';

// Presentation only: no host data writes or persisted navigation state.
export function createControlCenter({doc,manager,panel,summary,status,floorSelect,details,diagnostics,repairBox,snapshotPanel,apiPanel,loadApi,actions,loadSettings,settingsGroups}) {
  const make=(tag,text,parent)=>{const el=doc.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;};
  manager.replaceChildren();manager.removeAttribute('style');manager.setAttribute('aria-label','LoreState 控制中心');
  panel.removeAttribute('style');
  const style=make('style',null,manager);style.textContent=`
  #lorestate-state-manager{--ls-bg:#20251f;--ls-surface:#2a3028;--ls-card:#262c25;--ls-soft:#39412f;--ls-line:#485343;--ls-muted:#b6c0b0;--ls-accent:#d5e5ae;--ls-warn:#efb06a;box-sizing:border-box;width:min(880px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--ls-line);border-radius:16px;background:var(--ls-bg);color:#f1f3ed;font:15px/1.6 system-ui,sans-serif;overflow:auto;color-scheme:dark}
  #lorestate-state-manager::backdrop{background:#10150fc9}
  #lorestate-state-manager *{box-sizing:border-box;min-width:0}
  #lorestate-state-manager [hidden]{display:none!important}
  #lorestate-state-manager h2,#lorestate-state-manager h3,#lorestate-state-manager h4,#lorestate-state-manager p{margin:0 0 12px;overflow-wrap:anywhere}
  #lorestate-state-manager h2{font-size:21px;letter-spacing:.02em;margin:0}
  #lorestate-state-manager h3{font-size:17px;margin:0 0 12px}
  #lorestate-state-manager h4{font-size:13px;color:var(--ls-muted);margin:16px 0 4px}
  /* Header and tabs stay reachable while a long page scrolls underneath. */
  #lorestate-state-manager .ls-top{position:sticky;top:0;z-index:3;background:var(--ls-bg);border-bottom:1px solid var(--ls-line)}
  #lorestate-state-manager .ls-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px 10px;gap:16px}
  #lorestate-state-manager .ls-header p{font-size:13px;color:var(--ls-muted);margin:0}
  #lorestate-state-manager .ls-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 24px 12px;padding:4px;border:1px solid var(--ls-line);border-radius:12px;background:var(--ls-surface)}
  #lorestate-state-manager .ls-tabs button{flex:1 1 0;min-height:44px;padding:8px 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--ls-muted);font-size:14px}
  #lorestate-state-manager .ls-tabs button:hover{color:#f1f3ed;background:#333a30;border-color:transparent}
  #lorestate-state-manager .ls-tabs button[aria-selected=true]{background:var(--ls-accent);color:#202719;font-weight:600}
  #lorestate-state-manager button{font:inherit;line-height:1.3;min-height:44px;max-width:100%;margin:0;padding:10px 14px;border:1px solid var(--ls-line);border-radius:9px;background:var(--ls-surface);color:inherit;cursor:pointer}
  #lorestate-state-manager button:hover{border-color:var(--ls-accent)}#lorestate-state-manager button:disabled{opacity:.45;cursor:default}
  #lorestate-state-manager button[aria-selected=true],#lorestate-state-manager .ls-primary{background:var(--ls-accent);color:#202719;border-color:var(--ls-accent);font-weight:600}
  #lorestate-state-manager .ls-danger{color:var(--ls-warn)}
  #lorestate-state-manager :is(button,select,input,textarea,summary):focus-visible{outline:2px solid var(--ls-accent);outline-offset:3px}
  #lorestate-state-manager .ls-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:16px 24px 0}
  #lorestate-state-manager .ls-toolbar label{display:flex;gap:10px;align-items:center;margin:0 auto 0 0}
  #lorestate-state-manager .ls-body{padding:20px 24px 24px}
  #lorestate-state-manager .ls-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
  #lorestate-state-manager select,#lorestate-state-manager input,#lorestate-state-manager textarea{font:inherit;width:100%;max-width:100%;min-height:44px;border:1px solid var(--ls-line);border-radius:8px;background:#171c16;color:inherit;padding:10px}
  #lorestate-state-manager select{width:auto}
  #lorestate-state-manager label{display:block;margin:12px 0 6px;color:var(--ls-muted);font-size:13px}
  #lorestate-state-manager label :is(select,textarea,input){display:block;width:100%;margin-top:6px;font-size:15px}
  /* Host themes strip the native tick and hit area; restore a real checkbox. */
  #lorestate-state-manager .ls-check{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin:8px 0 0;padding:8px 12px;border:1px solid var(--ls-line);border-radius:9px;background:var(--ls-surface);color:#f1f3ed;font-size:15px;cursor:pointer}
  #lorestate-state-manager label input[type=checkbox]{flex:0 0 auto;display:inline-block;width:22px;height:22px;min-height:22px;padding:0;vertical-align:middle;margin:0 0 0 12px;-webkit-appearance:checkbox;appearance:auto;background:initial;border:initial;border-radius:initial;box-shadow:none;accent-color:var(--ls-accent);cursor:pointer;touch-action:manipulation}
  #lorestate-state-manager label input[type=checkbox]::before{content:none!important}
  #lorestate-state-manager .ls-card{margin:0 0 12px;padding:0;border:1px solid var(--ls-line);border-radius:12px;background:var(--ls-card);overflow:hidden}
  #lorestate-state-manager .ls-card>summary{display:block;min-height:44px;padding:13px 16px;cursor:pointer;list-style:none}
  #lorestate-state-manager .ls-card>summary::-webkit-details-marker{display:none}
  #lorestate-state-manager .ls-card>summary:hover{background:#2d3429}
  #lorestate-state-manager .ls-card[open]>summary{border-bottom:1px solid var(--ls-line)}
  #lorestate-state-manager .ls-card-row{display:flex;align-items:center;gap:10px}
  #lorestate-state-manager .ls-step{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:var(--ls-soft);color:var(--ls-accent);font-size:13px;font-weight:700}
  #lorestate-state-manager .ls-card-title{font-size:15px;font-weight:600}
  #lorestate-state-manager .ls-chevron{display:inline-block;margin-left:auto;color:var(--ls-muted);font-size:13px;transition:transform .15s ease}
  #lorestate-state-manager .ls-card[open] .ls-chevron{transform:rotate(180deg)}
  #lorestate-state-manager .ls-hint{display:block;margin-top:4px;color:var(--ls-muted);font-size:12.5px;line-height:1.5}
  #lorestate-state-manager .ls-card-body{padding:4px 16px 16px}
  #lorestate-state-manager .ls-note{margin:10px 0 0;color:var(--ls-muted);font-size:13px}
  #lorestate-state-manager .ls-subhead{margin:16px 0 0;color:var(--ls-muted);font-size:12px;letter-spacing:.06em}
  #lorestate-state-manager .ls-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:0 16px}
  #lorestate-state-manager .ls-health{margin:0 0 16px;padding:12px 16px;border-left:3px solid var(--ls-accent);border-radius:8px;background:var(--ls-surface);font-size:14px}
  #lorestate-state-manager .ls-health[data-error=true]{border-color:var(--ls-warn)}
  #lorestate-state-manager textarea{display:block;min-height:140px;resize:vertical;font:13px/1.6 ui-monospace,monospace;margin:6px 0 0}
  #lorestate-state-manager details:not(.ls-card){margin:14px 0 0;padding:12px 0 0;border-top:1px solid var(--ls-line)}
  #lorestate-state-manager summary{cursor:pointer;font-weight:600;min-height:32px}
  #lorestate-state-manager pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
  #lorestate-state-manager .ls-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:16px;margin:16px 0}
  #lorestate-state-manager dt{font-size:13px;color:var(--ls-muted)}#lorestate-state-manager dd{margin:4px 0 0;overflow-wrap:anywhere}
  @media(prefers-reduced-motion:reduce){#lorestate-state-manager .ls-chevron{transition:none}}
  @media(max-width:520px){#lorestate-state-manager .ls-header{padding:14px 14px 8px}#lorestate-state-manager .ls-tabs{margin:0 14px 10px}#lorestate-state-manager .ls-tabs button{padding:8px 4px;font-size:13px}#lorestate-state-manager .ls-toolbar{padding:12px 14px 0}#lorestate-state-manager .ls-body{padding:14px}#lorestate-state-manager .ls-toolbar label{width:100%;margin-right:0}#lorestate-state-manager .ls-toolbar select{flex:1}#lorestate-state-manager .ls-card>summary{padding:12px}#lorestate-state-manager .ls-card-body{padding:4px 12px 14px}#lorestate-state-manager .ls-actions button{flex:1 1 140px}}
  `;
  const top=make('div',null,manager);top.className='ls-top';
  const header=make('header',null,top);header.className='ls-header';
  const brand=make('div',null,header);make('h2','LoreState',brand);make('p','文字状态 · 历史与维护',brand);
  const exit=make('button','关闭',header);exit.type='button';exit.onclick=()=>manager.close();
  const nav=make('div',null,top);nav.className='ls-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','LoreState 功能');
  const toolbar=make('div',null,manager);toolbar.className='ls-toolbar';const floorLabel=make('label','AI 楼层',toolbar);floorLabel.append(floorSelect);
  for(const title of ['上一 AI 层','下一 AI 层','返回最新','定位聊天消息'])toolbar.append(actions.get(title));
  const body=make('div',null,manager);body.className='ls-body';
  summary.className='ls-health';body.append(summary);
  const statePage=make('section',null,body),repairPage=make('section',null,body);body.append(panel);
  statePage.append(details);repairPage.append(diagnostics);
  const card=(parent,options)=>uiCard(doc,parent,options);
  const act=titles=>titles.map(title=>actions.get(title)).filter(Boolean);
  // Diagnostics page: the report for the selected floor first, then repair tools.
  uiActions(doc,card(repairPage,{title:'检查与报告',hint:'重新回放全部楼层，或复制一份不含正文的诊断报告。',open:true}),act(['重新校验全部楼层','复制诊断报告']));
  const repair=card(repairPage,{title:'基础格式修复',hint:'只处理可以确定的格式问题；先预览并核对原文，再应用修复。',open:true});
  uiActions(doc,repair,act(['预览基础格式修复','应用预览修复']));repair.append(repairBox);
  uiActions(doc,card(repairPage,{title:'修复备份',hint:'查看上一次格式修复的原文，或把这条回复还原回去。'}),act(['查看格式修复备份','撤销最近一次格式修复']));
  if(snapshotPanel)card(repairPage,{title:'历史快照与回档',hint:'回到某一楼的完整状态；正文保留，旧剧情仍在上下文中。',open:true}).append(snapshotPanel);
  // Move the original controls; handlers and unconfirmed drafts stay intact.
  panel.replaceChildren(status);status.className='ls-health';
  settingsGroups.forEach((group,index)=>{
    const box=card(panel,{title:group.title,hint:group.hint,step:index+1,open:index===0});
    for(const item of group.items)if(Array.isArray(item))uiActions(doc,box,item);else box.append(item);
  });
  for(const title of ['保存 HTML 并启用本聊天','应用预览修复'])actions.get(title)?.classList.add('ls-primary');
  for(const title of ['删除所选预设','暂停本聊天'])actions.get(title)?.classList.add('ls-danger');
  if(apiPanel)body.append(apiPanel);
  const pages={state:statePage,diagnostics:repairPage,settings:panel,...(apiPanel?{api:apiPanel}:{})},tabs={};let active='state';
  function select(id,focus=false){active=id;for(const [key,page] of Object.entries(pages)){page.hidden=key!==id;tabs[key].setAttribute('aria-selected',String(key===id));tabs[key].tabIndex=key===id?0:-1;}toolbar.hidden=['settings','api'].includes(id);summary.hidden=toolbar.hidden;if(focus)tabs[id].focus();}
  for(const [id,title] of [['state','状态历史'],['diagnostics','诊断修复'],['settings','设置'],...(apiPanel?[['api','API 预设']]:[])]){
    const tab=make('button',title,nav);tab.type='button';tab.id='ls-tab-'+id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','ls-page-'+id);tabs[id]=tab;
    pages[id].id=id==='settings'?'lorestate-prototype-settings':'ls-page-'+id;tab.setAttribute('aria-controls',pages[id].id);pages[id].setAttribute('role','tabpanel');pages[id].setAttribute('aria-labelledby',tab.id);
    tab.onclick=()=>{select(id);if(id==='settings')void loadSettings();if(id==='api')loadApi?.();};
    tab.onkeydown=e=>{const keys=Object.keys(pages),i=keys.indexOf(active);let next;if(e.key==='ArrowRight')next=keys[(i+1)%keys.length];if(e.key==='ArrowLeft')next=keys[(i+keys.length-1)%keys.length];if(e.key==='Home')next=keys[0];if(e.key==='End')next=keys.at(-1);if(next){e.preventDefault();tabs[next].click();tabs[next].focus();}};
  }
  let returnFocus;
  manager.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
  select('state');
  return {select,open(id){if(!manager.open){returnFocus=doc.activeElement;manager.showModal();}select(id);tabs[id].focus();},get active(){return active;}};
}
