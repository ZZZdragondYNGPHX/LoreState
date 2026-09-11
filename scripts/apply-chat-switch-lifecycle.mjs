import { readFile, writeFile } from 'node:fs/promises';

const path='prototype/runtime.js';
let source=await readFile(path,'utf8');
if(source.includes('export function shouldReloadForChatChange')){
  console.log('chat lifecycle fix already applied');
  process.exit(0);
}

function replaceOnce(from,to,label){
  const first=source.indexOf(from);
  if(first<0)throw new Error(`找不到待替换片段：${label}`);
  if(source.indexOf(from,first+1)>=0)throw new Error(`待替换片段不唯一：${label}`);
  source=source.slice(0,first)+to+source.slice(first+from.length);
}

replaceOnce(
  "import { variableStory, validateExtraUpdate, settleContinuedMessage } from './extra-update.js';\n\n// Runs inside the owning Tavern Helper character script, including remote imports.\n",
  "import { variableStory, validateExtraUpdate, settleContinuedMessage } from './extra-update.js';\n\nexport function shouldReloadForChatChange(loadedChatId,nextChatId){\n  return nextChatId!==undefined&&nextChatId!==loadedChatId;\n}\n\n// Runs inside the owning Tavern Helper character script, including remote imports.\n",
  '导出聊天切换判定',
);

replaceOnce(
  "  const doc=window.parent.document,ctx=()=>window.parent.SillyTavern.getContext();\n  if(doc.getElementById('lorestate-prototype-settings'))throw new Error('已有 LoreState 原型脚本运行，请勿重复启用');\n",
  "  const doc=window.parent.document,ctx=()=>window.parent.SillyTavern.getContext();\n  const runtimeSlot='__lorestatePrototypeRuntime';\n  const previousRuntime=window.parent[runtimeSlot];\n  if(typeof previousRuntime?.dispose==='function')previousRuntime.dispose();\n  else if(doc.getElementById('lorestate-prototype-settings'))throw new Error('已有 LoreState 原型脚本运行，请勿重复启用');\n  const loadedChatId=ctx().getCurrentChatId();\n  let runtimeRegistration=null;\n",
  'runtime 接管注册',
);

replaceOnce(
  "  async function beforeGenerate(type,_options,dryRun){\n    // Core generation emits GENERATION_STARTED first; silent Helper generation does not.\n",
  "  async function beforeGenerate(type,_options,dryRun){\n    if(closed)return;\n    // Core generation emits GENERATION_STARTED first; silent Helper generation does not.\n",
  '关闭实例生成保护',
);

replaceOnce(
  "  eventOn(tavern_events.CHAT_CHANGED,()=>{chatEpoch++;cancelExtraUpdate();extraDiagnostics=[];apiUi.clear();uninject?.();uninject=null;stateWindow.close();view?.remove();renderKey='';noticeKey='';notice.hidden=true;runtimeLogs=[];draft=null;restoreDraft=null;capturedKey='';snapshotPreview.textContent='';report('设置随角色保存；修改后请预览并保存。');manager.close();generating=false;schedule();});\n",
  "  runtimeRegistration={dispose};window.parent[runtimeSlot]=runtimeRegistration;\n  eventOn(tavern_events.CHAT_CHANGED,newChatId=>{\n    if(shouldReloadForChatChange(loadedChatId,newChatId)){dispose();window.location.reload();return;}\n    chatEpoch++;cancelExtraUpdate();extraDiagnostics=[];apiUi.clear();uninject?.();uninject=null;stateWindow.close();view?.remove();renderKey='';noticeKey='';notice.hidden=true;runtimeLogs=[];draft=null;restoreDraft=null;capturedKey='';snapshotPreview.textContent='';report('设置随角色保存；修改后请预览并保存。');manager.close();generating=false;schedule();\n  });\n",
  'CHAT_CHANGED 生命周期',
);

replaceOnce(
  "  function dispose(){closed=true;cancelExtraUpdate();apiUi.clear();menuObserver?.disconnect();stateWindow.dispose();menu.remove();panel.remove();manager.remove();notice.remove();view?.remove();uninject?.();}\n",
  "  function dispose(){\n    if(closed)return;\n    closed=true;cancelExtraUpdate();apiUi.clear();menuObserver?.disconnect();stateWindow.dispose();menu.remove();panel.remove();manager.remove();notice.remove();view?.remove();\n    const cleanup=uninject;uninject=null;cleanup?.();\n    if(runtimeRegistration&&window.parent[runtimeSlot]===runtimeRegistration)delete window.parent[runtimeSlot];\n  }\n",
  '幂等清理',
);

await writeFile(path,source);
console.log('applied chat-switch lifecycle fix');
