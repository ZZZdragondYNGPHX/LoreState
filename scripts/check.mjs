import { access, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(e.name))continue;const p=`${dir}/${e.name}`;if(e.isDirectory())await walk(p);else if(/\.(mjs|js)$/.test(p))execFileSync(process.execPath,['--check',p],{stdio:'inherit'});}}
async function exists(path){try{await access(path);return true;}catch{return false;}}

if(await exists('examples'))throw new Error('examples/ 已退休，不得重新加入 main');
if(await exists('release'))throw new Error('顶层 release/ 已归并，发布材料必须位于 docs/发布材料/');
for(const path of ['docs/README.md','docs/版本管理.md','docs/发布材料/README.md','docs/发布材料/Discord帖子.md','docs/发布材料/作者改造教程.md','docs/发布材料/状态栏模板.html','docs/发布材料/状态栏条目.txt','docs/archive/README.md'])if(!await exists(path))throw new Error(`缺少规范文档路径：${path}`);

for(const path of ['prototype/dist/lorestate-script.json','prototype/dist/lorestate-script-offline.json','prototype/dist/receipt.json'])if(await exists(path))throw new Error(`旧的无版本 dist 入口已退休，请删除：${path}`);
if(await exists('artifact/diagnostic-hook.js'))throw new Error('临时诊断钩子不得提交到 main；诊断只能存在于临时 debug 分支');

const branch=process.env.GITHUB_REF_TYPE==='branch'?(process.env.GITHUB_REF_NAME??''):'';
if(branch&&SEMVER.test(branch))throw new Error(`禁止使用语义版本作为 branch 名：${branch}；正式版本只能使用不可移动 tag`);
if(branch&&branch!=='main'&&!/^(fix|feat|chore|debug)\/[A-Za-z0-9._/-]+$/.test(branch))throw new Error(`分支名不符合规范：${branch}；只允许 main 或 fix/*、feat/*、chore/*、debug/*`);
if(branch&&(/(^|\/)source-port(?:\/|$|-)/.test(branch)||/^release[-/]/.test(branch)||/^hotfix[-/]/.test(branch)))throw new Error(`退休的分支命名不可继续使用：${branch}`);

const tag=process.env.GITHUB_REF_TYPE==='tag'?(process.env.GITHUB_REF_NAME??''):'';
if(tag&&!SEMVER.test(tag))throw new Error(`当前发布 tag 不符合语义版本：${tag}`);
const ref=tag||'main',remoteDir=`prototype/dist/${ref}`,remoteEntry=`${remoteDir}/lorestate-script.json`,receipt=`${remoteDir}/receipt.json`;
for(const path of [remoteEntry,receipt])if(!await exists(path))throw new Error(`缺少 ${ref} 远程产物：${path}`);
const remote=JSON.parse(await readFile(remoteEntry,'utf8')),record=JSON.parse(await readFile(receipt,'utf8'));
const expectedUrl=`https://testingcf.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@${ref}/artifact/bundle.js`;
if(String(remote.content).trim()!==`import '${expectedUrl}';`)throw new Error(`${ref} 远程入口必须且只能加载对应 ref 的 artifact/bundle.js`);
if(record.version!==ref||record.mode!=='remote-only'||record.remoteEntry!=='lorestate-script.json')throw new Error(`${ref} 远程收据字段不一致`);
if(!Array.isArray(record.remoteLoaders)||record.remoteLoaders.length!==1||record.remoteLoaders[0]?.url!==expectedUrl||record.remoteLoaders[0]?.ref!==ref)throw new Error(`${ref} 远程收据必须且只能声明一个对应 ref 的 bundle loader`);
if((await readdir(remoteDir)).some(name=>/offline|离线/i.test(name)))throw new Error(`${ref} 活动产物不得包含离线版`);

await walk('.');
console.log('JavaScript syntax, versioning and remote-only output checks OK');
