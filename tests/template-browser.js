
import {inspectTemplate,renderTemplate} from '../prototype/template.js';
const results=[];
function check(name,fn){try{fn();results.push('PASS '+name);}catch(e){results.push('FAIL '+name+': '+e.message);}}
function assert(ok){if(!ok)throw new Error('断言失败');}
function rejects(html){let failed=false;try{inspectTemplate(html);}catch{failed=true;}assert(failed);}
const html='<p data-lore-field="近况"></p><article data-lore-person><h3 data-lore-name></h3><small data-lore-id></small><p data-lore-field="近况"></p></article>';
const state={shared:{近况:'雨后的码头'},people:{P01:{id:'P01',name:'林舟',identity:'书商',presence:'active',fields:{近况:'<script>文本而非代码</script>'}},P02:{id:'P02',name:'阿远',identity:'邮差',presence:'active',fields:{近况:'等待回信'}},P03:{id:'P03',name:'离场人物',identity:'旧识',presence:'cold',fields:{近况:'不应展示'}}}};
const rendered=renderTemplate(html,state),doc=new DOMParser().parseFromString(rendered,'text/html');
check('公共与人物同名字段分属不同范围',()=>assert(JSON.stringify(inspectTemplate(html).schema)===JSON.stringify({shared:['近况'],person:['近况']})));
check('公共内容只出现一次，人物模板自动重复且不展示冷档',()=>{assert(doc.querySelectorAll('[data-lore-person]').length===2);assert(doc.body.textContent.includes('雨后的码头'));assert(!doc.body.textContent.includes('不应展示'));assert(doc.querySelectorAll('[data-lore-field]')[0].textContent==='雨后的码头');});
check('模型文本不执行，不被当作 HTML',()=>{assert(!doc.querySelector('script'));assert(doc.body.textContent.includes('<script>文本而非代码</script>'));assert(doc.querySelector('meta[http-equiv]').content.includes("default-src 'none'"));});
check('无人时移除人物模板，保留公共区域',()=>{const empty=new DOMParser().parseFromString(renderTemplate(html,{shared:state.shared,people:{}}),'text/html');assert(!empty.querySelector('[data-lore-person]'));assert(empty.body.textContent==='雨后的码头');});
check('拒绝重复容器和嵌套绑定',()=>{rejects(html+html);rejects('<div data-lore-person><p data-lore-field="近况"><span data-lore-name></span></p></div>');});
check('拒绝无归属人物信息和危险 HTML',()=>{rejects('<h3 data-lore-name></h3><p data-lore-field="近况"></p>');rejects('<script>alert(1)</scr'+'ipt>'+html);rejects('<p onclick="alert(1)" data-lore-field="近况"></p>');});
for(const path of ['../prototype/example.html','../examples/wishnote/people/status.html']){try{const source=await(await fetch(path)).text();const parsed=inspectTemplate(source);assert(parsed.schema.person.length>0);results.push('PASS '+path);}catch(e){results.push('FAIL '+path+': '+e.message);}}
document.getElementById('result').textContent=results.join('\n');
const frame=document.createElement('iframe');frame.title='混合状态预览';frame.setAttribute('sandbox','');frame.style='width:320px;height:360px';frame.srcdoc=rendered;document.getElementById('preview').append(frame);
