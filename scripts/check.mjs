import { access, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(e.name))continue;const p=`${dir}/${e.name}`;if(e.isDirectory())await walk(p);else if(/\.(mjs|js)$/.test(p))execFileSync(process.execPath,['--check',p],{stdio:'inherit'});}}
async function exists(path){try{await access(path);return true;}catch{return false;}}
if(await exists('examples'))throw new Error('examples/ 已退休，不得重新加入 main');
if(await exists('release'))throw new Error('顶层 release/ 已归并，发布材料必须位于 docs/发布材料/');
for(const path of ['docs/README.md','docs/发布材料/README.md','docs/发布材料/Discord帖子.md','docs/发布材料/作者改造教程.md','docs/发布材料/状态栏模板.html','docs/发布材料/状态栏条目.txt','docs/archive/README.md'])if(!await exists(path))throw new Error(`缺少规范文档路径：${path}`);
const remoteDir='prototype/dist/main',remoteEntry=`${remoteDir}/lorestate-script.json`,receipt=`${remoteDir}/receipt.json`;
for(const path of [remoteEntry,receipt])if(!await exists(path))throw new Error(`缺少 main 远程产物：${path}`);
const remote=JSON.parse(await readFile(remoteEntry,'utf8')),record=JSON.parse(await readFile(receipt,'utf8'));
if(!String(remote.content).includes('@main/artifact/bundle.js'))throw new Error('main 远程入口没有指向 @main/artifact/bundle.js');
if(record.mode!=='remote-only'||record.remoteEntry!=='lorestate-script.json')throw new Error('main 远程收据不是 remote-only');
if((await readdir(remoteDir)).some(name=>/offline|离线/i.test(name)))throw new Error('main 活动产物不得包含离线版');
await walk('.');console.log('JavaScript syntax and remote-only output checks OK');
