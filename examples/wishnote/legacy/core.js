// Original WishNote implementation; MVU is a design reference, not a runtime dependency.
export const KEY = 'wishnote_v1';
export const LIMITS = Object.freeze({ people: 250, text: 6000, operations: 100, patch: 100000, state: 2000000, prompt: 48000 });
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const pid = value => typeof value === 'string' && /^P\d{2,8}$/.test(value);
const text = (value, max = LIMITS.text) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export const clone = value => structuredClone(value);
export function emptyState() { return { schemaVersion: 1, stat_data: { wishnote: { people: {} } } }; }
export function peopleOf(state) { return state.stat_data.wishnote.people; }
function safeKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('拒绝危险属性名');
    safeKeys(child);
  }
}
export function validateState(state) {
  safeKeys(state);
  if (state?.schemaVersion !== 1 || !object(state?.stat_data?.wishnote?.people)) fail('愿档结构或版本不兼容');
  const people = peopleOf(state);
  if (Object.keys(people).length > LIMITS.people) fail('人物数量超过第一版上限 250');
  for (const [id, p] of Object.entries(people)) {
    if (!pid(id) || !object(p) || p.id !== id || !text(p.name, 100) || !['hot', 'cold'].includes(p.mode)) fail(`人物 ${id} 的编号、姓名或冷热状态无效`);
    for (const field of ['reality', 'wishes', 'ties']) {
      if (!object(p[field]) || Object.keys(p[field]).length > 100) fail(`${id}.${field} 必须是最多 100 项的记录`);
      for (const [key, value] of Object.entries(p[field])) {
        const prefix = { reality: 'F', wishes: 'W', ties: 'T' }[field];
        if (!new RegExp(`^${prefix}\\d{2,8}$`).test(key)) fail(`${id}.${field} 条目编号无效`);
        if (field === 'reality' && !text(value)) fail(`${id}.${key} 事实须为非空文字`);
        if (field === 'wishes' && (!object(value) || !['恒', '程'].includes(value.kind) || !text(value.text))) fail(`${id}.${key} 只接受恒/程愿及文字`);
        if (field === 'ties' && (!object(value) || !pid(value.target) || !own(people, value.target) || !text(value.text))) fail(`${id}.${key} 关系目标不存在或文字为空`);
      }
    }
  }
  if (JSON.stringify(state).length > LIMITS.state) fail('愿档超过第一版大小上限，未截断数据');
  return state;
}
