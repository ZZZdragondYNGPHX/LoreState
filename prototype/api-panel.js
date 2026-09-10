import { boundApiProfile, saveApiProfile, deleteApiProfile, normalizeApiAddress, normalizeUpdateSettings } from './api-profiles.js';

export function createApiPanel({doc,read,write,binding,setBinding,run,cancel,undo,onError,listRequestPresets=()=>[],fetchModels}){
  const make=(tag,text,parent)=>{const el=doc.createElement(tag);if(text)el.textContent=text;parent?.append(el);return el;};
  const panel=make('section');
  make('h3','API 预设与状态更新',panel);
  make('p','API 预设可供不同角色使用。密钥保存在当前酒馆用户的本地设置中，不写入角色卡或聊天记录；完整设置备份仍包含密钥。',panel);
  const status=make('p','',panel);status.className='ls-health';status.setAttribute('role','status');
  const group=(title,open=false)=>{const section=make('details',null,panel);section.open=open;make('summary',title,section);return section;};
  const field=(title,type='text',parent=panel)=>{const label=make('label',title,parent),input=make(type==='select'?'select':'input',null,label);input.setAttribute('aria-label',title);if(type!=='select')input.type=type;return input;};
  const action=(title,fn,parent=panel)=>{const button=make('button',title,parent);button.type='button';button.onclick=async()=>{button.disabled=true;try{await fn();}catch(e){status.textContent=e.message;onError(e);}finally{button.disabled=false;}};return button;};
  const choices=(select,items)=>{select.replaceChildren();for(const [value,title] of items)make('option',title,select).value=value;};
  const requestGroup=group('请求内容',true);
  const mode=field('状态更新方式','select',requestGroup);choices(mode,[['inline','随正文更新'],['extra','额外模型更新']]);
  const presetMode=field('请求预设','select',requestGroup);choices(presetMode,[['builtin','内置预设'],['current','当前酒馆预设'],['named','指定酒馆预设']]);
  const presetName=field('目标酒馆预设','select',requestGroup);
  make('p','状态规则与输出格式固定发送，不受预设选择影响。预设用于补充语气、文风等要求；内置预设的补充内容默认留空。酒馆预设只用于本次请求，不切换正文预设；指定预设时，其采样参数按酒馆助手规则优先生效。',requestGroup);
  const strategyGroup=group('请求策略',true);
  const auto=field('自动更新','checkbox',strategyGroup),stream=field('兼容流式响应','checkbox',strategyGroup),attempts=field('请求总次数','number',strategyGroup),timeout=field('总超时（秒）','number',strategyGroup);
  attempts.min='1';attempts.max='5';attempts.step='1';timeout.min='15';timeout.max='600';timeout.step='1';
  make('p','依次请求，失败后重试；次数包含首次请求。总超时覆盖全部尝试，取消或聊天变化不会重试。流式只用于接收响应，完整校验前不写入状态。',strategyGroup);
  const sourceGroup=group('模型来源',true);
  const source=field('状态模型来源','select',sourceGroup);choices(source,[['custom','绑定 API 预设'],['current','跟随酒馆当前连接']]);
  const bound=field('状态更新 API 预设','select',sourceGroup);
  const profileGroup=group('管理 API 预设',true);
  const select=field('编辑 API 预设','select',profileGroup),name=field('API 预设名称','text',profileGroup),url=field('API 地址','text',profileGroup),key=field('API 密钥','password',profileGroup),model=field('API 模型名称','text',profileGroup),models=field('可用模型','select',profileGroup);
  url.placeholder='https://example.com/v1';key.autocomplete='off';name.maxLength=40;model.maxLength=200;
  let editedId='',modelEpoch=0;
  const resetModels=()=>{modelEpoch++;choices(models,[['','手动填写模型，或获取列表']]);};
  models.onchange=()=>{if(models.value)model.value=models.value;};
  url.oninput=key.oninput=resetModels;
  action('获取模型列表',async()=>{
    if(!fetchModels)throw new Error('当前酒馆助手不支持获取模型列表');
    const address=normalizeApiAddress(url.value),secret=key.value,epoch=++modelEpoch;let timer;
    status.textContent='正在获取模型列表…';
    try{
      const result=await Promise.race([fetchModels({apiurl:address,key:secret}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('模型列表请求超时')),30000);})]);
      if(epoch!==modelEpoch)return;
      const names=[...new Set((Array.isArray(result)?result:[]).filter(v=>typeof v==='string'&&v.length&&v.length<=200))].sort();
      choices(models,[['','请选择模型'],...names.map(v=>[v,v])]);status.textContent=names.length?`获取到 ${names.length} 个模型，选择后请保存 API 预设。`:'服务未返回模型列表，请检查连接或手动填写模型名称。';
    }catch{if(epoch===modelEpoch)throw new Error('获取模型列表失败，请检查地址、密钥和网络，或手动填写模型名称');}
    finally{clearTimeout(timer);}
  },profileGroup);
  const advanced=make('details',null,profileGroup);make('summary','高级采样参数',advanced);
  make('p','留空表示不发送该采样参数，使用服务默认值。最大回复长度为 0 时不发送；Top K 为 0 时不发送。不同服务支持的参数不同。',advanced);
  const maxTokens=field('最大回复 tokens','number',advanced),temperature=field('更新温度','number',advanced),topP=field('Top P','number',advanced),topK=field('Top K','number',advanced),frequency=field('频率惩罚','number',advanced),presence=field('存在惩罚','number',advanced);
  for(const [el,min,max,step] of [[maxTokens,0,65536,1],[temperature,0,2,0.1],[topP,0,1,0.05],[topK,0,1000,1],[frequency,-2,2,0.1],[presence,-2,2,0.1]]){el.min=min;el.max=max;el.step=step;}
  function load(){
    resetModels();const p=(read().profiles??[]).find(p=>p.id===select.value);editedId=p?.id??'';
    for(const [el,value] of [[name,p?.name??''],[url,p?.url??''],[key,p?.key??''],[model,p?.model??''],[maxTokens,p?.maxTokens??4096],[temperature,p?.temperature??0.2],[topP,p?.topP??''],[topK,p?.topK??''],[frequency,p?.frequencyPenalty??''],[presence,p?.presencePenalty??'']])el.value=value==='unset'?'':value;
  }
  function visibility(){presetName.parentElement.hidden=presetMode.value!=='named';bound.parentElement.hidden=source.value!=='custom';}
  presetMode.onchange=source.onchange=visibility;
  function sync(preferred=editedId){
    const profiles=read().profiles??[];choices(select,[['','新建预设'],...profiles.map(p=>[p.id,p.name])]);choices(bound,[['','未绑定'],...profiles.map(p=>[p.id,p.name])]);
    select.value=preferred;const config=normalizeUpdateSettings(binding());bound.value=config.profileId;mode.value=config.mode;source.value=config.source;presetMode.value=config.presetMode;
    choices(presetName,[['','请选择预设'],...listRequestPresets().map(name=>[name,name])]);presetName.value=config.presetName;
    auto.checked=config.auto;stream.checked=config.stream;attempts.value=config.attempts;timeout.value=config.timeoutSeconds;
    const current=profiles.find(p=>p.id===config.profileId);
    status.textContent=`当前模式：${config.mode==='extra'?'额外模型':'随正文更新'}；状态模型：${config.source==='current'?'酒馆当前连接':current?.name??(config.profileId?'预设已删除，请重新绑定':'未绑定')}。`;
    load();visibility();
  }
  select.onchange=load;
  const values=()=>({id:editedId||crypto.randomUUID(),name:name.value,url:url.value,key:key.value,model:model.value,maxTokens:maxTokens.value,temperature:temperature.value,topP:topP.value,topK:topK.value,frequencyPenalty:frequency.value,presencePenalty:presence.value});
  action('保存 API 预设',()=>{const p=values();write(saveApiProfile(read(),p));sync(p.id);status.textContent+=' API 预设已保存。';},profileGroup);
  action('另存为新 API 预设',()=>{const p={...values(),id:crypto.randomUUID()};write(saveApiProfile(read(),p));sync(p.id);},profileGroup);
  action('删除 API 预设',()=>{if(!editedId)throw new Error('请选择要删除的预设');write(deleteApiProfile(read(),editedId));sync('');},profileGroup);
  action('保存状态更新绑定',()=>{
    const config=normalizeUpdateSettings({...binding(),mode:mode.value,profileId:bound.value,source:source.value,presetMode:presetMode.value,presetName:presetName.value,auto:auto.checked,stream:stream.checked,attempts:attempts.value,timeoutSeconds:timeout.value});
    if(config.mode==='extra'&&config.source==='custom')boundApiProfile(read(),config.profileId);
    if(config.presetMode==='named'&&!listRequestPresets().includes(config.presetName))throw new Error('所选酒馆预设已失效');
    setBinding(config);sync();
  });
  make('p','以上请求设置和绑定需保存后生效。关闭自动更新后，可手动整理最新回复。重试与撤销保留剧情正文。',panel);
  action('重新更新最新回复状态',run);action('取消状态更新',cancel);action('撤销最近一次状态更新',undo);
  return {panel,sync,report:text=>{status.textContent=text;},clear:()=>{modelEpoch++;key.value='';}};
}
