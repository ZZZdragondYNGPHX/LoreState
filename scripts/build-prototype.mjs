import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8').then(text=>text.replaceAll('\r\n','\n'));
const SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const requested=process.argv[2]?.trim()||'';
const ciTag=process.env.GITHUB_REF_TYPE==='tag'?(process.env.GITHUB_REF_NAME??'').trim():'';
const ref=requested||(SEMVER.test(ciTag)?ciTag:'main');
if(ref!=='main'&&!SEMVER.test(ref))throw new Error(`构建 ref 只允许 main 或语义版本标签，收到：${ref}`);
if(process.env.GITHUB_REF_TYPE==='branch'&&SEMVER.test(process.env.GITHUB_REF_NAME??''))throw new Error('禁止在语义版本命名的 branch 上构建；正式版本必须使用不可移动 tag');

const pieces=await Promise.all(['modules','core','entity-delete','template','presets','builtin-preset','ui-kit','api-profiles','api-panel','extra-update','control-center','state-frame','snapshots','snapshot-store','runtime'].map(name=>read(`prototype/${name}.js`)));
const content=`(()=>{\n'use strict';\n${pieces.map(s=>s.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')).join('\n')}\ninstallEntityDeleteProtocol({getApplyState:()=>applyState,setApplyState:value=>{applyState=value;},getPreparePrompt:()=>preparePrompt,setPreparePrompt:value=>{preparePrompt=value;}});\nstartPrototype(${JSON.stringify(await read('prototype/example.html'))});\n})();`;
const out=`prototype/dist/${ref}/`;
const stable=ref!=='main';
const cdnHost=stable?'testingcf.jsdelivr.net':'cdn.jsdelivr.net';
const remoteUrl=`https://${cdnHost}/gh/ZZZdragondYNGPHX/LoreState@${ref}/artifact/bundle.js`;
const script={type:'script',enabled:true,name:'LoreState · 文字状态原型',id:'0aa89d30-099d-4cf3-8cfb-d367490ec067',content,info:stable?`LoreState ${ref} 固定版本；模块条目、分类栏目与按需规则注入；正文后统一更新。保留 v3 世界实体冷热档、有限关联召回与活动事件；目标酒馆助手 4.9.5 / SillyTavern 1.18.0。首次 full，后续 delta。此入口固定到 ${ref} tag，不随 main 变化。`:'LoreState main 远程开发版；模块条目、分类栏目与按需规则注入；正文后统一更新。保留 v3 世界实体冷热档、有限关联召回与活动事件；本版待真实酒馆验收，目标酒馆助手 4.9.5 / SillyTavern 1.18.0。首次 full，后续 delta。不迁移旧状态；模块结构请用新配置与新聊天，不提供旧数据迁移。',button:{enabled:true,buttons:[{name:'LoreState 设置',visible:false}]},data:{},export_with:{data:true,button:true}};
await mkdir(new URL(out,root),{recursive:true});
await mkdir(new URL('artifact/',root),{recursive:true});
await writeFile(new URL('artifact/bundle.js',root),content+'\n');
const remoteScript={...script,content:`import '${remoteUrl}';`,info:script.info+' Template API v2：多区域声明式 HUD；旧 HTML 需重制，原文与现有状态/schema/快照保留。未完成本版真实宿主与人工验收。'+(stable?'':' 远程入口跟随 main；刷新脚本后获取 main 最新 bundle。')};
await writeFile(new URL(out+'lorestate-script.json',root),JSON.stringify(remoteScript,null,2)+'\n');
await writeFile(new URL(out+'receipt.json',root),JSON.stringify({version:ref,mode:'remote-only',realHostVerified:false,scriptId:script.id,sha256:createHash('sha256').update(content+'\n').digest('hex'),runtime:{sillytavern:'1.18.0',tavernHelper:'4.9.5'},runtimeDependencies:['Tavern Helper'],remoteLoaders:[{url:remoteUrl,ref}],remoteEntry:'lorestate-script.json'},null,2)+'\n');
console.log(`Built ${ref} remote loader and artifact/bundle.js`);
