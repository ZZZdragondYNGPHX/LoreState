import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listPresets,sameSchema,savePreset,deletePreset} from '../prototype/presets.js';
test('不迁移旧版 HTML，另存预设保留当前配置',()=>{
 const old={html:'old',fields:['地点'],book:'世界书',ready:true,unknown:{keep:true}};
 const next=savePreset(old,'夜间','new','night');
 assert.deepEqual(listPresets(old),[]);
 assert.equal(next.html,'old');assert.equal(next.book,old.book);assert.deepEqual(next.unknown,old.unknown);
 assert.equal(next.presets.length,1);assert.equal(old.presets,undefined);
});
test('栏目顺序可变，增删栏目不可作为换肤',()=>{
 assert.equal(sameSchema({shared:['地点','衣着'],person:[]},{shared:['衣着','地点'],person:[]}),true);
 assert.equal(sameSchema({shared:['地点'],person:[]},{shared:[],person:['地点']}),false);
 assert.equal(sameSchema({shared:['地点'],person:[]},{shared:['地点','衣着'],person:[]}),false);
});
test('覆盖不增加条目，重名和删除当前预设会拒绝',()=>{
 const original=savePreset({html:'old'},'夜间','new','night');
 const updated=savePreset(original,'夜间新版','newer','night');
 assert.equal(updated.presets.length,1);assert.equal(original.presets[0].html,'new');
 assert.throws(()=>savePreset(updated,'夜间新版','x','another'));
 assert.throws(()=>savePreset(updated,'   ','x','another'));
 assert.throws(()=>deletePreset({...updated,activePresetId:'night'},'night'));
 assert.equal(deletePreset(updated,'night').presets.length,0);
});
