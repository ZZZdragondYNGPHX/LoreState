import { emptyState, renderBook, validateState } from './src/core.js';
import { LoreStateHost, exportState, importBackup, capabilities } from './src/host.js';
let host, panel, opener, status, output, preview;
const node = (tag, text, parent) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; parent?.append(el); return el; };
const report = text => { if (status) status.textContent = text; };
const signature = ctx => JSON.stringify([ctx.getCurrentChatId(), ctx.chat.map(m => [m.mes,m.name,m.is_user,m.is_system,m.swipe_id])]);
function button(text, parent, fn) {
  const el = node('button',text,parent); el.type='button';
  el.onclick=async()=>{el.disabled=true;try{await fn();}catch(e){report(e.message);}finally{el.disabled=false;}};
}
async function redraw() {
  const ctx = SillyTavern.getContext(), before=signature(ctx), result=await host.read();
  if (ctx.chat!==SillyTavern.getContext().chat || signature(ctx)!==before) return;
  output.textContent=renderBook(result.state);
  report(!host.enabled() ? '本聊天未启用。展开基线设置，预览后确认。' : result.error ? `第 ${result.error.index} 层未提交：${result.error.message}` : `资料：${result.state.profile.id} · 基线 ${result.started?'有效':'缺失'} · ${result.base.slice(0,12)}`);
}
function stage(state) {
  validateState(state); const ctx=SillyTavern.getContext();
  preview={state:structuredClone(state),chat:ctx.chat,signature:signature(ctx)};
  output.textContent='尚未写入的基线预览\n'+JSON.stringify(state,null,2);
  report('确认将以当前最后一层作为新基线，先前历史不再重放。请先导出当前备份。');
}
export function init() {
  if (panel || !globalThis.SillyTavern?.getContext) return;
  opener=node('button','LoreState',document.body);opener.id='lorestate-open';opener.type='button';
  panel=node('dialog',undefined,document.body);panel.id='lorestate-panel';panel.setAttribute('aria-labelledby','lorestate-title');
  node('h2','LoreState · 文字状态',panel).id='lorestate-title';
  button('关闭',panel,()=>panel.close());status=node('p','',panel);status.setAttribute('role','status');
  output=node('pre','',panel);output.tabIndex=0;
  host=new LoreStateHost(()=>SillyTavern.getContext(),report);
  const missing=capabilities(SillyTavern.getContext());
  opener.onclick=async()=>{panel.showModal();try{if(!missing.length)await redraw();}catch(e){report(e.message);}};
  if(missing.length){report('缺少宿主能力：'+missing.join(', '));return;}
  const actions=node('div',undefined,panel);actions.className='lorestate-actions';
  button('刷新状态',actions,redraw);
  button('导出备份',actions,async()=>{
    const r=await host.read(); if(!r.started)throw new Error('没有有效基线');
    const url=URL.createObjectURL(new Blob([JSON.stringify(await exportState(r),null,2)],{type:'application/json'}));
    const a=node('a');a.href=url;a.download='LoreState-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    report(r.error?'已导出失败楼层之前的有效状态':'已导出当前状态');
  });
  button('停用本聊天',actions,async()=>{await host.disableChat();await redraw();});
  button('忽略失败轮的更新',actions,async()=>{await host.skipFailed();await redraw();});
  const details=node('details',undefined,panel);node('summary','基线设置 / 示例导入 / 备份恢复',details);
  node('p','粘贴或选择 baseline.json。自定义 data 的对象和文字字段；profile.instructions 描述领域规则。当前版本完整注入所有文字，不自动压缩冷档。',details);
  const label=node('label','基线 JSON',details),area=node('textarea',undefined,label);area.rows=8;area.value=JSON.stringify(emptyState(),null,2);
  button('预览文本基线',details,()=>stage(JSON.parse(area.value)));
  const fileLabel=node('label','基线或 LoreState 备份 JSON',details),file=node('input',undefined,fileLabel);file.type='file';file.accept='.json';
  button('预览文件',details,async()=>{
    const f=file.files[0];if(!f||f.size>5000000)throw new Error('请选择不超过 5 MB 的 JSON');
    const value=JSON.parse(await f.text());stage(value.format?await importBackup(value):value);
  });
  button('确认这份基线',details,async()=>{
    const ctx=SillyTavern.getContext();
    if(!preview||ctx.chat!==preview.chat||signature(ctx)!==preview.signature)throw new Error('预览已过期，请重新预览');
    if(ctx.chatMetadata.wishnote_v1?.enabled)throw new Error('请先在旧愿档面板停用本聊天，避免两套协议同时注入');
    await host.establish(preview.state);preview=null;await redraw();
  });
  host.attach();globalThis.lorestateGenerationInterceptor=(...args)=>host.intercept(...args);
  window.addEventListener('pagehide',dispose,{once:true});
}
export function dispose(){host?.dispose();panel?.remove();opener?.remove();panel=null;preview=null;delete globalThis.lorestateGenerationInterceptor;window.removeEventListener('pagehide',dispose);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
