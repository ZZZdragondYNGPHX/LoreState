import {parseLegacyXml} from '../legacy/migration.js';
import {xmlText} from '../legacy/state-v2.js';
import {applyState} from '../legacy/state-v2.js';
import {wishnoteFields,wishnoteSchema} from './fields.js';

export function convertWishnoteMemory(hotXml='',coldBook=null){
  const people=new Map(),warnings=[];
  if(hotXml.trim()){
    const roots=parseLegacyXml(hotXml);if(roots.length!==1||roots[0].tag!=='WishBook'||roots[0].text.trim())throw new Error('热档必须是一份完整 WishBook');
    for(const person of roots[0].children){
      const {id,name}=person.attrs;if(person.tag!=='WishPerson'||!id||!name||people.has(id)||person.text.trim())throw new Error('旧人物结构或编号冲突');
      const text={Reality:[],Wish:[],Tie:[]};
      for(const item of person.children){if(!Object.hasOwn(text,item.tag)||item.children.length)throw new Error('旧档存在未识别字段，停止转换以免丢失');text[item.tag].push(item.text.trim());}
      people.set(id,{id,name,presence:person.attrs.mode==='cold'?'cold':'active',values:[text.Reality.join('\n')||'暂无长期事实',text.Wish.join('\n')||'无',text.Tie.join('\n')||'无']});
    }
  }
  const coldSeen=new Set();
  for(const entry of Object.values(coldBook?.entries??{})){
    const keys=Array.isArray(entry.key)?entry.key:String(entry.key??'').split(',');
    const archiveKeys=keys.map(k=>k.trim()).filter(k=>/^@WishNote:P\d+$/.test(k));if(!archiveKeys.length)continue;
    if(archiveKeys.length!==1)throw new Error('冷档含多个精确人物键');
    const nodes=parseLegacyXml(entry.content??''),node=nodes[0],id=archiveKeys[0].slice('@WishNote:'.length);
    if(nodes.length!==1||node.tag!=='WishArchive'||node.attrs.id!==id||!node.attrs.name||node.children.length||!node.text.trim()||coldSeen.has(id))throw new Error('冷档结构、编号或重复条目有冲突');
    coldSeen.add(id);
    if(people.has(id)){warnings.push(`${id} 同时存在热冷档：采用所选热档；冷档原文保存在转换备份，未自动合并。`);continue;}
    people.set(id,{id,name:node.attrs.name,presence:'cold',values:[node.text.trim(),'参见已成事实中的旧冷档原文（未自动拆分）','参见已成事实中的旧冷档原文（未自动拆分）']});
    warnings.push(`${id} 冷档摘要原文完整保留，恒/程与关联尚未自动拆分。`);
  }
  const xml='<LoreState version="2" mode="full">\n'+[...people.values()].map(p=>`<Person id="${xmlText(p.id)}" name="${xmlText(p.name)}" identity="旧愿档迁入人物" mode="full" presence="${p.presence}">\n${wishnoteFields.map((f,i)=>`<${f}>${xmlText(p.values[i])}</${f}>`).join('\n')}\n</Person>`).join('\n')+'\n</LoreState>';
  const state=applyState(null,xml,wishnoteSchema);
  return {xml,state,warnings,originals:{hotXml,coldBook}};
}
