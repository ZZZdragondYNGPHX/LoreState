import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listPresets,sameFields,savePreset,deletePreset} from '../prototype/presets.js';
test('旧版 HTML 可直接迁移，另存预设保留配置与当前 HTML',()=>{
 const old={html:'old',fields:['地点'],book:'世界书',ready:true,unknown:{keep:true}};
 const next=savePreset(old,'夜间','new','night');
 assert.deepEqual(listPresets(old),[{id:'legacy',name:'原有样式',html:'old'}]);
 assert.equal(next.html,'old');assert.equal(next.book,old.book);assert.deepEqual(next.unknown,old.unknown);
 assert.equal(next.presets.length,2);assert.equal(old.presets,undefined);
});
test('栏目顺序可变，增删栏目不可作为换肤',()=>{
 assert.equal(sameFields(['地点','衣着'],['衣着','地点']),true);
 assert.equal(sameFields(['地点'],['衣着']),false);
 assert.equal(sameFields(['地点'],['地点','衣着']),false);
});
test('覆盖不增加条目，重名和删除当前预设会拒绝',()=>{
 const original=savePreset({html:'old'},'夜间','new','night');
 const updated=savePreset(original,'夜间新版','newer','night');
 assert.equal(updated.presets.length,2);assert.equal(original.presets[1].html,'new');
 assert.throws(()=>savePreset(updated,'夜间新版','x','another'));
 assert.throws(()=>savePreset(updated,'   ','x','another'));
 assert.throws(()=>deletePreset(updated,'legacy'));
 assert.equal(deletePreset(updated,'night').presets.length,1);
});
