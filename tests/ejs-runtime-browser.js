import { PROTO_KEY } from '../prototype/core.js';
import { replaySnapshots, planRestore, snapshotSchema } from '../prototype/snapshots.js';

const results = [], handlers = new Map(), eventName = 'prompt_template_prepare';
const schema = { shared: ['地点'], entity: ['好感度'] };
const html = '<!doctype html><html data-lore-template="2"><head></head><body><p data-lore-shared="地点"></p></body></html>';
const full = value => '<LoreState version="3" mode="full"><Shared><地点>白帆港</地点></Shared><Entity id="P1" mode="full" name="爱丽丝" identity="合成夹具" type="角色"><好感度>' + value + '</好感度></Entity></LoreState>';
const delta = value => '<LoreState version="3" mode="delta"><Entity id="P1" mode="delta"><好感度>' + value + '</好感度></Entity></LoreState>';
const message = (id, text) => ({ message_id: id, role: 'assistant', swipe_id: 0, message: text });
const favorPath = 'entities.P1.fields.好感度';
const bundle = await (await fetch('../artifact/bundle.js')).text();
let chatId, chatRef, list, variables, reads = 0, injected = [], earlyContexts = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 70));
const on = (name, fn) => handlers.set(name, [...(handlers.get(name) ?? []), fn]);
const remove = (name, fn) => handlers.set(name, (handlers.get(name) ?? []).filter(x => x !== fn));
async function emit(name, ...args) { for (const fn of [...(handlers.get(name) ?? [])]) await fn(...args); }
function assert(value, message = '断言失败') { if (!value) throw new Error(message); }
async function check(name, fn) { try { await fn(); results.push('PASS ' + name); } catch (e) { results.push('FAIL ' + name + ': ' + e.message); } }
async function prepare(extra = {}) { const context = { ...extra }; await emit(eventName, context); return context; }
Object.assign(window, {
  getVariables: ({ type }) => variables[type],
  updateVariablesWith: (fn, { type }) => { variables[type] = fn(variables[type]); },
  getChatMessages: (_range, options) => { reads++; return structuredClone(list.map(m => options?.include_swipes ? { ...m, swipes: m.swipes ?? [m.message] } : m)); },
  setChatMessages: async edits => { for (const edit of edits) Object.assign(list.find(m => m.message_id === edit.message_id), edit); },
  getCharWorldbookNames: () => ({ primary: 'bridge-book', additional: [] }), getChatWorldbookName: () => null,
  getWorldbook: async () => [{ uid: 1, name: '状态规则', content: '记录公共地点和人物好感度。' }],
  SillyTavern: { getContext: () => ({ chat: chatRef, getCurrentChatId: () => chatId, mainApi: 'openai', stopGeneration: () => true }) },
  tavern_events: Object.fromEntries(['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED',
    'CHARACTER_MESSAGE_RENDERED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED', 'GENERATION_AFTER_COMMANDS'].map(name => [name, name])),
  eventOn: on, eventRemoveListener: remove,
  eventMakeFirst: (name, fn) => { remove(name, fn); handlers.set(name, [fn, ...(handlers.get(name) ?? [])]); },
  getButtonEvent: name => name,
  injectPrompts: prompts => { injected.push(...prompts); return { uninject() {} }; },
});
async function reset(id = 'ejs-A', value = '-60', promptTemplateFirst = false) {
  window.__lorestatePrototypeRuntime?.dispose(); handlers.clear();
  chatId = id; chatRef = []; injected = []; earlyContexts = [];
  list = [message(0, '开场白'), message(1, full('-30')), message(2, delta(value))];
  variables = { script: { [PROTO_KEY]: { ready: true, book: 'bridge-book', uid: 1, schema, html } },
    chat: { [PROTO_KEY]: { enabled: true, start: 1, policy: {} } }, global: {} };
  document.getElementById('chat').replaceChildren();
  for (const m of list) { const el = document.createElement('div'); el.className = 'mes'; el.setAttribute('mesid', m.message_id); document.getElementById('chat').append(el); }
  if (promptTemplateFirst) on('GENERATION_AFTER_COMMANDS', async type => earlyContexts.push(await prepare({ runType: 'generate', generateType: type })));
  Function(bundle)(); await tick();
}
async function begin(type) { await emit('GENERATION_STARTED', type, {}, false); await emit('GENERATION_AFTER_COMMANDS', type, {}, false); }

await check('EJS 最终 bundle 安装六个只读接口，每个 context 一次读取且不写存档', async () => {
  await reset(); const before = JSON.stringify(variables); reads = 0;
  const context = await prepare(); const initialReads = reads;
  assert(context.LoreState.ready && context.LoreState.state === context.lorestate);
  assert(context.ls(favorPath) === '-60'); assert(context.lsHas(favorPath));
  assert(context.lsRange(favorPath, -100, -50)); assert(context.lsStage(favorPath, [{ name: '敌意', min: -100, max: 0 }]) === '敌意');
  for (let i = 0; i < 25; i++) context.ls(favorPath);
  assert(initialReads === 1 && reads === initialReads, 'helper 不能重复读历史');
  assert(JSON.stringify(variables) === before, 'prepare 不写 current、凭据或快照');
  assert(Object.isFrozen(context.lorestate.entities.P1.fields)); assert(window.LoreState === undefined, '不增加宿主全局状态');
});
await check('EJS 编辑、隐藏、删除与 swipe 直接读取当前分支，不依赖 UI 缓存', async () => {
  await reset(); const old = await prepare(); const before = JSON.stringify(variables);
  list[2].message = delta('-95'); list[2].is_hidden = true;
  assert((await prepare()).ls(favorPath) === '-95');
  list[2].swipes = [delta('-80'), delta('-100')]; list[2].swipe_id = 1;
  assert((await prepare()).ls(favorPath) === '-100');
  list[2].swipe_id = 0; assert((await prepare()).ls(favorPath) === '-80');
  list.pop(); assert((await prepare()).ls(favorPath) === '-30');
  assert(old.ls(favorPath) === '-60' && JSON.stringify(variables) === before);
});
await check('EJS 旧楼层渲染截断历史、拒绝不匹配 swipe 与不存在楼层', async () => {
  await reset(); const old = await prepare({ runType: 'render', message_id: 1, swipe_id: 0 });
  assert(old.ls(favorPath) === '-30');
  assert((await prepare({ runType: 'render', message_id: 1, swipe_id: 1 })).LoreState.reason === 'branch-mismatch');
  assert((await prepare({ runType: 'render', message_id: 100 })).LoreState.reason === 'floor-unavailable');
});

await check('EJS 未启用/未配置不读历史，无锚点与历史缺口返回空态', async () => {
  await reset(); variables.chat[PROTO_KEY].enabled = false; reads = 0;
  assert((await prepare()).LoreState.reason === 'inactive' && reads === 0);
  variables.chat[PROTO_KEY].enabled = true; const saved = variables.script; variables.script = {}; reads = 0;
  assert((await prepare()).LoreState.reason === 'inactive' && reads === 0); variables.script = saved;
  list = [message(0, '开场白')]; assert((await prepare()).LoreState.reason === 'uninitialized');
  list.push(message(1, full('-30')), message(2, '<LoreState broken>'));
  const gap = await prepare(); assert(gap.LoreState.reason === 'history-gap');
  assert(Object.keys(gap.lorestate).length === 0 && gap.ls(favorPath, 'fallback') === 'fallback');
});
await check('EJS 作者初始状态复用 initialResult，不强求首个更新块', async () => {
  await reset(); list = [message(0, '开场白')]; delete variables.chat[PROTO_KEY].policy;
  variables.script[PROTO_KEY].authorPolicy = { initial: full('-10') };
  assert((await prepare()).ls(favorPath) === '-10');
});
await check('EJS 回档使用现有 checkpoint；保留历史改变时不返回旧快照', async () => {
  await reset(); const result = replaySnapshots(list.slice(0, 2), schema, 1);
  const snapshot = { id: 'synthetic', floor: 1, swipe: 0, schema: snapshotSchema(schema, 1), result };
  variables.chat[PROTO_KEY].checkpoint = planRestore(snapshot, list, schema, 1).checkpoint;
  assert((await prepare()).ls(favorPath) === '-30');
  list[1].message += '改变保留正文'; const invalid = await prepare();
  assert(invalid.LoreState.reason === 'read-error' && Object.keys(invalid.lorestate).length === 0);
});
await check('EJS Prompt Template 比 LoreState 生成准备先注册也读取正确前态', async () => {
  await reset('ejs-normal', '-60', true); await begin('normal');
  assert(earlyContexts.length === 1 && earlyContexts[0].ls(favorPath) === '-60');
  assert(injected.length === 1, '原 LoreState 生成注入必须保持可用');
  assert((await prepare({ runType: 'generate', generateType: 'normal' })).ls(favorPath) === '-60');
  await emit('GENERATION_STOPPED');
});
await check('EJS regenerate 多阶段固定目标楼层，宿主删楼后不重复排除前一 AI 层', async () => {
  await reset('ejs-regenerate', '-60', true); list.push(message(3, delta('-80')));
  await begin('regenerate'); assert(earlyContexts[0].ls(favorPath) === '-60');
  list.pop(); await emit('MESSAGE_DELETED', 3);
  const late = await prepare({ runType: 'generate', generateType: 'regenerate' });
  assert(late.ls(favorPath) === '-60', '不能错误读到 -30');
  assert(injected.length === 1); await emit('GENERATION_STOPPED');
});
await check('EJS swipe/continue 前态不含旧回复效果，结束后读取当前完整分支', async () => {
  for (const type of ['swipe', 'continue']) {
    await reset('ejs-' + type, '-60', true); list.push(message(3, delta('-80')));
    await begin(type); assert(earlyContexts[0].ls(favorPath) === '-60');
    assert((await prepare({ runType: 'generate', generateType: type })).ls(favorPath) === '-60');
    await emit('GENERATION_STOPPED'); await tick();
    assert((await prepare()).ls(favorPath) === '-80');
    const untracked = await prepare({ runType: 'generate', generateType: type });
    assert(untracked.LoreState.reason === 'generation-untracked');
  }
});
await check('EJS 未支持的 append 生成即使捕获到事件也不猜测前态', async () => {
  for (const type of ['append', 'appendFinal']) {
    await reset('ejs-' + type, '-60', true); await begin(type);
    assert(earlyContexts[0].LoreState.reason === 'generation-untracked');
    await emit('GENERATION_STOPPED');
  }
});
await check('EJS 未完成续写使用空状态，不读取正在改变的原文', async () => {
  await reset(); variables.chat[PROTO_KEY].continuationPending = { floor: 2, original: list[2].message };
  list[2].message += '尚未整理的续写';
  assert((await prepare()).LoreState.reason === 'read-error');
});
await check('EJS 切聊天窗口不泄露旧状态，重启 bundle 后读取新聊天', async () => {
  await reset(); const old = await prepare(); chatId = 'ejs-B'; chatRef = [];
  list = [message(1, full('-95'))]; variables.chat = { [PROTO_KEY]: { enabled: true, start: 1, policy: {} } };
  assert((await prepare()).LoreState.reason === 'chat-changed');
  await reset('ejs-B', '-95'); const next = await prepare();
  assert(next.ls(favorPath) === '-95' && old.ls(favorPath) === '-60');
  assert((await prepare({ chatId: 'ejs-A' })).LoreState.reason === 'chat-changed');
  await reset('ejs-B', '-80'); assert((await prepare()).ls(favorPath) === '-80', '重载不读旧 current 缓存');
  chatRef = []; assert((await prepare()).LoreState.reason === 'chat-changed', '同名但不同聊天对象也不能复用旧 runtime');
});
await check('EJS namespace 冲突不覆盖；替换和销毁 runtime 不留下活动桥接监听', async () => {
  await reset(); const existing = () => 'other'; const conflict = await prepare({ ls: existing });
  assert(conflict.ls === existing && conflict.LoreState.get(favorPath) === '-60');
  const callback = handlers.get(eventName)[0]; Function(bundle)(); await tick();
  assert(handlers.get(eventName).length === 1, '重新执行最终 bundle 只保留一个桥接');
  assert((await prepare()).ls(favorPath) === '-60');
  window.__lorestatePrototypeRuntime.dispose();
  assert(handlers.get(eventName).length === 0); const inactive = {}; callback(inactive);
  assert(Object.keys(inactive).length === 0, '已销毁实例的回调不得重新注入');
});

document.getElementById('result').textContent = results.join('\n');
window.testResults = results;
