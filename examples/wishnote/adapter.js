import { validateState, digest, clone } from '../../src/core.js';
import { validateState as validateLegacy } from './legacy/core.js';
import { migrateLegacy } from './legacy/migration.js';
export const profile = {
  id: 'wishnote',
  instructions: '缄愿笔记：people 使用稳定 P 编号，人物包含 id、name、mode（hot/cold）、reality、wishes、ties。reality 的 F 编号保存已经成立的持久愿效；wishes 的 W 编号保存 kind（恒/程）与 text；ties 的 T 编号保存 target 人物编号与 text。目标人物应先建立。人格愿成立即自然接受，不把适配写成未生效。冷热只是文字标记，完整数据都会带入。修改已有愿望或关系时操作 kind/text/target 文字叶子。只新增或更新实际变化的条目，不清空旧事实。愿望叙事规则由配套世界书定义。'
};
export function convertState(legacy) {
  validateLegacy(legacy);
  const data=clone(legacy.stat_data.wishnote), provenance=clone(legacy);
  for(const person of Object.values(data.people))delete person._legacy;
  delete data._legacy;
  // The original state stays intact outside model-editable data for lossless recovery.
  return validateState({schemaVersion:1,profile:clone(profile),data,provenance:{format:'wishnote-v1',original:provenance}});
}
export function convertXml(xml,worldbook){const result=migrateLegacy(xml,worldbook);return {state:convertState(result.state),warnings:result.warnings};}
export async function convertBackup(value){
  if(value?.format!=='wishnote-backup'||value.version!==1||await digest(value.state)!==value.checksum)throw new Error('旧愿档备份校验失败');
  return convertState(value.state);
}
