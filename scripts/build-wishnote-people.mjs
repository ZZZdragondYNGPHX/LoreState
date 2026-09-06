import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {wishnoteSchema,wishnoteBookName} from '../examples/wishnote/people/fields.js';
const root=new URL('../',import.meta.url),base='examples/wishnote/people/';
const read=path=>readFile(new URL(path,root),'utf8').then(text=>text.replaceAll('\r\n','\n'));
const source=await read('examples/wishnote/legacy/worldbook-v8.json'),book=JSON.parse(source);
const rules=await read(base+'rules.txt'),html=await read(base+'status.html');
book.name=wishnoteBookName;
// UID 0–5, including all metadata, are deliberately untouched.
book.entries['6']={...book.entries['6'],comment:'LoreState · 愿档状态栏（在脚本中选择）',content:rules,disable:true};
book.entries['7']={...book.entries['7'],comment:'LoreState · 冷档说明（参考，不注入）',disable:true,content:'人物离场由 LoreState presence="cold" 保存在聊天中；回归用空 delta 切换 active。旧 ArchiveQueue 与维护 QR 停用。完整聊天导出作为备份，不再写入 Chat Lore 检查点。'};
const continuation=book.entries['8'].content;
const marker='续写人格型愿望时：';if(!continuation.includes(marker))throw new Error('原续页结构变化，请人工核对');
book.entries['8']={...book.entries['8'],constant:true,key:[],content:'# 续页\n\n以 LoreState 提供的在场人物完整资料和已取回资料为愿效记忆；未取回的简短索引不代表完整状态。\n\n'+continuation.slice(continuation.indexOf(marker)).replaceAll('Wish','持续条件')};
book.entries['9']={...book.entries['9'],content:'# 愿簿查阅\n\n当{{user}}输入`[愿簿]`时，可以简短描写翻开笔记。完整愿档由最新回复旁的界面显示，不在正文中重抄。离场人物可在本地离场记忆中查阅；剧情需要回归时按脚本协议唤醒。正文后仍遵循 LoreState 更新协议。'};
const reference=JSON.parse(await read('prototype/dist/lorestate-script.json'));
if(!reference.content.includes('@prototype-v0.4.0/'))throw new Error('重新核对人物记忆运行时版本后再构建');
const config={version:4,ready:true,book:wishnoteBookName,uid:6,entryName:book.entries['6'].comment,schema:wishnoteSchema,html,presets:[{id:'wishnote-default',name:'缄愿笔记 · 墨金',html}],activePresetId:'wishnote-default'};
const script={...reference,name:'LoreState · 缄愿笔记统一版',id:'512f78d9-3720-4e2c-9762-4f089b11dd20',info:'缄愿笔记统一状态 2.0。依赖酒馆助手与 LoreState prototype-v0.4.0；导入并绑定配套世界书，首次打开魔法棒设置后保存以安装正则。旧维护 QR、旧 WishNote 扩展和其他 LoreState 脚本须停用。',data:{lorestate_unified_v1:config}};
const out=new URL(base+'dist/',root);await mkdir(out,{recursive:true});
const outputs={[wishnoteBookName+'.json']:book,'缄愿笔记_角色脚本.json':script};
const offline=JSON.parse(await read('prototype/dist/lorestate-script-offline.json'));
outputs['缄愿笔记_角色脚本_离线备用.json']={...script,content:offline.content};
for(const [destination,suffix] of [['display','显示隐藏'],['prompt','提示词过滤']])outputs[`缄愿笔记_${suffix}.json`]={id:`lorestate-text-prototype-tags-v1-${destination}`,scriptName:`LoreState 原型｜${suffix}`,findRegex:'/<LoreState\\b[^>]*>[\\s\\S]*?<\\/LoreState>/g',replaceString:'',trimStrings:[],placement:[2],disabled:false,markdownOnly:destination==='display',promptOnly:destination==='prompt',runOnEdit:true,substituteRegex:0,minDepth:null,maxDepth:null};
const hashes={};for(const [name,value] of Object.entries(outputs)){const text=JSON.stringify(value,null,2)+'\n';await writeFile(new URL(name,out),text);hashes[name]=createHash('sha256').update(text).digest('hex');}
await writeFile(new URL('receipt.json',out),JSON.stringify({version:'2.0',sourceSha256:createHash('sha256').update(source).digest('hex'),preservedEntries:[0,1,2,3,4,5],runtime:'prototype-v0.4.0',wholeCharacterCard:false,hashes},null,2)+'\n');
console.log('Built WishNote worldbook, configured scripts and two fallback regexes');
