import { TAG_PATTERN, applyState } from './core.js';

const retryHints=new Map();
function retryToken(content){
  const matches=[...String(content??'').matchAll(/\bread="([^"]+)"/g)];
  return matches.at(-1)?.[1]??'';
}
function rememberRetryHint(receipt,error){
  const token=receipt?.token;if(!token)return;
  const reason=String(error?.message??error).replace(/\s+/g,' ').trim().slice(0,300)||'输出未通过本地校验';
  retryHints.set(token,reason);
  while(retryHints.size>20)retryHints.delete(retryHints.keys().next().value);
}
export function extraUpdateRetryHint(content){
  const token=retryToken(content),reason=token&&retryHints.get(token);if(!reason)return '';
  return `【纠错重试】\n上一次状态输出未通过本地校验：${reason}\n请从头重新生成。本次只能返回一个完整 LoreState 更新块；不要解释、不要代码围栏、不要重复旧块；严格使用本次要求的 version、mode、read 凭据与栏目。`;
}
export function normalizeExtraUpdateOutput(output){
  if(typeof output!=='string')throw new Error('状态模型未返回文字更新块');
  return output.trim().replace(/^```(?:xml)?\s*\n([\s\S]*?)\n```$/,'$1').trim();
}
export function variableStory(source){
  const blocks=[...source.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.some(block=>(block[0].match(/<\/?LoreState\b/gi)??[]).length!==2))throw new Error('原消息状态标签存在嵌套，无法确定正文边界，请先手动修复');
  const story=source.replace(new RegExp(TAG_PATTERN,'g'),'');
  if(/<\/?LoreState\b/i.test(story))throw new Error('原消息存在未闭合的状态标签，请先手动修复标签边界后重试');
  return story;
}
export function validateExtraUpdate(output,original,previous,schema,floor,receipt){
  // Only protocol-bearing output can provide useful correction feedback.
  retryHints.delete(receipt?.token);
  let hasUpdateBlock=false;
  try{
    const text=normalizeExtraUpdateOutput(output);
    const blocks=[...text.matchAll(new RegExp(TAG_PATTERN,'g'))];
    hasUpdateBlock=blocks.length>0;
    if(blocks.length!==1||blocks[0][0]!==text)throw new Error('状态模型必须只返回一个完整 LoreState 更新块');
    if(!text.startsWith(`<LoreState version="3" mode="${previous?'delta':'full'}" read="${receipt.token}">`))throw new Error('状态模型返回的 mode 或读取凭据不匹配，请重试');
    // This is the same parser and cold-record permission check used for replay.
    applyState(previous,text,schema,floor,receipt);
    variableStory(original); // Validate boundaries before replacing anything.
    let replaced=false;
    const updated=original.replace(new RegExp(TAG_PATTERN,'g'),()=>{if(replaced)return '';replaced=true;return text;});
    retryHints.delete(receipt.token);
    return replaced?updated:original+'\n\n'+text;
  }catch(error){
    if(hasUpdateBlock)rememberRetryHint(receipt,error);
    throw error;
  }
}

// Only an append to the exact saved branch can be folded into one state update.
export function settleContinuedMessage(original,current,mode,previous,schema,floor,receipt){
  if(!current.startsWith(original))throw new Error('续写改动了原回复，无法自动合并，请核对正文和状态');
  if(current===original)return current;
  const suffix=current.slice(original.length);
  const narrative=variableStory(original)+suffix;
  if(mode==='extra')return variableStory(narrative);
  const blocks=[...suffix.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.length!==1) return narrative.replace(new RegExp(TAG_PATTERN,'g'),''); // Keep partial tags for diagnostics, retire complete untrusted blocks.
  try{return validateExtraUpdate(blocks[0][0],narrative,previous,schema,floor,receipt);}
  catch{return narrative.replace(new RegExp(TAG_PATTERN,'g'),'');}
}
