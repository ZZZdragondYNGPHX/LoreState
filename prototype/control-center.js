import { uiCard, uiActions } from './ui-kit.js';
import { CONTROL_CENTER_CSS } from './control-center-style.js';

// Presentation only: no host data writes or persisted navigation state.
export function createControlCenter({doc,manager,panel,summary,status,floorSelect,details,diagnostics,repairBox,tailPreview,snapshotPanel,apiPanel,loadApi,updatePanel,loadUpdates,actions,loadSettings,settingsGroups,appearancePanel,loadAppearance}) {
  const make=(tag,text,parent)=>{const el=doc.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;};
  manager.replaceChildren();manager.removeAttribute('style');manager.setAttribute('aria-label','LoreState 控制中心');
  panel.removeAttribute('style');
  const style=make('style',null,manager);style.textContent=CONTROL_CENTER_CSS;
  const top=make('div',null,manager);top.className='ls-top';
  const header=make('header',null,top);header.className='ls-header';
  const brand=make('div',null,header);make('h2','LoreState',brand);make('p','控制中心 / 让故事的变化有迹可循',brand);
  const exit=make('button','关闭',header);exit.type='button';exit.onclick=()=>manager.close();
  const layout=make('div',null,manager);layout.className='ls-layout';
  const workspace=make('div',null,layout);workspace.className='ls-workspace';
  const nav=make('div',null,workspace);nav.className='ls-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','LoreState 功能');
  const content=make('div',null,workspace);content.className='ls-content';
  const toolbar=make('div',null,content);toolbar.className='ls-toolbar';const floorLabel=make('label','查看楼层',toolbar);floorLabel.append(floorSelect);
  for(const title of ['上一 AI 层','下一 AI 层','返回最新','定位聊天消息'])toolbar.append(actions.get(title));
  const body=make('div',null,content);body.className='ls-body';
  summary.className='ls-health';body.append(summary);
  const statePage=make('section',null,body),repairPage=make('section',null,body);body.append(panel);
  statePage.append(details);
  const card=(parent,options)=>uiCard(doc,parent,options);
  const act=titles=>titles.map(title=>actions.get(title)).filter(Boolean);
  // One update workspace owns run/cancel/undo and the contextual tail confirmation.
  if(updatePanel){repairPage.append(updatePanel);if(tailPreview)updatePanel.querySelector('[data-ls-update-actions]').append(tailPreview);}
  if(snapshotPanel)card(repairPage,{title:'历史快照与回档',hint:'先预览，再恢复保存的状态。正文保留，旧剧情仍在上下文中。'}).append(snapshotPanel);
  const report=card(repairPage,{title:'楼层检查与报告',hint:'检查上方所选楼层，或重新校验全部历史。'});report.parentElement.dataset.lsFloorReport='';report.append(diagnostics,repairBox);
  uiActions(doc,report,act(['重新校验全部楼层','复制诊断报告']));
  const legacy=card(repairPage,{title:'旧版本修复备份',hint:'仅用于恢复旧版本保存的格式修复备份。'});
  uiActions(doc,legacy,act(['查看格式修复备份','撤销最近一次格式修复']));
  // Move the original controls; handlers and unconfirmed drafts stay intact.
  panel.replaceChildren(status);status.className='ls-health';
  settingsGroups.forEach((group,index)=>{
    const box=card(panel,{title:group.title,hint:group.hint,step:index+1,open:index===0});
    for(const item of group.items)if(Array.isArray(item))uiActions(doc,box,item);else box.append(item);
  });
  for(const title of ['保存 HTML 并启用本聊天','确认边界并重算'])actions.get(title)?.classList.add('ls-primary');
  for(const title of ['删除所选预设','暂停本聊天'])actions.get(title)?.classList.add('ls-danger');
  if(appearancePanel)body.append(appearancePanel);
  if(apiPanel)body.append(apiPanel);
  const pages={state:statePage,diagnostics:repairPage,settings:panel,...(appearancePanel?{appearance:appearancePanel}:{}),...(apiPanel?{api:apiPanel}:{})},tabs={},scrolls={};let active='state';
  const descriptions={state:'浏览每一楼的状态与变化',diagnostics:'最新回复更新、撤销与历史恢复',settings:'绑定世界书，配置栏目和聊天',appearance:'制作、预览与应用状态栏外观',api:'管理连接与状态更新策略'};
  function select(id,focus=false){
    if(!pages[id])return;
    scrolls[active]=content.scrollTop;active=id;
    for(const [key,page] of Object.entries(pages)){page.hidden=key!==id;tabs[key].setAttribute('aria-selected',String(key===id));tabs[key].tabIndex=key===id?0:-1;}
    toolbar.hidden=['settings','appearance','api'].includes(id);summary.hidden=toolbar.hidden;
    content.scrollTop=scrolls[id]??0;if(id==='diagnostics')loadUpdates?.();if(focus)tabs[id].focus();
  }
  for(const [id,title] of [['state','状态总览'],['diagnostics','更新与恢复'],['settings','规则配置'],...(appearancePanel?[['appearance','外观制作']]:[]),...(apiPanel?[['api','模型连接']]:[])]){
    const subtitles={state:'状态 · 变化 · 档案',diagnostics:'重算 · 撤销 · 回档',settings:'世界书 · 栏目 · 聊天',appearance:'草稿 · 预览 · 预设',api:'API · 绑定 · 请求策略'};
    const tab=make('button',null,nav);make('span',title,tab);make('small',subtitles[id],tab);tab.setAttribute('aria-label',title);tab.type='button';tab.id='ls-tab-'+id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','ls-page-'+id);tabs[id]=tab;
    if(!['api','appearance'].includes(id)){const heading=make('header');heading.className='ls-page-header';make('h3',title,heading);make('p',descriptions[id],heading);pages[id].prepend(heading);}
    pages[id].id=id==='settings'?'lorestate-prototype-settings':'ls-page-'+id;tab.setAttribute('aria-controls',pages[id].id);pages[id].setAttribute('role','tabpanel');pages[id].setAttribute('aria-labelledby',tab.id);
    tab.onclick=()=>{select(id);if(id==='settings')void loadSettings();if(id==='appearance')void loadAppearance?.();if(id==='api')loadApi?.();};
    tab.onkeydown=e=>{const keys=Object.keys(pages),i=keys.indexOf(active);let next;if(['ArrowRight','ArrowDown'].includes(e.key))next=keys[(i+1)%keys.length];if(['ArrowLeft','ArrowUp'].includes(e.key))next=keys[(i+keys.length-1)%keys.length];if(e.key==='Home')next=keys[0];if(e.key==='End')next=keys.at(-1);if(next){e.preventDefault();tabs[next].click();tabs[next].focus();tabs[next].scrollIntoView({block:'nearest',inline:'nearest'});}};
  }
  let returnFocus;
  manager.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
  const resize=new doc.defaultView.ResizeObserver(()=>nav.setAttribute('aria-orientation',layout.clientWidth<=720?'horizontal':'vertical'));resize.observe(layout);
  select('state');
  return {select,open(id){if(!manager.open){returnFocus=doc.activeElement;manager.showModal();}select(id);tabs[id].focus();},get active(){return active;},dispose(){resize.disconnect();}};
}
