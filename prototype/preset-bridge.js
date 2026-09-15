// Source contract: Helper 4.9.5 af21bee, responseGenerator.ts emits SETTINGS_READY
// after applying custom model overrides, and fetch receives its AbortSignal.
// Abort that specific Helper request before sending the assembled text ourselves.
export async function collectPresetMessages(request,{generate,on,off,event,stop,signal}){
  if(!event||typeof generate!=='function'||typeof on!=='function'||typeof off!=='function'||typeof stop!=='function')throw new Error('当前宿主缺少酒馆预设组装桥接能力');
  const marker='lorestate-prompt-'+request.generation_id;
  let captured=null,captureError=null,aborted=false;
  const listener=data=>{
    if(data?.model!==marker)return;
    // Stop first: validation or cloning must never permit the staging request.
    aborted=stop(request.generation_id)===true;
    if(!aborted){captureError=new Error('宿主未确认中止预设组装请求');return;}
    if(signal?.aborted)return;
    try{
      if(!Array.isArray(data.messages)||!data.messages.length)throw new Error();
      captured=data.messages.map(message=>{
        if(!['system','developer','user','assistant'].includes(message.role))throw new Error();
        let content=message.content;
        if(Array.isArray(content)){
          if(content.some(part=>!['text','input_text','output_text'].includes(part.type)||typeof part.text!=='string'))throw new Error();
          content=content.map(part=>part.text).join('\n');
        }
        if(typeof content!=='string')throw new Error();
        return {role:message.role,content};
      });
      if(!captured.some(m=>m.role==='user')||captured.reduce((n,m)=>n+m.content.length,0)>400000)throw new Error();
    }catch{captured=null;captureError=new Error('酒馆预设组装结果为空、过长或含不支持的非文字消息');}
  };
  let rejectCancel;
  const cancelled=new Promise((_,reject)=>{rejectCancel=reject;});
  const cancel=()=>{stop(request.generation_id);rejectCancel(new Error('酒馆预设组装已取消'));};
  on(event,listener);signal?.addEventListener('abort',cancel,{once:true});
  try{
    if(signal?.aborted)throw new Error('酒馆预设组装已取消');
    try{
      // Reserved .invalid endpoint and no credentials provide a non-provider
      // fallback if an incompatible host fails to emit the documented event.
      await Promise.race([cancelled,generate({...request,should_stream:false,should_silence:true,custom_api:{apiurl:'https://lorestate-prompt.invalid/v1',key:'',model:marker,source:'openai'}})]);
    }catch{/* A rejected aborted fetch is the expected end of prompt collection. */}
    if(signal?.aborted)throw new Error('酒馆预设组装已取消');
    if(captureError)throw captureError;
    if(!captured||!aborted)throw new Error('未取得酒馆预设提示词，请检查助手版本及预设配置');
    return {...request,assembled_messages:captured};
  }finally{off(event,listener);signal?.removeEventListener('abort',cancel);}
}
