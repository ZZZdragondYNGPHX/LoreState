// Additive v2 display rules. Model/user text never becomes executable code or CSS.
export const DISPLAY_ATTRIBUTES = ['data-lore-if-shared','data-lore-if-field','data-lore-equals','data-lore-class-shared','data-lore-class-field','data-lore-class-map'];
export const DISPLAY_IF_SELECTOR = '[data-lore-if-shared],[data-lore-if-field]';
const DISPLAY_SELECTOR = DISPLAY_ATTRIBUTES.filter(a=>!['data-lore-equals','data-lore-class-map'].includes(a)).map(a=>'['+a+']').join(',');
function displayRules(node){
  const rules=[];
  for(const kind of ['if','class']){
    const attrs=['shared','field'].map(scope=>'data-lore-'+kind+'-'+scope).filter(a=>node.hasAttribute(a));
    const modifier=kind==='if'?'data-lore-equals':'data-lore-class-map';
    if(attrs.length>1)throw new Error('显隐或样式规则不可混用公共与实体字段');
    if(!attrs.length){if(node.hasAttribute(modifier))throw new Error(modifier+' 缺少字段来源');continue;}
    const attribute=attrs[0],field=node.getAttribute(attribute);
    if(!field||field!==field.trim())throw new Error('显隐与样式绑定需要精确字段名');
    const rule={kind,attribute,field,scope:attribute.endsWith('-shared')?'shared':'field'};
    if(kind==='if')rule.equals=node.getAttribute(modifier);
    else{
      let mapping;try{mapping=JSON.parse(node.getAttribute(modifier));}catch{throw new Error('class-map 必须是 JSON 对象');}
      if(!mapping||Array.isArray(mapping)||typeof mapping!=='object'||!Object.keys(mapping).length||Object.keys(mapping).length>32)throw new Error('class-map 必须包含 1～32 个映射');
      for(const [value,name] of Object.entries(mapping))if(value.length>200||typeof name!=='string'||!/^[-_a-zA-Z][-_a-zA-Z0-9]{0,63}$/.test(name))throw new Error('class-map 只接受最长 200 字符的值与单个安全 class 名');
      rule.mapping=Object.freeze(mapping);
    }
    rules.push(rule);
  }
  return rules;
}
export function inspectDisplayBindings(doc,elements,eachByNode,idrefs){
  const bindings=[];
  for(const node of elements){
    if(node.closest(DISPLAY_IF_SELECTOR)&&[...node.attributes].some(a=>a.name==='id'||idrefs.has(a.name)))throw new Error('条件区域不接受 id 或 IDREF 引用');
    for(const rule of displayRules(node)){
      if(!doc.body.contains(node)||node===doc.body||['STYLE','META','TITLE'].includes(node.tagName))throw new Error('显隐与样式绑定必须位于正文区域');
      const owner=eachByNode.get(node.closest('[data-lore-each]'));
      if(rule.scope==='field'&&!owner)throw new Error('实体显隐与样式绑定须位于 each 区域');
      bindings.push({node,...rule,type:owner?.type??null,region:owner?.region??null});
    }
  }
  return bindings;
}
export function validateDisplayBindings(bindings,schema){
  for(const binding of bindings){
    const fields=binding.scope==='shared'?schema.shared:schema.modules?.[binding.type];
    if(!fields?.includes(binding.field))throw new Error('显隐/样式区域 '+(binding.region??'公共')+' 未声明字段：'+binding.field);
  }
}
function displayScalar(value,diagnostics,rule){
  if(value===null||value===undefined)return null;
  if(typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return String(value);
  diagnostics.push({code:'invalid-value',field:rule.field});return null;
}
export function applyDisplayBindings(root,state,entity,diagnostics,{skipEach=false}={}){
  for(const node of [root,...root.querySelectorAll(DISPLAY_SELECTOR)]){
    if(!root.contains(node)||(skipEach&&node.closest('[data-lore-each]')))continue;
    for(const rule of displayRules(node)){
      const value=displayScalar(rule.scope==='shared'?state?.shared?.[rule.field]:entity?.fields?.[rule.field],diagnostics,rule);
      if(rule.kind==='if'){
        const keep=value!==null&&(rule.equals===null?value.trim()!=='':value===rule.equals);
        if(!keep){if(node===root)return false;node.remove();break;}
      }else if(value!==null&&Object.hasOwn(rule.mapping,value))node.classList.add(rule.mapping[value]);
    }
  }
  return true;
}
