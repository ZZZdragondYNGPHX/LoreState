import { uiNode, uiCard, uiActions, uiNote } from './ui-kit.js';

// Presentation and ephemeral draft state only; all host operations are injected.
export function createAppearancePanel({doc,manager,htmlLabel,html,preview,presetLabel,nameLabel,presetSourceDisclosure,makerDisclosure,actions,readSummary,run,cancel,goApi,applyDraft,readPreset,prompt}){
  const panel=uiNode(doc,'section',null,null,'ls-appearance');
  uiNode(doc,'h3','外观制作台',panel);
  uiNote(doc,panel,'描述风格 → 生成草稿 → 校验预览 → 确认应用。换肤不修改状态栏目或聊天存档。');
  const summary=uiNode(doc,'p','',panel,'ls-health');summary.setAttribute('aria-label','外观草稿状态');
  const connection=uiNode(doc,'p','',panel,'ls-note');connection.setAttribute('aria-label','外观生成 API');
  const status=uiNode(doc,'p','',panel,'ls-health');status.setAttribute('role','status');
  const report=text=>{status.textContent=text;};
  const action=(text,fn,parent=panel)=>{
    const button=uiNode(doc,'button',text,parent);button.type='button';
    button.onclick=async()=>{button.disabled=true;try{await fn();}catch(error){report(error.message);}finally{button.disabled=false;sync();}};
    return button;
  };
  const tools=uiActions(doc,panel);
  const opener=action('描述风格 / AI 改稿',()=>openDialog(),tools);opener.className='ls-primary';
  action('设置生成 API',goApi,tools);
  let previousDraft=null,replacement=null,busy=false;
  const undo=action('撤回最近草稿替换',()=>{
    if(previousDraft===null||html.value!==replacement)throw new Error('草稿已继续编辑，无法撤回；请手动保留需要的内容');
    html.value=previousDraft;previousDraft=null;replacement=null;draftChanged();report('已撤回草稿替换；当前生效外观未改变。');
  },tools);
  const work=uiNode(doc,'div',null,panel,'ls-appearance-work');
  const canvas=uiNode(doc,'section',null,work,'ls-appearance-preview');
  uiNode(doc,'h4','预览',canvas);
  const empty=uiNote(doc,canvas,'生成或手工编辑后，点击“预览 HTML”。预览不会保存或调用模型。');
  const previewTools=uiActions(doc,canvas,[actions.get('预览 HTML（不保存）')]);
  const apply=action('应用 HTML 草稿',async()=>{await applyDraft();report('HTML 草稿已应用到随卡外观；聊天状态保留，命名预设未被覆盖。');},previewTools);apply.className='ls-primary';
  const frameSlot=uiNode(doc,'div',null,canvas,'ls-appearance-frame');frameSlot.append(preview);
  uiNote(doc,canvas,'外观仍随卡保存，同卡各聊天共用。第一次使用请到“设置”完成栏目绑定与启用。');
  const code=uiNode(doc,'details',null,work,'ls-card ls-appearance-code');
  uiNode(doc,'summary','HTML 源码 · 手工编辑 / 粘贴',code);code.open=doc.defaultView.innerWidth>=760;
  const codeBody=uiNode(doc,'div',null,code,'ls-card-body');codeBody.append(htmlLabel);htmlLabel.firstChild.textContent='HTML 源码（可编辑 / 粘贴）';html.rows=18;
  const preset=uiCard(doc,panel,{title:'外观预设',hint:'命名保存与应用分开；载入草稿不改变当前外观。',open:false});
  preset.append(presetLabel,nameLabel);
  const presetTools=uiActions(doc,preset);
  action('载入所选预设到草稿',()=>{const value=readPreset();replaceDraft(value);report('已载入所选预设到草稿，尚未应用。');},presetTools);
  for(const title of ['应用所选预设','另存为新预设','覆盖所选预设','删除所选预设'])presetTools.append(actions.get(title));
  preset.append(presetSourceDisclosure);
  const advanced=uiCard(doc,panel,{title:'手工制作与提示词',hint:'保留复制提示词给外部网页 AI 的工作方式。'});advanced.append(makerDisclosure);
  function sync(){
    const value=readSummary();summary.textContent=value.active+' · '+(html.value===value.html?'草稿与当前外观一致':'草稿有未应用修改');connection.textContent=value.api;
    undo.disabled=busy||previousDraft===null||html.value!==replacement;
    frameSlot.hidden=!preview.hasAttribute('srcdoc');empty.hidden=!frameSlot.hidden;
  }
  function draftChanged(){preview.removeAttribute('srcdoc');sync();}
  function replaceDraft(value){previousDraft=html.value;html.value=value;replacement=value;draftChanged();}
  html.addEventListener('input',draftChanged);
  const dialog=uiNode(doc,'dialog',null,manager,'ls-style-dialog');dialog.setAttribute('aria-labelledby','ls-style-title');
  const head=uiNode(doc,'header',null,dialog,'ls-style-head');uiNode(doc,'h3','描述你想要的外观',head).id='ls-style-title';
  action('返回外观制作台',()=>dialog.close(),head);
  const body=uiNode(doc,'div',null,dialog,'ls-style-body');
  const api=uiNote(doc,body,'');
  const modeLabel=uiNode(doc,'label','生成方式',body),mode=uiNode(doc,'select',null,modeLabel);mode.setAttribute('aria-label','外观生成方式');
  for(const [value,text] of [['revise','修改当前 HTML 草稿'],['new','从零生成新外观']])uiNode(doc,'option',text,mode).value=value;
  const styleLabel=uiNode(doc,'label','想要的风格与修改要求',body),style=uiNode(doc,'textarea',null,styleLabel);
  style.setAttribute('aria-label','想要的外观风格');style.rows=6;style.maxLength=4000;
  style.placeholder='例如：深色纸张风格，顶部显示世界信息，人物用紧凑卡片；危险状态用暖色强调，冷档默认折叠，手机单列。';
  uiNote(doc,body,'只发送栏目结构、风格要求，以及改稿时的 HTML。不会附带聊天正文、真实状态值或世界书原文。请勿在风格/HTML 中粘贴密钥或私人资料。');
  uiNote(doc,body,'复用 API 页已保存的模型来源、采样和请求策略；HTML 使用独立制作提示词，不使用状态更新或酒馆请求预设。');
  const requestDetails=uiNode(doc,'details',null,body);uiNode(doc,'summary','查看将发送的制作提示词（不含连接密钥）',requestDetails);
  const requestText=uiNode(doc,'textarea',null,requestDetails);requestText.readOnly=true;requestText.rows=8;requestText.setAttribute('aria-label','外观制作请求预览');
  const progress=uiNode(doc,'p','生成结果只进入草稿，确认应用前不改变当前外观。',body,'ls-health');progress.setAttribute('role','status');
  const footer=uiActions(doc,dialog);footer.classList.add('ls-style-footer');
  const generateButton=action('生成 HTML 草稿',async()=>{
    if(busy)return;
    busy=true;setBusy();progress.textContent='正在准备请求…';
    try{
      const source=await run({style:style.value,mode:mode.value},text=>{progress.textContent=text;});
      replaceDraft(source);dialog.close();
      await actions.get('预览 HTML（不保存）').onclick();sync();
      report(preview.hasAttribute('srcdoc')?'已生成并校验 HTML 草稿。请检查预览，再应用或另存为预设；当前外观尚未改变。':'HTML 草稿通过合成数据校验，但当前数据预览失败；尚未应用。'+status.textContent);
    }catch(error){progress.textContent=error.message;report(error.message);}
    finally{busy=false;setBusy();}
  },footer);generateButton.className='ls-primary';
  const cancelButton=action('取消外观生成',()=>cancel(),footer);
  function setBusy(){
    dialog.setAttribute('aria-busy',String(busy));style.disabled=mode.disabled=generateButton.disabled=opener.disabled=busy;cancelButton.disabled=!busy;sync();
  }
  function requestPreview(){try{requestText.value=prompt({style:style.value,mode:mode.value});}catch(error){requestText.value=error.message;}}
  requestDetails.addEventListener('toggle',()=>{if(requestDetails.open)requestPreview();});
  style.addEventListener('input',()=>{if(requestDetails.open)requestPreview();});mode.addEventListener('change',requestPreview);
  function openDialog(){
    if(!dialog.isConnected)manager.append(dialog);
    api.textContent=readSummary().api;if(!html.value.trim())mode.value='new';
    setBusy();requestPreview();if(!dialog.open)dialog.showModal();style.focus();
  }
  dialog.addEventListener('close',()=>{cancel();if(opener.isConnected&&manager.open)opener.focus();});
  const onManagerClose=()=>{cancel();dialog.close();};manager.addEventListener('close',onManagerClose);
  sync();setBusy();
  return {panel,report,sync,draftChanged,close:onManagerClose,dispose(){cancel();manager.removeEventListener('close',onManagerClose);dialog.remove();}};
}
