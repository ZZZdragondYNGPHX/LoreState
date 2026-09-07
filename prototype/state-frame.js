// Both inline and expanded state views retain the opaque, script-free sandbox.
export function createStateFrame(doc,title,{expanded=false}={}){
  const frame=doc.createElement('iframe');frame.title=title;frame.setAttribute('sandbox','');
  frame.className='lorestate-state-frame';
  // Host themes and iframe renderers may supply generic sizing/position rules.
  // Keep the owned frame in normal flow and prevent flex shrink to a thumbnail.
  const styles={display:'block',position:'relative',inset:'auto',transform:'none',float:'none',width:'100%',minWidth:'0',maxWidth:'100%',height:expanded?'100%':'clamp(360px, 60vh, 640px)',minHeight:expanded?'0':'360px',maxHeight:'none',flex:expanded?'1 1 0':'0 0 auto',border:'0',borderRadius:'10px',boxSizing:'border-box',margin:'0'};
  for(const [key,value] of Object.entries(styles))frame.style.setProperty(key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),value,'important');
  return frame;
}

export function createStateWindow(doc){
  const dialog=doc.createElement('dialog');dialog.id='lorestate-state-window';dialog.setAttribute('aria-label','LoreState 状态窗口');
  dialog.style.cssText='position:fixed;inset:0;margin:auto;width:min(1000px,calc(100vw - 24px));height:min(780px,calc(100dvh - 32px));max-width:none;max-height:none;box-sizing:border-box;padding:16px;border:1px solid #59634d;border-radius:14px;background:#20251f;color:#f1f3ed;overflow:hidden';
  const style=doc.createElement('style');style.textContent='#lorestate-state-window[open]{display:flex;flex-direction:column;gap:12px}#lorestate-state-window::backdrop{background:#10150fc9}#lorestate-state-window button:focus-visible{outline:2px solid #d5e5ae;outline-offset:2px}';dialog.append(style);
  const header=doc.createElement('header');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 auto';
  const heading=doc.createElement('h2');heading.textContent='LoreState · 当前状态';heading.style.cssText='font:600 18px/1.5 system-ui;margin:0';
  const close=doc.createElement('button');close.type='button';close.textContent='关闭状态窗口';close.style.cssText='font:inherit;min-height:44px;padding:8px 12px;border:1px solid #59634d;border-radius:8px;background:#2a3028;color:inherit;cursor:pointer';close.onclick=()=>dialog.close();
  header.append(heading,close);dialog.append(header);const frame=createStateFrame(doc,'LoreState 展开状态',{expanded:true});dialog.append(frame);doc.body.append(dialog);
  let opener;dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
  return {open(source){frame.srcdoc=source;if(!dialog.open){opener=doc.activeElement;dialog.showModal();}close.focus();},update(source){if(dialog.open)frame.srcdoc=source;},close(){dialog.close();},dispose(){dialog.remove();}};
}
