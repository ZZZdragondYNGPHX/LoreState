
import {inspectTemplate,renderTemplate} from '../prototype/template.js';
const results=[];
function check(name,fn){try{fn();results.push('PASS '+name);}catch(e){results.push('FAIL '+name+': '+e.message);}}
function assert(ok){if(!ok)throw new Error('断言失败');}
function rejects(html){let failed=false;try{inspectTemplate(html);}catch{failed=true;}assert(failed);}
const html='<p data-lore-field="近况"></p><article data-lore-entity><h3 data-lore-name></h3><small data-lore-id></small><p data-lore-field="近况"></p></article>';
const state={shared:{近况:'雨后的码头'},entities:{P01:{id:'P01',name:'林舟',identity:'书商',presence:'active',fields:{近况:'<script>文本而非代码</script>'}},P02:{id:'P02',name:'阿远',identity:'邮差',presence:'active',fields:{近况:'等待回信'}},P03:{id:'P03',name:'离场实体',identity:'旧识',presence:'cold',fields:{近况:'不应展示'}}}};
const rendered=renderTemplate(html,state),doc=new DOMParser().parseFromString(rendered,'text/html');
check('公共与实体同名字段分属不同范围',()=>assert(JSON.stringify(inspectTemplate(html).schema)===JSON.stringify({shared:['近况'],entity:['近况']})));
check('公共内容只出现一次，实体模板自动重复且不展示冷档',()=>{assert(doc.querySelectorAll('[data-lore-entity]').length===2);assert(doc.body.textContent.includes('雨后的码头'));assert(!doc.body.textContent.includes('不应展示'));assert(doc.querySelectorAll('[data-lore-field]')[0].textContent==='雨后的码头');});
check('模型文本不执行，不被当作 HTML',()=>{assert(!doc.querySelector('script'));assert(doc.body.textContent.includes('<script>文本而非代码</script>'));assert(doc.querySelector('meta[http-equiv]').content.includes("default-src 'none'"));});
check('无人时移除实体模板，保留公共区域',()=>{const empty=new DOMParser().parseFromString(renderTemplate(html,{shared:state.shared,entities:{}}),'text/html');assert(!empty.querySelector('[data-lore-entity]'));assert(empty.body.textContent==='雨后的码头');});
check('拒绝重复容器和嵌套绑定',()=>{rejects(html+html);rejects('<div data-lore-entity><p data-lore-field="近况"><span data-lore-name></span></p></div>');});
check('拒绝无归属实体信息和危险 HTML',()=>{rejects('<h3 data-lore-name></h3><p data-lore-field="近况"></p>');rejects('<script>alert(1)</scr'+'ipt>'+html);rejects('<p onclick="alert(1)" data-lore-field="近况"></p>');});
check('类别与确认时间安全绑定，旧人物模板明确拒绝',()=>{
  const source='<article data-lore-entity><b data-lore-type></b><small data-lore-confirmed></small><p data-lore-field="近况"></p></article>';
  const rendered=new DOMParser().parseFromString(renderTemplate(source,{entities:{N01:{type:'国家',confirmed:'第三天',presence:'active',fields:{近况:'停战'}}}}),'text/html');
  assert(rendered.querySelector('[data-lore-type]').textContent==='国家');assert(rendered.querySelector('[data-lore-confirmed]').textContent==='第三天');
  rejects('<article data-lore-person><p data-lore-field="近况"></p></article>');
});
for(const path of ['../prototype/example.html']){try{const source=await(await fetch(path)).text();const parsed=inspectTemplate(source);assert(parsed.schema.entity.length>0);results.push('PASS '+path);}catch(e){results.push('FAIL '+path+': '+e.message);}}
try{
  const prose=await(await fetch('../docs/HTML模板适配指南.md')).text();const source=prose.match(/```html\s*\n([\s\S]*?)```/)[1];
  const schema=inspectTemplate(source).schema;
  assert(JSON.stringify(schema)===JSON.stringify({shared:['地点','时间'],entity:['概况','当前状态']}));
  const result=new DOMParser().parseFromString(renderTemplate(source,{shared:{地点:'河港',时间:'第三天'},entities:{P01:{id:'P01',name:'林舟',type:'人物',confirmed:'第三天',presence:'active',fields:{概况:'书商',当前状态:'备货'}}}}),'text/html');
  assert(result.body.textContent.includes('林舟'));assert(result.body.textContent.includes('备货'));
  results.push('PASS 作者文档完整模板的栏目与实际绑定');
}catch(e){results.push('FAIL 作者文档模板: '+e.message);}
const {templateSchema,validateTemplateSchema}=await import('../prototype/template.js');
const moduleHtml=await(await fetch('../prototype/module-example.html')).text();
const moduleRules=await(await fetch('../prototype/module-example.txt')).text();
check('模块示例按声明建模，各类别仅渲染自己的栏目',()=>{
  const schema=templateSchema(moduleHtml,moduleRules);assert(schema.modules.人物.includes('身体状况'));
  const source=renderTemplate(moduleHtml,{shared:{地点:'港口',时间:'清晨'},entities:{P1:{type:'人物',name:'林舟',presence:'active',fields:{身体状况:'健康',当前目标:'回家'}},I1:{type:'物品',name:'钥匙',presence:'active',fields:{持有者:'守卫',完好状况:'完好'}}}});
  const doc=new DOMParser().parseFromString(source,'text/html'),regions=[...doc.querySelectorAll('[data-lore-entity]')];
  assert(regions.length===2);assert(regions[0].textContent.includes('健康'));assert(!regions[0].textContent.includes('持有者'));assert(!regions[1].textContent.includes('身体状况'));assert(regions[1].textContent.includes('守卫'));
  assert(regions[0].querySelectorAll('[data-lore-module]').length===1);
});
check('模板拒绝错类绑定、缺失栏目、嵌套分区和错误模块',()=>{
  const schema=templateSchema(moduleHtml,moduleRules);
  for(const source of [moduleHtml.replace('data-lore-module="人物"','data-lore-module="物品"'),moduleHtml.replace('data-lore-field="身体状况"','data-lore-field="完好状况"'),moduleHtml.replace('data-lore-module="人物"','data-lore-module="未知"'),moduleHtml.replace('<dl>','<dl data-lore-module="人物">')]){let failed=false;try{validateTemplateSchema(source,schema);}catch{failed=true;}assert(failed);}
});
document.getElementById('result').textContent=results.join('\n');
const frame=document.createElement('iframe');frame.title='混合状态预览';frame.setAttribute('sandbox','');frame.style='width:320px;height:360px';frame.srcdoc=rendered;document.getElementById('preview').append(frame);
