// Presets contain presentation only; rules and chat state are never copied here.
export function listPresets(config) {
  if(Array.isArray(config.presets)&&config.presets.length)return config.presets.map(p=>({...p}));
  return [];
}
function sameFields(a,b){return a.length===b.length&&a.every(f=>b.includes(f));}
export function savePreset(config,name,html,id){
  name=name.trim();if(!name||name.length>40)throw new Error('预设名称需为 1～40 个字符');
  const presets=listPresets(config);
  if(presets.some(p=>p.name===name&&p.id!==id))throw new Error('已有同名预设，请换个名称或选择覆盖');
  const index=presets.findIndex(p=>p.id===id);
  if(index<0&&presets.length>=20)throw new Error('最多保存 20 份预设');
  const preset={id,name,html};if(index<0)presets.push(preset);else presets[index]=preset;
  return {...config,presets};
}
export function deletePreset(config,id){
  if(id===(config.activePresetId))throw new Error('请先切换到其他预设，再删除当前样式');
  return {...config,presets:listPresets(config).filter(p=>p.id!==id)};
}

export function sameSchema(a,b){return !!a&&!!b&&sameFields(a.shared,b.shared)&&sameFields(a.entity,b.entity);}
