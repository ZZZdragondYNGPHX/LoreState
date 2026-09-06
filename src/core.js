// Text state engine. Data is JSON objects with string leaves; never executable code.
export const KEY = 'lorestate_v1';
export const LIMITS = Object.freeze({ text: 6000, operations: 100, patch: 100000, state: 2000000, prompt: 48000, depth: 16, entries: 10000 });
const own = (v, k) => Object.hasOwn(v, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = message => { throw new Error(message); };
const text = (v, max = LIMITS.text) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export const clone = value => structuredClone(value);
export function emptyState() { return { schemaVersion: 1, profile: { id: 'plain', instructions: '记录长期有效的文字事实，使用稳定编号。' }, data: {} }; }
function safeKeys(value, depth = 0) {
  if (depth > 32) fail('对象嵌套过深');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('拒绝危险属性名');
    safeKeys(child, depth + 1);
  }
}
export function validateState(state) {
  safeKeys(state);
  if (state?.schemaVersion !== 1 || !object(state.data) || !object(state.profile) || !text(state.profile.id, 100) || !text(state.profile.instructions, 12000)) fail('状态结构或版本不兼容');
  let count = 0;
  const walk = (value, depth) => {
    if (++count > LIMITS.entries || depth > LIMITS.depth) fail('文字数据条目过多或嵌套过深');
    if (typeof value === 'string') { if (!text(value)) fail('叶子必须是非空文字，最多 6000 字符'); return; }
    if (!object(value)) fail('数据只接受对象和文字；数字、数组、布尔值请用自然语言表述');
    for (const [key, child] of Object.entries(value)) {
      if (!text(key, 100)) fail('字段名无效');
      walk(child, depth + 1);
    }
  };
  walk(state.data, 0);
  if (JSON.stringify(state).length > LIMITS.state) fail('状态超过大小上限，未截断数据');
  return state;
}
// RFC 6901 pointer escaping, with add/replace/remove only. No whole-object overwrite.
function parsePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 2000) fail('路径必须为 JSON Pointer');
  const parts = path.slice(1).split('/').map(p => {
    if (/~(?![01])/.test(p)) fail('路径转义无效');
    const key = p.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!text(key, 100) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('路径字段无效');
    return key;
  });
  if (parts.length > LIMITS.depth) fail('路径过深');
  return parts;
}
export function applyPatch(previous, patch, expectedBase) {
  validateState(previous); safeKeys(patch);
  if (!object(patch) || patch.base !== expectedBase) fail('上一版标识不匹配：历史已变化');
  if (!Array.isArray(patch.ops) || patch.ops.length > LIMITS.operations) fail('ops 必须是最多 100 项的数组');
  const draft = clone(previous);
  for (const op of patch.ops) {
    if (!object(op) || !['add', 'replace', 'remove'].includes(op.op)) fail('只支持 add / replace / remove');
    const parts = parsePath(op.path), key = parts.pop();
    let parent = draft.data;
    for (const part of parts) {
      if (!object(parent) || !own(parent, part)) fail('父路径不存在');
      parent = parent[part];
    }
    if (!object(parent)) fail('父路径必须为对象');
    const exists = own(parent, key);
    if (op.op === 'add' ? exists : !exists) fail('add 要求路径不存在，replace/remove 要求路径已存在');
    if (op.op !== 'add' && typeof parent[key] !== 'string') fail('不可整段覆盖或删除对象，请操作具体文字叶子');
    if (op.op === 'remove') {
      if (!text(op.reason, 500)) fail('删除必须提供 reason');
      delete parent[key];
    } else {
      if (!own(op, 'value')) fail('缺少 value');
      if (op.op === 'replace' && typeof op.value !== 'string') fail('替换值必须为文字');
      parent[key] = clone(op.value);
    }
  }
  return validateState(draft);
}
export function renderBook(state) { return JSON.stringify(state.data, null, 2); }
export function stripProtocol(source) { return source.replace(/<LoreStatePatch>[\s\S]*?<\/LoreStatePatch>/g, '').trim(); }

export async function digest(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
export const GENESIS = 'lorestate-v1-genesis';
export const messageSource = message => JSON.stringify([!!message.is_user, !!message.is_system, message.name ?? '', message.mes ?? '']);
export async function nextBase(base, message) { return digest(base + '\n' + messageSource(message)); }

export function extractPatch(source) {
  const opens = source.match(/<LoreStatePatch\b/g) ?? [];
  const closes = source.match(/<\/LoreStatePatch\s*>/g) ?? [];
  if (opens.length !== 1 || closes.length !== 1) fail('每轮必须有且只有一个完整 LoreStatePatch；缺失或多段更新未执行');
  const match = source.match(/<LoreStatePatch>\s*([\s\S]*?)\s*<\/LoreStatePatch>/);
  if (!match || match[1].length > LIMITS.patch) fail('LoreStatePatch 格式或大小无效');
  let body = match[1].trim();
  if (/^```(?:json)?\s*\n[\s\S]*\n```$/.test(body)) body = body.replace(/^```(?:json)?\s*\n/, '').replace(/\n```$/, '');
  let patch;
  try { patch = JSON.parse(body); } catch { fail('LoreStatePatch 不是有效 JSON；未执行任何更新'); }
  safeKeys(patch);
  return patch;
}

// Replay only the selected swipe. Prefix-bound anchors/skips cannot cross changed history.
export async function replay(chat) {
  let state = emptyState(), base = GENESIS, started = false;
  const records = [];
  const anchorIndex = chat.findLastIndex(m => m.extra?.[KEY]?.anchor);
  for (let index = 0; index < chat.length; index++) {
    const message = chat[index];
    const after = await nextBase(base, message);
    const data = message.extra?.[KEY];
    const anchor = index === anchorIndex ? data?.anchor : null;
    if (anchor) {
      if (anchor.prefix !== after) return { state, base, started, records, error: { index, message: '迁移/启用基线之前的历史已改变。请从备份重新预览迁移，不能套用原基线。' } };
      try { state = clone(validateState(anchor.state)); }
      catch (e) { return { state, base, started, records, error: { index, message: e.message } }; }
      started = true;
    } else if (started && !message.is_user && !message.is_system) {
      try {
        if (data?.skip?.prefix !== after) state = applyPatch(state, extractPatch(message.mes ?? ''), base);
        const receipt = { index, prefix: after, skipped: data?.skip?.prefix === after };
        if (records.length % 10 === 0) receipt.snapshot = clone(state);
        records.push(receipt);
      } catch (e) {
        return { state, base, started, records, error: { index, message: e.message } };
      }
    }
    base = after;
  }
  return { state, base, started, records, error: null };
}
