import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {convertWishnoteMemory} from '../examples/wishnote/people/migrate.js';
import {wishnoteFields,wishnoteSchema,wishnoteBookName} from '../examples/wishnote/people/fields.js';
import {applyState,playPrompt} from '../examples/wishnote/legacy/state-v2.js';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
test('组件构建保持六条叙事原样，配置与栏目对齐',async()=>{
 execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/build-wishnote-people.mjs',import.meta.url))]);
 const source=JSON.parse(await read('examples/wishnote/legacy/worldbook-v8.json'));
 const base='examples/wishnote/people/dist/';
 const book=JSON.parse(await read(base+wishnoteBookName+'.json'));
 for(let i=0;i<6;i++)assert.deepEqual(book.entries[i],source.entries[i]);
 assert.ok(book.entries[8].content.endsWith(source.entries[8].content.slice(source.entries[8].content.indexOf('续写人格型愿望时：')).replaceAll('Wish','持续条件')));
 assert.equal(book.entries[6].disable,true);assert.equal(book.entries[8].constant,true);
 const script=JSON.parse(await read(base+'缄愿笔记_角色脚本.json')),config=script.data.lorestate_unified_v1;
 assert.deepEqual(config.schema,wishnoteSchema);assert.equal(config.book,wishnoteBookName);assert.equal(config.uid,6);assert.equal(Object.hasOwn(config,'memoryMode'),false);
 assert.deepEqual([...config.html.matchAll(/data-lore-field="([^"]+)"/g)].map(m=>m[1]),wishnoteFields);
 assert.equal(script.export_with.data,true);assert.ok(script.content.includes('@prototype-v0.4.0/'));
 for(const [name,display] of [['显示隐藏',true],['提示词过滤',false]]){
  const r=JSON.parse(await read(base+`缄愿笔记_${name}.json`));assert.equal(r.markdownOnly,display);assert.equal(r.promptOnly,!display);
  assert.equal(r.replaceString,'');const pattern=new RegExp(r.findRegex.slice(1,r.findRegex.lastIndexOf('/')),'g');
  const raw='正文保留。<LoreState version="2" mode="delta"><Person id="P01" mode="delta" presence="cold"/></LoreState>';
  assert.equal(raw.replace(pattern,r.replaceString),'正文保留。');assert.ok(raw.includes('<LoreState'));
 }
});
const hot='<WishBook><WishPerson id="P01" name="林舟" mode="hot"><Reality>已拥有一间书房。</Reality><Wish>W01｜恒｜书籍始终完好｜生效</Wish><Tie>P02｜共享书房</Tie></WishPerson></WishBook>';
const cold={entries:{0:{key:['@WishNote:P02','阿远'],content:"<WishArchive id='P02' name='阿远'>持有一封红色信件；长期负责港口邮路。</WishArchive>"}}};
test('旧热档字段与冷档原文完整保留，可接着唤醒更新',()=>{
 const result=convertWishnoteMemory(hot,cold),people=result.state.people;
 assert.equal(people.P01.fields.已成事实,'已拥有一间书房。');assert.equal(people.P01.fields.持续条件,'W01｜恒｜书籍始终完好｜生效');assert.equal(people.P01.fields.生效关联,'P02｜共享书房');
 assert.equal(people.P02.presence,'cold');assert.equal(people.P02.fields.已成事实,'持有一封红色信件；长期负责港口邮路。');assert.equal(result.originals.hotXml,hot);assert.deepEqual(result.originals.coldBook,cold);
 assert.ok(!playPrompt('记录愿效',wishnoteSchema,{state:result.state,errors:[]}).includes('长期负责港口邮路'));
 const wake=applyState(result.state,'<LoreState version="2" mode="delta"><Person id="P02" mode="delta" presence="active"/></LoreState>',wishnoteSchema);
 assert.deepEqual(wake.people.P02.fields,people.P02.fields);
});
test('热冷同号告警、重复冷档拒绝、未知字段拒绝',()=>{
 const conflict={entries:{0:{key:['@WishNote:P01'],content:"<WishArchive id='P01' name='林舟'>过期摘要</WishArchive>"}}};
 assert.match(convertWishnoteMemory(hot,conflict).warnings[0],/同时存在热冷档/);
 assert.throws(()=>convertWishnoteMemory('',{entries:{0:cold.entries[0],1:cold.entries[0]}}));
 assert.throws(()=>convertWishnoteMemory(hot.replace('<Reality>','<Unknown>').replace('</Reality>','</Unknown>')));
 assert.equal(Object.keys(convertWishnoteMemory().state.people).length,0);
});
