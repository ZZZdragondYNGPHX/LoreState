(()=>{
'use strict';
// Independent of SillyTavern: a small text-tag protocol for the author-flow prototype.
const PROTO_KEY = 'lorestate_text_prototype_v1';
const TAG_PATTERN = '<LoreState\\b[^>]*>[\\s\\S]*?<\\/LoreState>';
function checkFields(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.length > 32 || new Set(fields).size !== fields.length) throw new Error('需要 1–32 个不同的栏目');
  for (const field of fields) if (!/^[\p{L}_][\p{L}\p{N}_-]{0,39}$/u.test(field) || ['__proto__','constructor','prototype','LoreState'].includes(field)) throw new Error(`栏目名称不支持：${field}`);
  return fields;
}
function xmlText(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;'); }
function decode(value) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/.test(value)) throw new Error('文字里的 & 必须写成 &amp;');
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_, code) => {
    if (!code.startsWith('#')) return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[code];
    const point=code[1]==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
    if (point < 32 && ![9,10,13].includes(point) || point>0x10ffff || point>=0xd800&&point<=0xdfff) throw new Error('不支持的 XML 字符');
    return String.fromCodePoint(point);
  });
}
function parseUpdate(source, fields) {
  checkFields(fields);
  if (typeof source!=='string' || source.length>200000) throw new Error('消息文字过长');
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if (blocks.length!==1 || (source.match(/<LoreState\b/g)||[]).length!==1) throw new Error('需要且只能有一段完整 LoreState 标签');
  const match=blocks[0][0].match(/^<LoreState\s+mode=(?:"(full|delta)"|'(full|delta)')\s*>([\s\S]*)<\/LoreState>$/);
  if(!match)throw new Error('LoreState 需要 mode="full" 或 mode="delta"');
  let rest=match[3].trim(); const changes=[];const seen=new Set();
  while(rest){
    const m=rest.match(/^<([\p{L}_][\p{L}\p{N}_-]*)(?:\s+action=(?:"(remove)"|'(remove)'))?\s*(?:\/>|>([^<]*)<\/\1>)/u);
    if(!m)throw new Error('栏目标签格式无效；原型只接受单层文字栏目');
    const name=m[1],remove=!!(m[2]||m[3]);
    if(!fields.includes(name)||seen.has(name))throw new Error(`未知或重复栏目：${name}`);
    seen.add(name);
    const value=decode(m[4]??'').trim();
    if(remove && value)throw new Error('移除标签不能同时提供新内容');
    if(!remove&&(!value||value.length>6000))throw new Error(`${name} 内容须为非空文字，最多 6000 字符`);
    changes.push({name,remove,value});rest=rest.slice(m[0].length).trim();
  }
  return {mode:match[1]||match[2],changes};
}
function applyUpdate(previous, update, fields) {
  if(!previous && update.mode!=='full')throw new Error('尚未初始化，首次需要完整状态');
  if(previous && update.mode!=='delta')throw new Error('已有状态，请仅输出变化（delta）');
  if(update.mode==='full'&&(update.changes.length!==fields.length||update.changes.some(x=>x.remove)))throw new Error('首次完整状态必须包含全部栏目');
  const draft={...previous};
  for(const {name,remove,value} of update.changes){
    if(remove){if(!Object.hasOwn(draft,name))throw new Error(`无法移除不存在的栏目内容：${name}`);delete draft[name];}
    else draft[name]=value;
  }
  return draft;
}
function replayText(messages, fields, start=1) {
  let state=null;const errors=[];const records=[];
  for(const message of messages){
    if(message.message_id<start||message.role!=='assistant'||message.is_hidden)continue;
    try {state=applyUpdate(state,parseUpdate(message.message,fields),fields);records.push({floor:message.message_id,state:{...state}});}
    catch(e){errors.push({floor:message.message_id,message:e.message});}
  }
  return {state,errors,records};
}
function stateXml(state, fields) { return fields.filter(f=>Object.hasOwn(state??{},f)).map(f=>`<${f}>${xmlText(state[f])}</${f}>`).join('\n'); }
function playPrompt(rules, fields, result) {
  const text=`LoreState 文字状态原型 v1\n以下是作者选择的状态栏规则：\n${rules}\n\n输出协议由下面的约定统一负责；作者规则中的全量复述要求仅表示显示完整，不要求每轮生成完整内容。\n正文结束后输出一个 <LoreState mode="${result.state?'delta':'full'}">…</LoreState>。栏目固定为：${fields.join('、')}。\n${result.state?'只输出变化的栏目；未提及保留。没有变化输出空的 delta 标签。':'首次必须为每个栏目提供完整文字。已知设定优先，缺少的内容允许合理补充，但不得凭空加入改变关键剧情的事实。'}\n每项写成 <栏目名>完整的新文字</栏目名>。列表暂时写成该栏目中的多行文字，变化时替换这一栏目。明确移除某项栏目内容时写 <栏目名 action="remove"/>；不使用省略表示删除。只更新剧情确实改变的内容。不要输出 HTML、JSON、脚本、旧状态栏模板或额外的状态块。文字中的 & 和 < 分别转义为 &amp; 和 &lt;。\n当前保存的状态（不代表本轮输出格式）：\n${result.state?stateXml(result.state,fields):'尚未建立'}\n${result.errors.length?'注意：之前有状态更新未应用。不要假定错误更新已经生效，依据正文与下列有效状态继续。':''}`;
  if(text.length>24000)throw new Error('状态与规则超过原型的 24000 字符预算');return text;
}
function authorPrompt(rules) {
  return `请根据以下世界书状态栏条目，制作 LoreState 的完整 HTML 外观。只返回 HTML，不需要替我制作存储脚本。\n接口约定：每个文字栏目的展示节点使用 data-lore-field="中文栏目名"。名字须为文字开头，随后只含文字、数字、下划线或连字符，不能含空格。最多32个栏目。脚本将以 textContent 填入完整状态，因此绑定节点中不要放标签标题或嵌套的绑定节点；标题放在旁边。可用 CSS 和 details/summary 折叠，不使用 JavaScript、事件属性、外部资源、表单、iframe、SVG、网络请求。CSS 写在 style 标签中，适应窄屏，文字可换行。数值作为文字展示即可。不要使用 {{变量}} 或要求 AI 每轮重写 HTML。人物/物品等列表在本原型中作为一个栏目的多行文字展示。除 data-lore-field 外，不需要额外配置。\n最小例子：<section><h3>地点</h3><p data-lore-field="地点"></p></section>\n以下是状态栏条目：\n${rules}`;
}

// Declarative HTML/CSS only. Opaque sandbox + CSP contain styles and prevent code/network access.
function inspectTemplate(html, Parser=DOMParser) {
  if(typeof html!=='string'||!html.trim()||html.length>100000)throw new Error('HTML 必须为非空文字，最多 100000 字符');
  const doc=new Parser().parseFromString(html,'text/html');
  const allowed=new Set('HTML HEAD BODY TITLE META STYLE DIV SECTION ARTICLE HEADER FOOTER MAIN ASIDE NAV P SPAN H1 H2 H3 H4 H5 H6 STRONG EM B I SMALL BR HR UL OL LI DL DT DD TABLE THEAD TBODY TFOOT TR TH TD CAPTION DETAILS SUMMARY LABEL BLOCKQUOTE PRE CODE'.split(' '));
  for(const el of doc.querySelectorAll('*')){
    if(!allowed.has(el.tagName))throw new Error(`HTML 原型不接受 ${el.tagName}，请使用静态 HTML/CSS`);
    for(const attr of el.attributes)if(/^on/i.test(attr.name)||['src','href','srcdoc','action','formaction','http-equiv','contenteditable'].includes(attr.name.toLowerCase()))throw new Error(`HTML 不接受属性 ${attr.name}`);
  }
  const nodes=[...doc.querySelectorAll('[data-lore-field]')];
  if(nodes.some(el=>['HTML','HEAD','BODY','STYLE','META','TITLE'].includes(el.tagName)||el.querySelector('[data-lore-field]')))throw new Error('栏目绑定须位于正文的独立文字节点');
  const fields=[...new Set(nodes.map(el=>el.getAttribute('data-lore-field')))];
  checkFields(fields);
  return {doc,fields};
}
function renderTemplate(html,state,Parser=DOMParser){
  const {doc}=inspectTemplate(html,Parser);
  for(const el of doc.querySelectorAll('[data-lore-field]')){
    const field=el.getAttribute('data-lore-field');el.textContent=Object.hasOwn(state??{},field)?state[field]:'尚未记录';
  }
  const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";doc.head.prepend(csp);
  const base=doc.createElement('style');base.textContent='*{box-sizing:border-box}body{margin:0;padding:12px;color:#e5dfd3;background:#242421;font:14px/1.6 system-ui} [data-lore-field]{white-space:pre-wrap;overflow-wrap:anywhere}';doc.head.insertBefore(base,csp.nextSibling);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}

// Presets contain presentation only; rules and chat state are never copied here.
function listPresets(config) {
  if(Array.isArray(config.presets)&&config.presets.length)return config.presets.map(p=>({...p}));
  return config.html?[{id:'legacy',name:'原有样式',html:config.html}]:[];
}
function sameFields(a,b){return a.length===b.length&&a.every(f=>b.includes(f));}
function savePreset(config,name,html,id){
  name=name.trim();if(!name||name.length>40)throw new Error('预设名称需为 1～40 个字符');
  const presets=listPresets(config);
  if(presets.some(p=>p.name===name&&p.id!==id))throw new Error('已有同名预设，请换个名称或选择覆盖');
  const index=presets.findIndex(p=>p.id===id);
  if(index<0&&presets.length>=20)throw new Error('最多保存 20 份预设');
  const preset={id,name,html};if(index<0)presets.push(preset);else presets[index]=preset;
  return {...config,presets};
}
function deletePreset(config,id){
  if(id===(config.activePresetId??'legacy'))throw new Error('请先切换到其他预设，再删除当前样式');
  return {...config,presets:listPresets(config).filter(p=>p.id!==id)};
}


// Runs inside the owning Tavern Helper character script, including remote imports.
function startPrototype(defaultHtml) {
  const doc=window.parent.document,ctx=()=>window.parent.SillyTavern.getContext();
  if(doc.getElementById('lorestate-prototype-settings'))throw new Error('已有 LoreState 原型脚本运行，请勿重复启用');
  const settings=()=>getVariables({type:'script'})[PROTO_KEY]??{};
  const chatSettings=()=>getVariables({type:'chat'})[PROTO_KEY]??{};
  const messages=()=>getChatMessages('0-{{lastMessageId}}');
  const identity=()=>[ctx().chat,ctx().getCurrentChatId()];
  const matches=([chat,id])=>!closed&&ctx().chat===chat&&ctx().getCurrentChatId()===id;
  let closed=false,queue=Promise.resolve(),pending=false,uninject=null,view=null,renderKey='',menuObserver;
  const node=(tag,text,parent)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;parent?.append(el);return el;};
  const panel=node('dialog',undefined,doc.body);panel.id='lorestate-prototype-settings';panel.setAttribute('aria-label','LoreState 原型设置');
  panel.style.cssText='width:min(800px,94vw);max-height:88vh;overflow:auto;background:#252723;color:#eee8dc;border:1px solid #858b6c;border-radius:12px;padding:20px';
  const style=node('style',undefined,panel);style.textContent='#lorestate-prototype-settings button,#lorestate-prototype-settings select{font:inherit;margin:6px;padding:7px;background:#3a4033;color:#eee;border:1px solid #7b8765;border-radius:5px}#lorestate-prototype-settings textarea{display:block;width:100%;box-sizing:border-box;min-height:110px;background:#191d18;color:#eee;margin:8px 0}#lorestate-prototype-settings label{display:block;margin-top:12px}';
  node('h2','LoreState · 文字状态原型',panel);
  const status=node('p','选择状态栏条目，再粘贴 HTML。保存后在下一次 AI 回复建立状态。',panel);status.setAttribute('role','status');
  const report=text=>{status.textContent=text;};
  const button=(title,parent,fn)=>{const el=node('button',title,parent);el.type='button';el.onclick=async()=>{el.disabled=true;try{await fn();}catch(e){report(e.message);}finally{el.disabled=false;}};return el;};
  button('关闭',panel,()=>panel.close());
  const bookLabel=node('label','1. 角色／聊天绑定的世界书',panel),books=node('select',undefined,bookLabel);books.setAttribute('aria-label','世界书');
  const entryLabel=node('label','状态栏条目',panel),entries=node('select',undefined,entryLabel);entries.setAttribute('aria-label','状态栏条目');
  const rules=node('textarea',undefined,panel);rules.readOnly=true;rules.setAttribute('aria-label','条目内容');
  let loadedEntries=[];
  const selectedEntry=()=>loadedEntries.find(e=>String(e.uid)===entries.value);
  async function loadEntries(){
    const id=identity(),name=books.value;if(!name){loadedEntries=[];entries.replaceChildren();rules.value='';return;}
    const data=await getWorldbook(name);if(!matches(id)||books.value!==name)return;
    loadedEntries=data;entries.replaceChildren();for(const e of data){const opt=node('option',e.name||`条目 ${e.uid}`,entries);opt.value=String(e.uid);}
    const saved=settings();if(saved.book===name&&data.some(e=>e.uid===saved.uid))entries.value=String(saved.uid);
    rules.value=selectedEntry()?.content??'';
  }
  async function loadBooks(){
    const bound=getCharWorldbookNames('current'),chatBook=getChatWorldbookName('current');
    const names=[...new Set([bound.primary,...bound.additional,chatBook].filter(Boolean))];books.replaceChildren();
    for(const name of names)node('option',name,books).value=name;
    if(names.includes(settings().book))books.value=settings().book;
    await loadEntries();if(!names.length)report('当前角色没有绑定世界书。请先在酒馆绑定状态栏世界书，再刷新列表。');
  }
  books.onchange=()=>loadEntries().catch(e=>report(e.message));entries.onchange=()=>{rules.value=selectedEntry()?.content??'';};
  button('刷新世界书列表',panel,loadBooks);
  const maker=node('textarea',undefined,panel);maker.readOnly=true;maker.setAttribute('aria-label','HTML 制作提示词');maker.placeholder='点击下方按钮生成提示词，可复制给网页 AI';
  button('生成并复制 HTML 制作提示词',panel,async()=>{
    if(!selectedEntry()?.content?.trim())throw new Error('请先选择有内容的状态栏条目');
    maker.value=authorPrompt(selectedEntry().content);
    try{await navigator.clipboard.writeText(maker.value);report('制作提示词已复制。交给网页 AI 后，将 HTML 粘贴到下方。');}
    catch{report('制作提示词已生成，请从文本框手动复制。');}
  });
  const htmlLabel=node('label','2. 粘贴网页 AI 生成的 HTML',panel),html=node('textarea',undefined,htmlLabel);html.setAttribute('aria-label','HTML 模板');html.rows=9;html.value=settings().html||defaultHtml;
  const presetLabel=node('label','HTML 预设（随卡保存）',panel),presetSelect=node('select',undefined,presetLabel);presetSelect.setAttribute('aria-label','HTML 预设');
  const nameLabel=node('label','预设名称',panel),presetName=node('input',undefined,nameLabel);presetName.maxLength=40;presetName.setAttribute('aria-label','预设名称');
  function syncPresets(id=settings().activePresetId??'legacy'){
    presetSelect.replaceChildren();for(const p of listPresets(settings())){const option=node('option',p.name,presetSelect);option.value=p.id;}
    if(listPresets(settings()).some(p=>p.id===id))presetSelect.value=id;
    presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'我的样式';
  }
  function writeConfig(config){updateVariablesWith(v=>({...v,[PROTO_KEY]:config}),{type:'script'});}
  function validateSkin(source){const parsed=inspectTemplate(source),config=settings();if(config.ready&&config.fields&&!sameFields(parsed.fields,config.fields))throw new Error('预设的栏目必须与当前配置一致；可以调整顺序和外观，不能增删栏目');return parsed;}
  presetSelect.onchange=()=>{presetName.value=listPresets(settings()).find(p=>p.id===presetSelect.value)?.name??'';};
  button('另存为新预设',panel,()=>{validateSkin(html.value);const id=crypto.randomUUID();writeConfig(savePreset(settings(),presetName.value,html.value,id));syncPresets(id);report('已保存新预设。点击“应用所选预设”才会切换当前样式。');});
  button('覆盖所选预设',panel,async()=>{validateSkin(html.value);const config=settings(),id=presetSelect.value;if(!id)throw new Error('请先保存一份预设');let next=savePreset(config,presetName.value,html.value,id);if(id===(config.activePresetId??'legacy'))next={...next,html:html.value};writeConfig(next);syncPresets(id);renderKey='';await refresh();report('预设已更新，聊天状态保留。');});
  button('应用所选预设',panel,async()=>{const config=settings(),preset=listPresets(config).find(p=>p.id===presetSelect.value);if(!preset)throw new Error('请先保存一份预设');validateSkin(preset.html);if(!config.ready)throw new Error('请先点击“保存 HTML 并启用本聊天”完成初始配置');writeConfig({...config,presets:listPresets(config),html:preset.html,activePresetId:preset.id});html.value=preset.html;renderKey='';await refresh();report(`已应用“${preset.name}”，聊天状态保留。`);});
  button('删除所选预设',panel,()=>{writeConfig(deletePreset(settings(),presetSelect.value));syncPresets();report('已删除所选预设，当前展示保留。');});
  syncPresets();
  const preview=node('iframe',undefined,panel);preview.title='LoreState HTML 预览';preview.setAttribute('sandbox','');preview.style.cssText='width:100%;height:260px;border:0;border-radius:8px';
  const getResult=(config=settings(),list=messages())=>replayText(list,config.fields,chatSettings().start??1);
  button('预览 HTML（不保存）',panel,()=>{
    const parsed=inspectTemplate(html.value);const config=settings();
    const state=config.fields?getResult(config).state:null;
    preview.srcdoc=renderTemplate(html.value,state??Object.fromEntries(parsed.fields.map(f=>[f,`${f}的示例文字`])));
    report(`已识别栏目：${parsed.fields.join('、')}。预览未保存。`);
  });
  const regexId='lorestate-text-prototype-tags-v1';
  async function installRegex(){
    await updateTavernRegexesWith(old=>[
      ...old.filter(r=>![regexId,`${regexId}-display`,`${regexId}-prompt`].includes(r.id)),
      ...['display','prompt'].map(destination=>({id:`${regexId}-${destination}`,script_name:`LoreState 原型｜${destination==='display'?'仅显示：隐藏更新标签':'仅提示词：过滤历史更新标签'}（保留正文）`,enabled:true,find_regex:`/${TAG_PATTERN}/g`,replace_string:'',trim_strings:[],source:{user_input:false,ai_output:true,slash_command:false,world_info:false,reasoning:false},destination:{display:destination==='display',prompt:destination==='prompt'},run_on_edit:true,min_depth:null,max_depth:null})),
    ],{type:'character'});
  }
  button('保存 HTML 并启用本聊天',panel,async()=>{
    const original=identity(),entry=selectedEntry(),book=books.value;
    if(!entry?.content?.trim())throw new Error('请先选中状态栏条目');
    if(!ctx().getCurrentChatId()||!messages().length)throw new Error('请先打开角色聊天');
    if(ctx().chatMetadata?.wishnote_v1?.enabled||ctx().chatMetadata?.lorestate_v1?.enabled)throw new Error('本聊天启用了旧扩展状态，请先停用旧版或使用新测试聊天');
    const {fields}=inspectTemplate(html.value),previous=settings();
    if(previous.ready&&previous.fields&&!sameFields(fields,previous.fields))throw new Error('已有配置不支持改变栏目，以免影响其他聊天。新栏目请使用独立角色脚本。');
    const activePresetId=previous.activePresetId??'legacy';
    const activeName=listPresets(previous).find(p=>p.id===activePresetId)?.name??'默认样式';
    const config=savePreset({...previous,version:2,ready:true,book,uid:entry.uid,entryName:entry.name,html:html.value,fields,activePresetId},activeName,html.value,activePresetId);
    updateVariablesWith(v=>({...v,[PROTO_KEY]:config}),{type:'script'});
    const old=chatSettings();updateVariablesWith(v=>({...v,[PROTO_KEY]:{...old,enabled:true,start:old.start??Math.max(1,messages().length)}}),{type:'chat'});
    // Separate display and prompt copy filters; neither edits the source message.
    await installRegex();if(!matches(original))return;
    if(!isCharacterTavernRegexesEnabled())report('已保存，但本卡局部正则未启用。请启用局部正则后生成，否则历史标签仍会进入上下文。');
    else report('已保存到随卡脚本，并安装本卡标签过滤正则。首次 AI 回复需完整状态，之后只写变化。');
    renderKey='';await refresh();
  });
  button('查看下一轮状态提示',panel,async()=>{
    const config=settings(),source=await getWorldbook(config.book),entry=source.find(e=>e.uid===config.uid);
    if(!entry)throw new Error('保存的世界书关联已失效，请重新选择');
    maker.value=playPrompt(entry.content,config.fields,getResult(config));report('此处仅预览提示，没有调用模型。');
  });
  button('暂停本聊天',panel,async()=>{
    updateVariablesWith(v=>({...v,[PROTO_KEY]:{...chatSettings(),enabled:false}}),{type:'chat'});uninject?.();uninject=null;view?.remove();report('已暂停；数据和 HTML 保留，标签过滤正则保留。');
  });
  async function open(){if(!panel.open)panel.showModal();html.value=settings().html||html.value;syncPresets();await loadBooks();}
  const menu=node('div');menu.className='extension_container';
  const opener=button('LoreState · 原型设置',menu,open);opener.className='list-group-item';opener.style.cssText='background:transparent;color:inherit;border:0;text-align:left;width:100%;font:inherit';
  const mount=()=>{const target=doc.getElementById('extensionsMenu');if(target){target.append(menu);menuObserver?.disconnect();}};
  menuObserver=new MutationObserver(mount);menuObserver.observe(doc.body,{childList:true,subtree:true});mount();
  const active=config=>config.ready&&chatSettings().enabled!==false;
  function paint(result,list){
    const last=list.findLast(m=>m.role==='assistant'&&!m.is_hidden);if(!last)return;
    const message=doc.querySelector(`#chat .mes[mesid="${last.message_id}"]`);if(!message)return;
    const config=settings(),key=JSON.stringify([last.message_id,result.state,result.errors,config.html]);
    if(view?.isConnected&&renderKey===key)return;
    view?.remove();view=node('section',undefined,message.querySelector('.mes_block')||message);view.className='lorestate-prototype-view';view.style.cssText='margin:12px 0;padding:10px;border-top:1px solid #778063';
    node('small',result.errors.length?`状态有 ${result.errors.length} 轮未应用；保留有效内容。${result.errors.at(-1).message}`:result.state?'LoreState · 当前状态':'LoreState · 等待首次完整状态',view);
    if(result.state){const frame=node('iframe',undefined,view);frame.title='LoreState 当前状态';frame.setAttribute('sandbox','');frame.srcdoc=renderTemplate(config.html,result.state);frame.style.cssText='display:block;width:100%;height:260px;border:0;border-radius:8px;margin-top:8px';}
    if(result.errors.length)button('重新读取状态',view,()=>refresh());renderKey=key;
  }
  async function refresh(){
    const config=settings();if(!active(config)){view?.remove();return;}
    const id=identity(),list=messages(),result=getResult(config,list);
    if(!matches(id))return;
    // Raw messages remain the replay source; this snapshot is a convenient persisted last-good view.
    const record={state:result.state,errors:result.errors,lastFloor:list.at(-1)?.message_id??-1};
    const old=chatSettings();if(JSON.stringify(old.current)!==JSON.stringify(record))updateVariablesWith(v=>({...v,[PROTO_KEY]:{...old,current:record}}),{type:'chat'});
    paint(result,list);
  }
  function schedule(){
    if(pending||closed)return;pending=true;const id=identity();
    queue=queue.then(async()=>{pending=false;if(matches(id))await refresh();}).catch(e=>report(e.message));
  }
  async function beforeGenerate(type,_options,dryRun){
    uninject?.();uninject=null;const config=settings();
    if(dryRun||!active(config)||['quiet','impersonate'].includes(type))return;
    const id=identity();
    try{
      const source=await getWorldbook(config.book);if(!matches(id))return;
      const entry=source.find(e=>e.uid===config.uid);
      if(!entry)throw new Error('世界书关联失效，请在原型设置中重新选择');
      let list=messages();if(['swipe','regenerate'].includes(type)&&list.at(-1)?.role==='assistant')list=list.slice(0,-1);
      const result=getResult(config,list);
      const content=playPrompt(entry.content,config.fields,result);
      uninject=injectPrompts([{id:PROTO_KEY,position:'in_chat',depth:0,role:'system',content,should_scan:false}]).uninject;
    }catch(e){report(`状态提示未注入：${e.message}`);}
  }
  for(const event of ['MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','GENERATION_ENDED','MORE_MESSAGES_LOADED'])if(tavern_events[event])eventOn(tavern_events[event],schedule);
  eventOn(tavern_events.CHAT_CHANGED,()=>{uninject?.();uninject=null;view?.remove();renderKey='';schedule();});
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS,beforeGenerate);
  eventOn(getButtonEvent('LoreState 设置'),open);
  function dispose(){closed=true;menuObserver?.disconnect();menu.remove();panel.remove();view?.remove();uninject?.();}
  window.addEventListener('pagehide',dispose,{once:true});schedule();
}

startPrototype("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><style>\nbody{background:#f4eedf;color:#36372c;font-family:system-ui;padding:18px}\nheader{border-bottom:1px solid #b9ad8b;padding-bottom:8px;margin-bottom:14px}\nsmall{letter-spacing:.14em;color:#72785e}h2{margin:3px 0;font-size:20px}\nmain{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}\nsection{border-left:3px solid #9caa82;padding-left:10px}h3{margin:0;font-size:12px;color:#70765c}p{margin:4px 0}\n</style></head><body><header><small>TRAVEL NOTES</small><h2>旅途手记</h2></header><main>\n<section><h3>当前位置</h3><p data-lore-field=\"地点\"></p></section>\n<section><h3>衣着</h3><p data-lore-field=\"衣着\"></p></section>\n<section><h3>身体状况</h3><p data-lore-field=\"身体状况\"></p></section>\n</main></body></html>\n");
})();
