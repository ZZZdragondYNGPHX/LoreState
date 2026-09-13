import test from 'node:test';
import assert from 'node:assert/strict';
import { createEjsApi, installEjsBridge, EJS_PREPARE_EVENT } from '../prototype/ejs-bridge.js';

const sample = () => ({
  shared: { 地点: '白帆港', zero: 0, flag: false, empty: '', nil: null },
  entities: { P1: { id: 'P1', type: '角色', name: '爱丽丝', presence: 'cold',
    fields: { 好感度: '-63', '有.点': 'literal', 说明: 'plain text' }, links: ['G1'] } },
});
const favorPath = 'entities.P1.fields.好感度';
const apiFor = value => { const state = sample(); state.entities.P1.fields.好感度 = value; return createEjsApi({ state }); };
const stages = [
  { name: '仇恨', min: -100, max: -50 }, { name: '厌恶', min: -50, max: 0 },
  { name: '普通', min: 0, max: 30 }, { name: '友好', min: 30, max: 60 },
  { name: '亲密', min: 60, max: 80 }, { name: '爱恋', min: 80, max: 100, includeMax: true },
];

function bus() {
  const listeners = new Map(), warnings = [];
  return {
    warnings, listeners,
    eventOn(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    eventRemoveListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(context) { for (const fn of listeners.get(EJS_PREPARE_EVENT) ?? []) fn(context); },
    warn(message) { warnings.push(message); },
  };
}

test('EJS 路径保持原生 schema，中文、点路径和数组索引可读', () => {
  const api = createEjsApi({ state: sample() });
  assert.equal(api.get(favorPath), '-63');
  assert.equal(api.get(['entities', 'P1', 'fields', '有.点']), 'literal');
  assert.equal(api.get(['entities', 'P1', 'links', 0]), 'G1');
  assert.equal(api.get('entities.P1.links.0'), 'G1');
  assert.equal(api.get('entities.P1.presence'), 'cold');
  assert.equal(api.get('角色.爱丽丝.好感度'), undefined, '不另建按姓名映射的状态系统');
  assert.equal(api.get('missing.value', 12), 12);
  assert.equal(api.get('missing'), undefined);
});

test('EJS has 不把 0、false、空字符串、null 视为缺失', () => {
  const api = createEjsApi({ state: sample() });
  for (const [key, value] of Object.entries(sample().shared)) {
    assert.equal(api.has(['shared', key]), true);
    assert.equal(api.get(['shared', key], 'fallback'), value);
  }
  assert.equal(api.has('shared.missing'), false);
  assert.equal(api.has('shared.nil.child'), false);
});

test('EJS 路径拒绝原型链、危险键与隐式对象转换', () => {
  const api = createEjsApi({ state: JSON.parse('{"shared":{"__proto__":{"secret":1},"constructor":2},"items":[7]}') });
  for (const path of ['toString', '__proto__', 'shared.__proto__.secret', 'shared.constructor',
    ['items', 'constructor'], ['items', 'prototype'], '', [], null, undefined, 'items..0', ['items', -1], ['items', 0.5],
    [{ toString() { throw new Error('must not coerce'); } }]]) {
    assert.equal(api.has(path), false);
    assert.equal(api.get(path, 'missing'), 'missing');
  }
  assert.equal(api.get('items[0]', 'missing'), 'missing', '首版不冒充完整 Lodash 路径语法');
});

test('EJS 快照深拷贝并冻结，不开放写接口或内部状态引用', () => {
  const original = sample(), api = createEjsApi({ state: original });
  assert.notEqual(api.state, original);
  assert.ok(Object.isFrozen(api) && Object.isFrozen(api.state.entities.P1.fields));
  assert.ok(Object.isFrozen(api.get('entities.P1.links')));
  assert.throws(() => { api.state.entities.P1.fields.好感度 = '100'; }, TypeError);
  assert.throws(() => api.get('entities.P1.links').push('G2'), TypeError);
  original.entities.P1.fields.好感度 = '-80';
  assert.equal(api.get(favorPath), '-63');
  assert.equal(api.set, undefined); assert.equal(api.commit, undefined);
});

test('EJS range 使用 [min,max)，最终端点必须显式 includeMax', () => {
  for (const value of [-100, '-100', -63, '-63', -50.1]) assert.ok(apiFor(value).range(favorPath, -100, -50));
  assert.equal(apiFor('-50').range(favorPath, -100, -50), false);
  assert.ok(apiFor('-50').range(favorPath, -100, -50, { includeMax: true }));
  assert.ok(apiFor(0).range(favorPath, 0, 30));
  assert.ok(apiFor('100').range(favorPath, 80, 100, { includeMax: true }));
  assert.equal(apiFor('100').range(favorPath, 80, 100, { includeMax: 'true' }), false);
});

test('EJS 数值读取拒绝空白、布尔、单位、数组、非有限数与 JS 特殊数制', () => {
  for (const value of ['', '   ', null, false, true, [], ['1'], {}, '高', '63点', '0x10', '0b10', 'Infinity', NaN, Infinity, '1e999']) {
    assert.equal(apiFor(value).range(favorPath, -100, 100), false, String(value));
    assert.equal(apiFor(value).stage(favorPath, stages, '未知'), '未知');
  }
  for (const value of [' +1.5 ', '.5', '-.5', '6e1']) assert.ok(apiFor(value).range(favorPath, -2, 100));
  const api = apiFor(0);
  for (const [min, max] of [[1, 0], ['0', 1], [0, '1'], [NaN, 1], [-Infinity, 1], [0, Infinity]]) assert.equal(api.range(favorPath, min, max), false);
  assert.equal(api.range('missing', 0, 1), false);
});

test('EJS stage 连续阶段、重叠首匹配、非法配置和 fallback 稳定', () => {
  for (const [value, name] of [[-100, '仇恨'], [-50, '厌恶'], [0, '普通'], [30, '友好'], [60, '亲密'], [80, '爱恋'], [100, '爱恋']]) {
    assert.equal(apiFor(String(value)).stage(favorPath, stages), name);
  }
  assert.equal(apiFor(101).stage(favorPath, stages, '未知'), '未知');
  assert.equal(apiFor(-101).stage(favorPath, stages), undefined);
  assert.equal(apiFor(0).stage(favorPath, null, '未知'), '未知');
  assert.equal(apiFor(0).stage(favorPath, [null, {}, { name: 'bad', min: 1, max: 0 }, ...stages]), '普通');
  assert.equal(apiFor(0).stage(favorPath, [{ name: 'first', min: 0, max: 50 }, ...stages]), 'first');
});

test('EJS 空状态与有缺口的 replay 不泄露最后一次好状态', () => {
  for (const reading of [{}, { state: null }, { state: sample(), errors: [{}] }, { state: sample(), tainted: true },
    { state: sample(), reason: 'inactive' }]) {
    const api = createEjsApi(reading);
    assert.equal(api.ready, false); assert.deepEqual(api.state, {}); assert.ok(Object.isFrozen(api.state));
    assert.equal(api.get(favorPath, 0), 0); assert.equal(api.has(favorPath), false);
    assert.equal(api.range(favorPath, -100, 100), false); assert.equal(api.stage(favorPath, stages, '未知'), '未知');
  }
  assert.equal(createEjsApi({ state: sample() }).reason, 'ready');
});

test('EJS 事件一次快照、多次 helper 无额外 replay，刷新 context 不使用旧缓存', () => {
  const events = bus(); let reads = 0, value = '-30';
  const dispose = installEjsBridge({ ...events, read() { reads++; return { state: apiFor(value).state }; } });
  assert.equal(reads, 0, '未安装 Prompt Template/未触发事件时不回放');
  const a = {}; events.emit(a);
  assert.equal(reads, 1); assert.equal(a.LoreState.state, a.lorestate);
  assert.equal(a.LoreState.get, a.ls); assert.equal(a.LoreState.has, a.lsHas);
  assert.equal(a.LoreState.range, a.lsRange); assert.equal(a.LoreState.stage, a.lsStage);
  for (let i = 0; i < 20; i++) { a.ls(favorPath); a.lsHas(favorPath); a.lsRange(favorPath, -100, 0); a.lsStage(favorPath, stages); }
  assert.equal(reads, 1);
  value = '-95'; const b = {}; events.emit(b);
  assert.equal(reads, 2); assert.equal(b.ls(favorPath), '-95'); assert.equal(a.ls(favorPath), '-30');
  events.emit(a); assert.equal(reads, 3); assert.equal(a.ls(favorPath), '-95', '复用对象只刷新自身创建的绑定');
  dispose(); dispose(); assert.equal(events.listeners.get(EJS_PREPARE_EVENT).size, 0);
});

test('EJS 不覆盖已有命名空间、别名、继承值或 getter，警告不重复刷屏', () => {
  const events = bus(); installEjsBridge({ ...events, read: () => ({ state: sample() }) });
  const old = () => 'other', context = { ls: old };
  Object.defineProperty(context, 'lsHas', { get() { throw new Error('must not call'); } });
  events.emit(context); assert.equal(context.ls, old); assert.equal(context.LoreState.get(favorPath), '-63');
  const count = events.warnings.length; events.emit(context); assert.equal(events.warnings.length, count);
  const occupied = Object.create({ LoreState: 'other namespace' }); events.emit(occupied);
  assert.equal(occupied.LoreState, 'other namespace'); assert.equal(occupied.ls(favorPath), '-63');
  assert.ok(events.warnings.some(message => message.includes('LoreState')));
  context.lsRange = old; events.emit(context); assert.equal(context.lsRange, old);
});

test('EJS 读取失败隔离异常且不记录私人解析文本，后续 context 可恢复', () => {
  const events = bus(); let broken = true;
  installEjsBridge({ ...events, read() { if (broken) throw new Error('PRIVATE_CHAT_SECRET'); return { state: sample() }; } });
  const bad = {}; events.emit(bad); assert.equal(bad.LoreState.reason, 'read-error'); assert.deepEqual(bad.lorestate, {});
  events.emit({}); assert.equal(events.warnings.length, 1);
  assert.ok(events.warnings.every(message => !message.includes('PRIVATE_CHAT_SECRET')));
  broken = false; const good = {}; events.emit(good); assert.equal(good.ls(favorPath), '-63');
});

test('EJS 生命周期：非法 context、重入、销毁后回调均安全', () => {
  const events = bus(), nested = {}; let reads = 0;
  const dispose = installEjsBridge({ ...events, read() { reads++; events.emit(nested); return { state: sample() }; } });
  for (const bad of [null, undefined, '', [], Object.freeze({ keep: 1 })]) assert.doesNotThrow(() => events.emit(bad));
  assert.equal(reads, 0);
  const good = {}; events.emit(good);
  assert.equal(reads, 1); assert.equal(nested.LoreState.reason, 'busy'); assert.equal(good.LoreState.ready, true);
  const callback = [...events.listeners.get(EJS_PREPARE_EVENT)][0]; dispose();
  const after = {}; callback(after); assert.deepEqual(after, {}); assert.equal(reads, 1);
});

test('EJS 缺少监听/清理能力或注册失败不影响其他功能', () => {
  for (const eventOn of [undefined, () => { throw new Error('registration failure'); }]) {
    const events = bus(); let reads = 0;
    const dispose = installEjsBridge({ ...events, eventOn, read() { reads++; } });
    assert.doesNotThrow(dispose); assert.equal(reads, 0); assert.ok(events.warnings.length);
  }
  const events = bus(); installEjsBridge({ ...events, eventRemoveListener: undefined, read: () => { throw new Error('not called'); } });
  assert.equal(events.listeners.size, 0);
});

test('EJS 渐进世界书条件四档输出符合 -30/-60/-80/-95 合同', () => {
  for (const [value, expected] of [[-30, []], [-60, ['基础敌意']], [-80, ['基础敌意', '主动敌对']], [-95, ['基础敌意', '主动敌对', '严重剧情许可']]]) {
    const api = apiFor(String(value)), selected = [];
    if (api.range(favorPath, -100, -50, { includeMax: true })) selected.push('基础敌意');
    if (api.range(favorPath, -100, -75, { includeMax: true })) selected.push('主动敌对');
    if (api.range(favorPath, -100, -90, { includeMax: true })) selected.push('严重剧情许可');
    assert.deepEqual(selected, expected);
  }
});
