import { TAG_PATTERN, applyState } from './core.js';

export function variableStory(source){
  const story=source.replace(new RegExp(TAG_PATTERN,'g'),'');
  if(/<\/?LoreState\b/i.test(story))throw new Error('原消息存在未闭合的状态标签，请先手动修复标签边界后重试');
  return story;
}
export function validateExtraUpdate(output,original,previous,schema,floor,receipt){
  if(typeof output!=='string')throw new Error('状态模型未返回文字更新块');
  const text=output.trim().replace(/^```(?:xml)?\s*\n([\s\S]*?)\n```$/,'$1').trim();
  const blocks=[...text.matchAll(new RegExp(TAG_PATTERN,'g'))];
  if(blocks.length!==1||blocks[0][0]!==text)throw new Error('状态模型必须只返回一个完整 LoreState 更新块');
  if(!text.startsWith(`<LoreState version="3" mode="${previous?'delta':'full'}" read="${receipt.token}">`))throw new Error('状态模型返回的 mode 或读取凭据不匹配，请重试');
  // This is the same parser and cold-record permission check used for replay.
  applyState(previous,text,schema,floor,receipt);
  variableStory(original); // Validate boundaries before replacing anything.
  let replaced=false;
  const updated=original.replace(new RegExp(TAG_PATTERN,'g'),()=>{if(replaced)return '';replaced=true;return text;});
  return replaced?updated:original+'\n\n'+text;
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
