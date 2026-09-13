// Optional, read-only Prompt Template integration; no EJS engine or state persistence.
// Upstream contract and pinned revisions: docs/EJS动态世界书.md
export const EJS_PREPARE_EVENT = 'prompt_template_prepare';

const EJS_BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function ejsPathParts(path) {
  const parts = Array.isArray(path) ? path : typeof path === 'string' ? path.split('.') : [];
  if (!parts.length) return null;
  const keys = [];
  for (const part of parts) {
    if (typeof part !== 'string' && !(Number.isSafeInteger(part) && part >= 0)) return null;
    const key = String(part);
    if (!key || EJS_BLOCKED_KEYS.has(key)) return null;
    keys.push(key);
  }
  return keys;
}

function ejsLookup(state, path) {
  const keys = ejsPathParts(path);
  if (!keys) return { found: false };
  let value = state;
  for (const key of keys) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return { found: false };
    value = value[key];
  }
  return { found: true, value };
}

function ejsFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) ejsFreeze(child, seen);
  return Object.freeze(value);
}

function ejsNumber(value) {
  // LoreState fields are text. Accept finite decimal text, not JS coercion of null/bools/hex.
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return NaN;
    value = Number(text);
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

function ejsInRange(value, min, max, options) {
  return Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max) && min <= max
    && value >= min && (options?.includeMax === true ? value <= max : value < max);
}

export function createEjsApi(reading = {}) {
  const reason = reading.reason ?? (reading.tainted || reading.errors?.length ? 'history-gap'
    : reading.state ? 'ready' : 'uninitialized');
  const state = ejsFreeze(reason === 'ready' ? structuredClone(reading.state) : {});
  const get = (path, fallback) => {
    const result = ejsLookup(state, path);
    return result.found && result.value !== undefined ? result.value : fallback;
  };
  const has = path => ejsLookup(state, path).found;
  const range = (path, min, max, options) => ejsInRange(ejsNumber(get(path)), min, max, options);
  const stage = (path, stages, fallback) => {
    const value = ejsNumber(get(path));
    if (!Number.isFinite(value) || !Array.isArray(stages)) return fallback;
    for (const item of stages) {
      if (item && typeof item.name === 'string' && ejsInRange(value, item.min, item.max, item)) return item.name;
    }
    return fallback;
  };
  return Object.freeze({ state, ready: reason === 'ready', reason, get, has, range, stage });
}

// Each prepare gets one detached snapshot. Helpers never re-read chat variables or replay history.
export function installEjsBridge({ eventOn, eventRemoveListener, read, warn = message => console.warn(message) }) {
  const warned = new Set(), owned = new WeakMap();
  const warnOnce = (key, message) => {
    if (warned.has(key)) return;
    warned.add(key);
    warn('[LoreState/EJS] ' + message);
  };
  if (typeof eventOn !== 'function' || typeof eventRemoveListener !== 'function') {
    warnOnce('capability', '缺少可清理的事件接口；只读桥接未启用，其他 LoreState 功能不变。');
    return () => {};
  }
  let active = true, reading = false;

  function prepare(context) {
    if (!active || !context || typeof context !== 'object' || Array.isArray(context)) return;
    if (!Object.isExtensible(context)) {
      warnOnce('context', 'EJS context 不可扩展；未改写已有内容。');
      return;
    }
    let api;
    if (reading) {
      api = createEjsApi({ reason: 'busy' });
    } else {
      reading = true;
      try {
        api = createEjsApi(read(context));
      } catch {
        // Never log a thrown parser error: it can contain private message/field text.
        api = createEjsApi({ reason: 'read-error' });
        warnOnce('read-error', '无法读取可靠状态；本次 EJS 使用空快照，不回退到旧聊天缓存。');
      } finally {
        reading = false;
      }
    }
    const values = {
      LoreState: api,
      lorestate: api.state,
      ls: api.get,
      lsHas: api.has,
      lsRange: api.range,
      lsStage: api.stage,
    };
    const previous = owned.get(context), installed = {};
    for (const [key, value] of Object.entries(values)) {
      const descriptor = Object.getOwnPropertyDescriptor(context, key);
      const ours = previous && Object.hasOwn(previous, key) && descriptor
        && Object.hasOwn(descriptor, 'value') && descriptor.value === previous[key];
      if (key in context && !ours) {
        warnOnce('conflict:' + key, 'EJS 名称冲突：' + key + '；保留原值，请使用未冲突的 LoreState 命名空间/别名。');
        continue;
      }
      try {
        Object.defineProperty(context, key, { value, enumerable: true, configurable: true, writable: true });
        installed[key] = value;
      } catch {
        warnOnce('property:' + key, 'EJS 属性不可写：' + key + '；保留原值。');
      }
    }
    // Only our own, still-unmodified bindings may be refreshed if a caller reuses a context.
    // Weak ownership avoids retaining completed templates or their chat snapshots.
    owned.set(context, installed);
  }

  function dispose() {
    if (!active) return;
    active = false;
    try {
      // Use the original callback, not EventOnReturn.stop(): 4.9.5 returns a wrapped callback.
      eventRemoveListener(EJS_PREPARE_EVENT, prepare);
    } catch {
      warnOnce('dispose', '桥接监听清理失败；旧回调已停用，脚本关闭后由酒馆助手回收。');
    }
  }
  try {
    eventOn(EJS_PREPARE_EVENT, prepare);
  } catch {
    dispose();
    warnOnce('subscribe', '桥接事件注册失败；其他 LoreState 功能不变。');
  }
  return dispose;
}
