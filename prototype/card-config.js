import { parseModules, moduleShape } from './modules.js';
import { sameSchema } from './presets.js';
import { normalizeUpdateSettings } from './api-profiles.js';

// Only author behavior travels with a card. Local endpoints, keys and preset names do not.
export function portableUpdateDefaults(binding) {
  const value=normalizeUpdateSettings(binding);
  return Object.fromEntries(['mode','auto','stream','attempts','timeoutSeconds'].map(key=>[key,value[key]]));
}
export function captureCardRule(config,entry,book=config.book) {
  if(!entry||typeof entry.content!=='string'||!entry.content.trim()||entry.content.length>24000)throw new Error('随卡规则需要完整的非空条目，最多 24000 字符');
  const modules=parseModules(entry.content);
  if(config.schema?.modules&&(!modules||!sameSchema(moduleShape(modules),config.schema)))throw new Error('随卡规则栏目与已保存配置不一致');
  return {book,uid:entry.uid,name:entry.name??'状态规则',content:entry.content};
}
export async function readCardRule(config,loadWorldbook) {
  let source;
  try{source=await loadWorldbook(config.book);}catch(error){
    const saved=config.ruleSnapshot;
    if(!saved||saved.book!==config.book||saved.uid!==config.uid)throw error;
    captureCardRule(config,saved);
    return {...saved,origin:'card'};
  }
  const entry=source.find(e=>e.uid===config.uid);
  // A removed entry in an available book is an author edit, not a failed import.
  if(!entry)throw new Error('世界书关联失效，请重新选择状态栏条目');
  return {...entry,origin:'worldbook'};
}
export function enableCardScriptExport(trees,id) {
  let found=false;
  const visit=items=>items.map(item=>{
    if(item.type==='folder')return {...item,scripts:visit(item.scripts)};
    if(item.id!==id)return item;
    found=true;return {...item,export_with:{...item.export_with,data:true,button:true}};
  });
  const next=visit(trees);
  if(!found)throw new Error('当前 LoreState 不在角色卡脚本列表中；请将脚本导入本角色卡后再准备导出');
  return next;
}
