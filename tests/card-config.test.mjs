import test from 'node:test';
import assert from 'node:assert/strict';
import {portableUpdateDefaults,captureCardRule,readCardRule,enableCardScriptExport} from '../prototype/card-config.js';

const config={book:'本机世界书',uid:7,schema:{shared:['地点'],entity:[]}};
const entry={uid:7,name:'状态规则',content:'记录明确地点变化'};
test('随卡默认值只保留可移植行为，不含个人 API 与酒馆预设',()=>{
  const defaults=portableUpdateDefaults({mode:'extra',auto:false,stream:true,attempts:4,timeoutSeconds:90,profileId:'private-id',source:'current',presetMode:'named',presetName:'私人预设',key:'synthetic-secret'});
  assert.deepEqual(defaults,{mode:'extra',auto:false,stream:true,attempts:4,timeoutSeconds:90});
});
test('规则副本完整往返，缺失本机世界书时可读，已有书删除条目仍报错',async()=>{
  const saved=JSON.parse(JSON.stringify({...config,ruleSnapshot:captureCardRule(config,entry)}));
  assert.equal((await readCardRule(saved,async()=>{throw new Error('找不到世界书');})).content,entry.content);
  assert.equal((await readCardRule(saved,async()=>[{...entry,content:'已修改的规则'}])).content,'已修改的规则');
  await assert.rejects(readCardRule(saved,async()=>[]),/关联失效/);
  await assert.rejects(readCardRule({...saved,uid:8},async()=>{throw new Error('丢失');}),/丢失/);
  assert.throws(()=>captureCardRule(config,{...entry,content:'x'.repeat(24001)}),/24000/);
  assert.throws(()=>captureCardRule({...config,schema:{shared:[],entity:['状态'],modules:{人物:['状态']}}},entry),/不一致/);
});
test('导出开关只更新本角色卡的目标脚本，保留全部数据和其他脚本',()=>{
  const trees=[{type:'folder',name:'工具',scripts:[{type:'script',id:'ours',data:{rules:'保留',unknown:1},export_with:{data:false,button:false,other:true}},{type:'script',id:'other',export_with:{data:false}}]}];
  const result=enableCardScriptExport(trees,'ours');
  assert.deepEqual(result[0].scripts[0].export_with,{data:true,button:true,other:true});
  assert.deepEqual(result[0].scripts[0].data,trees[0].scripts[0].data);
  assert.equal(result[0].scripts[1],trees[0].scripts[1]);assert.equal(trees[0].scripts[0].export_with.data,false);
  assert.throws(()=>enableCardScriptExport(trees,'missing'),/不在角色卡/);
});
