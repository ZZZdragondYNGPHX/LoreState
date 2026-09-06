import {readFile,writeFile} from 'node:fs/promises';
import {convertWishnoteMemory} from '../examples/wishnote/people/migrate.js';
const [hotFile,coldFile,outFile]=process.argv.slice(2);
if(!hotFile||!coldFile||!outFile)throw new Error('用法：node scripts/migrate-wishnote-people.mjs 热档.xml 冷档世界书.json 输出.json；缺少某份输入时用 -');
const hot=hotFile==='-'?'':await readFile(hotFile,'utf8'),cold=coldFile==='-'?null:JSON.parse(await readFile(coldFile,'utf8'));
const result=convertWishnoteMemory(hot,cold);
await writeFile(outFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(`已生成本地转换预览，${Object.keys(result.state.people).length} 人，${result.warnings.length} 项提示。未修改酒馆。`);
