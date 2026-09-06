import { readFile, writeFile } from 'node:fs/promises';
import { convertBackup, convertXml } from './adapter.js';
const [kind,input,output,cold]=process.argv.slice(2);
if(!['backup','xml'].includes(kind)||!input||!output)throw new Error('用法：node examples/wishnote/migrate.mjs backup|xml 输入文件 输出基线.json [冷档世界书.json]');
const raw=await readFile(input,'utf8');
const result=kind==='backup'?{state:await convertBackup(JSON.parse(raw)),warnings:[]}:convertXml(raw,cold?JSON.parse(await readFile(cold,'utf8')):undefined);
await writeFile(output,JSON.stringify(result.state,null,2)+'\n',{flag:'wx'});
console.log('已创建基线文件；尚未写入酒馆。'+result.warnings.join('\n'));
