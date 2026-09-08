import { checkSchema } from './core.js';
import { parseModules, moduleShape } from './modules.js';
export function templateSchema(html,rules,Parser=DOMParser){
  const parsed=parseModules(rules);
  if(!parsed)throw new Error('请使用以【LoreState模块 v1】开头的模块条目，不转换旧条目');
  return validateTemplateSchema(html,moduleShape(parsed),Parser);
}
export function validateTemplateSchema(html,declared,Parser=DOMParser){
  const {schema,doc}=inspectTemplate(html,Parser);
  if(!declared)return schema;
  checkSchema(declared);
  for(const scope of ['shared','entity'])if(schema[scope].length!==declared[scope].length||schema[scope].some(f=>!declared[scope].includes(f)))throw new Error('HTML 栏目必须与模块声明一致');
  for(const group of doc.querySelectorAll('[data-lore-module]')){
    const type=group.getAttribute('data-lore-module');
    if(!Object.hasOwn(declared.modules??{},type))throw new Error('HTML 使用了未声明模块：'+type);
    for(const el of group.querySelectorAll('[data-lore-field]'))if(!declared.modules[type].includes(el.getAttribute('data-lore-field')))throw new Error('HTML 模块包含其他类别栏目：'+type);
  }
  for(const [type,fields] of Object.entries(declared.modules??{})){
    const visible=[...doc.querySelectorAll('[data-lore-entity] [data-lore-field]')].filter(el=>!el.closest('[data-lore-module]')||el.closest('[data-lore-module]').getAttribute('data-lore-module')===type).map(el=>el.getAttribute('data-lore-field'));
    if(fields.some(f=>!visible.includes(f))||visible.some(f=>!fields.includes(f)))throw new Error('HTML 必须完整且仅展示所属模块栏目：'+type);
  }
  return declared;
}
// Declarative HTML/CSS only. Opaque sandbox + CSP contain styles and prevent code/network access.
export function inspectTemplate(html, Parser=DOMParser) {
  if(typeof html!=='string'||!html.trim()||html.length>100000)throw new Error('HTML 必须为非空文字，最多 100000 字符');
  const doc=new Parser().parseFromString(html,'text/html');
  if(doc.querySelector('[data-lore-person]'))throw new Error('v3 模板请使用 data-lore-entity；不迁移旧人物模板');
  const allowed=new Set('HTML HEAD BODY TITLE META STYLE DIV SECTION ARTICLE HEADER FOOTER MAIN ASIDE NAV P SPAN H1 H2 H3 H4 H5 H6 STRONG EM B I SMALL BR HR UL OL LI DL DT DD TABLE THEAD TBODY TFOOT TR TH TD CAPTION DETAILS SUMMARY LABEL BLOCKQUOTE PRE CODE'.split(' '));
  for(const el of doc.querySelectorAll('*')){
    if(!allowed.has(el.tagName))throw new Error(`HTML 原型不接受 ${el.tagName}，请使用静态 HTML/CSS`);
    for(const attr of el.attributes)if(/^on/i.test(attr.name)||['src','href','srcdoc','action','formaction','http-equiv','contenteditable'].includes(attr.name.toLowerCase()))throw new Error(`HTML 不接受属性 ${attr.name}`);
  }
  const regions=[...doc.querySelectorAll('[data-lore-entity]')];
  const forbidden=['HTML','HEAD','BODY','STYLE','META','TITLE'];
  if(regions.length>1||regions.some(el=>forbidden.includes(el.tagName)))throw new Error('只允许一个正文实体容器');
  for(const group of doc.querySelectorAll('[data-lore-module]'))if(!group.closest('[data-lore-entity]')||group.hasAttribute('data-lore-entity')||group.hasAttribute('data-lore-field')||group.querySelector('[data-lore-module]')||!group.getAttribute('data-lore-module')?.trim())throw new Error('模块分区必须在实体容器内，不可嵌套或同时绑定栏目');
  const bindings='[data-lore-field],[data-lore-name],[data-lore-id],[data-lore-identity],[data-lore-type],[data-lore-confirmed]';
  for(const el of doc.querySelectorAll(bindings)){
    if(forbidden.includes(el.tagName)||el.hasAttribute('data-lore-entity')||el.querySelector(bindings)||['data-lore-field','data-lore-name','data-lore-id','data-lore-identity','data-lore-type','data-lore-confirmed'].filter(a=>el.hasAttribute(a)).length!==1)throw new Error('绑定须位于独立文字节点');
    if(!el.hasAttribute('data-lore-field')&&!el.closest('[data-lore-entity]'))throw new Error('实体信息必须放在实体容器中');
  }
  const nodes=[...doc.querySelectorAll('[data-lore-field]')];
  const schema={shared:[],entity:[]};
  for(const el of nodes){const fields=schema[el.closest('[data-lore-entity]')?'entity':'shared'],name=el.getAttribute('data-lore-field');if(!fields.includes(name))fields.push(name);}
  checkSchema(schema);
  if(regions.length&&!schema.entity.length)throw new Error('实体容器至少需要一个实体栏目');
  return {doc,schema};
}
export function renderTemplate(html,state,Parser=DOMParser){
  const {doc}=inspectTemplate(html,Parser);
  function fill(root,fields){for(const el of root.querySelectorAll('[data-lore-field]')){const field=el.getAttribute('data-lore-field');el.textContent=Object.hasOwn(fields??{},field)?fields[field]:'尚未记录';}}
  const region=doc.querySelector('[data-lore-entity]');
  if(region){
    for(const entity of Object.values(state?.entities??{}).filter(p=>p.presence==='active')){
      const clone=region.cloneNode(true);
      for(const group of clone.querySelectorAll('[data-lore-module]'))if(group.getAttribute('data-lore-module')!==entity.type)group.remove();
      fill(clone,entity.fields);
      for(const key of ['name','id','identity','type','confirmed'])for(const el of clone.querySelectorAll(`[data-lore-${key}]`))el.textContent=entity[key]??'未知';
      // Repeated HTML must not create duplicate document IDs.
      clone.removeAttribute('id');for(const el of clone.querySelectorAll('[id]'))el.removeAttribute('id');
      region.before(clone);
    }
    region.remove();
  }
  for(const el of doc.querySelectorAll('[data-lore-field]'))if(!el.closest('[data-lore-entity]')){const field=el.getAttribute('data-lore-field');el.textContent=Object.hasOwn(state?.shared??{},field)?state.shared[field]:'尚未记录';}
  const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";doc.head.prepend(csp);
  const base=doc.createElement('style');base.textContent='*{box-sizing:border-box}body{margin:0;padding:12px;color:#e5dfd3;background:#242421;font:14px/1.6 system-ui} [data-lore-field]{white-space:pre-wrap;overflow-wrap:anywhere}';doc.head.insertBefore(base,csp.nextSibling);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
