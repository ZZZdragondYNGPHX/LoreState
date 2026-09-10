import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {applyState,playPrompt,authorPolicy,initialResult} from '../prototype/core.js';
const read=name=>readFile(new URL('../docs/'+name,import.meta.url),'utf8');

test('作者教程的最小与旅行示例按顺序通过真实解析器且保留预期事实',async()=>{
  const source=await read('状态栏条目与对话示例.md');
  for(const [heading,schema,count] of [
    ['示例一：只有地点与时间',{shared:['地点','时间'],entity:[]},3],
    ['示例二：旅行中的人物、国家、物品与承诺',{shared:['地点','时间'],entity:['概况','当前状态']},6],
  ]){
    const section=source.split('## '+heading)[1].split('\n## ')[0];
    const xml=[...section.matchAll(/```xml\s*\n([\s\S]*?)```/g)].map(m=>m[1]);assert.equal(xml.length,count);
    const rules=section.match(/```text\s*\n([\s\S]*?)```/)[1];let state=null;
    for(const [i,block] of xml.entries()){state=applyState(state,block,schema,i+1);assert.ok(playPrompt(rules,schema,{state,errors:[]}).length<24000);}
    if(schema.entity.length){assert.equal(state.entities.E01.pending,false);assert.equal(state.entities.E01.presence,'cold');assert.equal(state.entities.N01.fields.当前状态,'停战延期七日，边境仍戒备');assert.equal(state.entities.I01.fields.当前状态,'由林舟保管，完好');}
    else assert.equal(state.shared.地点,'河港码头');
  }
});

test('作者文档的本地链接均指向实际文件',async()=>{
  for(const name of ['README.md','作者入门.md','状态栏条目创作指南.md','状态栏条目与对话示例.md','HTML模板适配指南.md','常见问题与试卡清单.md','0.8.0使用与统一验收.md']){
    for(const match of (await read(name)).matchAll(/\]\(([^)]+)\)/g)){
      const target=match[1];if(target.startsWith('#')||/^https?:/.test(target))continue;
      await access(new URL('../docs/'+target,import.meta.url));
    }
  }
});

test('发布材料集中在规范目录且内部附件链接有效',async()=>{
  const root=new URL('../docs/发布材料/',import.meta.url);
  for(const name of ['README.md','Discord帖子.md','作者改造教程.md','状态栏模板.html','状态栏条目.txt'])await access(new URL(name,root));
  const source=await readFile(new URL('README.md',root),'utf8');
  for(const match of source.matchAll(/`([^`]+)`/g)){const target=match[1];if(/\.(?:md|html|txt)$/.test(target))await access(new URL(target,root));}
});

test('0.8.0 可复制初始档案与字段规则通过真实校验',async()=>{
  const source=await read('0.8.0使用与统一验收.md'),schema={shared:['地点','时间'],entity:['状态']};
  const initial=source.match(/```xml\s*\n([\s\S]*?)```/)[1],constraints=JSON.parse(source.match(/```json\s*\n([\s\S]*?)```/)[1]);
  const configured={...schema,...authorPolicy(schema,initial,constraints)},result=initialResult(configured);
  assert.equal(result.state.entities.P1.fields.状态,'等待');assert.equal(result.state.shared.时间,'第三天清晨');assert.ok(playPrompt('',configured,result).includes('mode="delta"'));
});
