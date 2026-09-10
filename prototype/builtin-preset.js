// 内置预设头尾：请填写“UTF-8 文本 → 标准 Base64”的结果，默认留空。
// Base64 只是可逆编码，不是保密加密；支持编码文本换行，不支持 Base64URL。
// 仅“内置预设”使用这两个部分；修改后运行 npm run build。
// 固定状态规则与输出格式仍由 core.js / api-profiles.js 发送，不要移到这里。
export const BUILTIN_PRESET_HEAD_BASE64 = ``;

export const BUILTIN_PRESET_TAIL_BASE64 = ``;

export function decodeBuiltinPreset(encoded,label='预设'){
  try{
    const compact=encoded.replace(/\s/g,'');
    if(!compact)return '';
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact))throw new Error();
    const binary=atob(compact);
    if(btoa(binary)!==compact)throw new Error();
    return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,char=>char.charCodeAt(0)));
  }catch{
    throw new Error(`内置预设${label}编码无效，请填写 UTF-8 标准 Base64（保留末尾的 =）`);
  }
}

// 与额外模型调用统一组装：头部 → 固定状态任务 → 本轮剧情 → 尾部。
// 空白头尾不产生空消息；保留非空文本的原始格式。
export function builtinOrderedPrompts(task,headBase64=BUILTIN_PRESET_HEAD_BASE64,tailBase64=BUILTIN_PRESET_TAIL_BASE64){
  const head=decodeBuiltinPreset(headBase64,'头部'),tail=decodeBuiltinPreset(tailBase64,'尾部');
  return [
    ...(head.trim()?[{role:'system',content:head}]:[]),
    {role:'system',content:task},
    'user_input',
    ...(tail.trim()?[{role:'system',content:tail}]:[]),
  ];
}
