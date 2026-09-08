// Author-owned module declarations. No model calls or semantic inference.
export function parseModules(source) {
  if(typeof source!=='string')throw new Error('状态栏条目必须是文字');
  if(!source.includes('【LoreState模块 v1】')){if(source.includes('【LoreState模块'))throw new Error('不支持的模块格式版本');return null;}
  if(source.length>24000)throw new Error('模块条目最多 24000 字符');
  const lines=source.replaceAll('\r\n','\n').trim().split('\n');
  if(lines.shift()!=='【LoreState模块 v1】')throw new Error('模块声明必须位于条目第一行');
  const sections=new Map();let current=null;
  for(const line of lines){
    const match=line.match(/^【(通用规则|公共栏目|模块：([^】]+))】$/);
    if(match){const key=match[2]??match[1];if(match[2]&&['通用规则','公共栏目'].includes(key))throw new Error('模块名称与分区保留字冲突');if(sections.has(key))throw new Error('重复模块或分区：'+key);current=[];sections.set(key,current);}
    else {if(line.startsWith('【'))throw new Error('未知模块标题：'+line);if(!current&&line.trim())throw new Error('文字必须放在声明分区内');current?.push(line);}
  }
  const common=(sections.get('通用规则')??[]).join('\n').trim();sections.delete('通用规则');
  function definition(lines){const first=lines.findIndex(x=>x.trim());if(first<0||!lines[first].startsWith('栏目：'))throw new Error('分区首行必须为 栏目：名称、名称');if(lines.slice(first+1).some(x=>x.startsWith('栏目：')))throw new Error('每个分区只能声明一次栏目');const fields=lines[first].slice(3).split('、').map(x=>x.trim());return {fields,rules:lines.slice(first+1).join('\n').trim()};}
  const shared=sections.has('公共栏目')?definition(sections.get('公共栏目')):{fields:[],rules:''};sections.delete('公共栏目');
  const modules=Object.fromEntries([...sections].map(([name,lines])=>[name,definition(lines)]));
  if(!Object.keys(modules).length||Object.keys(modules).length>16)throw new Error('需要 1–16 个模块');
  for(const name of Object.keys(modules))if(!/^[\p{L}_][\p{L}\p{N}_-]{0,39}$/u.test(name)||['__proto__','constructor','prototype'].includes(name))throw new Error('模块名称无效：'+name);
  return {common,shared,modules};
}
export function moduleShape(parsed){return {shared:parsed.shared.fields,entity:[...new Set(Object.values(parsed.modules).flatMap(m=>m.fields))],modules:Object.fromEntries(Object.entries(parsed.modules).map(([name,m])=>[name,m.fields]))};}
export function moduleSignature(schema){return JSON.stringify(Object.entries(schema.modules??{}).sort(([a],[b])=>a.localeCompare(b)).map(([name,fields])=>[name,[...fields].sort()]));}
export function entityFields(schema,type){if(!schema.modules)return schema.entity;if(!Object.hasOwn(schema.modules,type))throw new Error('未声明的实体模块：'+type);return schema.modules[type];}
export function modulePrompt(parsed,projection,text,initial=false){
  const selected=new Set(initial?Object.keys(parsed.modules):projection.full.map(e=>e.type));
  for(const name of Object.keys(parsed.modules))if(text.includes(name))selected.add(name);
  const directory=Object.entries(parsed.modules).map(([name,m])=>`${name}：${m.fields.join('、')}`).join('\n');
  return `${parsed.common}\n${parsed.shared.rules}\n模块目录（每个新实体只填写所属类别的全部栏目）：\n${directory}\n本轮详细模块规则：\n${Object.entries(parsed.modules).filter(([name])=>selected.has(name)).map(([name,m])=>`【模块：${name}】\n${m.rules}`).join('\n')||'无已加载实体；按目录和通用规则建档。'}\n正文新出现的已声明类别可按目录建档，仅记录正文明确事实，未知填“未知”；下轮加载该类详细规则。未声明类别不得建档。涉及多个模块的同一事实必须在唯一更新块中一致提交；没有变化的模块省略。`;
}
