import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LoreStateHost, REQUIRED_EVENTS, exportState, importBackup } from '../src/host.js';
import { KEY, emptyState, replay } from '../src/core.js';
function environment() {
  const prompts = {}, ctx = { chat: [{ mes: '开场', extra: { other: 42 }, swipe_id: 0, swipe_info: [{ extra: { other: 42 } }] }], chatMetadata: { other: 'keep' }, getCurrentChatId: () => 'test', saveChat: async () => {}, eventSource: new EventEmitter(), eventTypes: Object.fromEntries(REQUIRED_EVENTS.map(x => [x, x])), setExtensionPrompt: (id, text) => { prompts[id] = text; } };
  const host = new LoreStateHost(() => ctx);
  return { host, ctx, prompts };
}
test('启用只写拥有的命名空间并同步选中 swipe', async () => {
  const { host, ctx } = environment(); await host.establish(emptyState());
  assert.equal(ctx.chat[0].extra.other, 42); assert.equal(ctx.chatMetadata.other, 'keep');
  assert.deepEqual(ctx.chat[0].swipe_info[0].extra[KEY], ctx.chat[0].extra[KEY]);
});
test('注入 prompt 时不改写实际聊天正文', async () => {
  const { host, ctx, prompts } = environment(); await host.establish(emptyState());
  const original = ctx.chat[0].mes; const promptChat = ctx.chat.slice();
  await host.intercept(promptChat, 10000, () => assert.fail('不应中断'), 'normal');
  assert.ok(prompts[KEY].includes('LoreStatePatch')); assert.equal(ctx.chat[0].mes, original);
});
test('保存失败不宣称成功且可重新保存', async () => {
  const { host, ctx } = environment(); ctx.saveChat = async () => { throw new Error('离线'); };
  await assert.rejects(host.establish(emptyState()), /离线/);
  ctx.saveChat = async () => {}; await host.establish(emptyState());
  assert.equal((await host.read()).started, true);
});
test('消息错误阻止生成；手动忽略后保持原状态', async () => {
  const { host, ctx } = environment(); await host.establish(emptyState()); ctx.chat.push({ mes: '漏标签' });
  let aborted = false; await host.intercept([], 1000, () => { aborted = true; }, 'normal'); assert.equal(aborted, true);
  await host.skipFailed(); assert.equal((await replay(ctx.chat)).error, null);
});
test('续写同层明确中止，不重复应用更新', async () => {
  const { host } = environment(); await host.establish(emptyState()); let aborted = false;
  await host.intercept([], 1000, () => { aborted = true; }, 'continue'); assert.equal(aborted, true);
});
test('停用清理 prompt，监听器销毁无残留', async () => {
  const { host, ctx, prompts } = environment(); host.attach(); await host.establish(emptyState());
  await host.disableChat(); assert.equal(prompts[KEY], '');
  host.dispose(); assert.equal(ctx.eventSource.eventNames().length, 0);
});
test('切换聊天后已排队的任务不会写入新聊天', async () => {
  const { host, ctx } = environment(); const oldChat = ctx.chat;
  const p = host.establish(emptyState()); ctx.chat = [{ mes: '另一聊天' }]; await p;
  assert.equal(oldChat[0].extra[KEY], undefined); assert.equal(ctx.chat[0].extra, undefined);
});
test('备份校验和与未知字段往返', async () => {
  const state = emptyState(); state.custom = '保留';
  const backup = await exportState({ state, base: 'a' }); assert.deepEqual(await importBackup(backup), state);
  backup.state.custom = '被改'; await assert.rejects(importBackup(backup), /校验/);
});
test('冷档完整文字可随导出刷新重新加载', async () => {
  const { host, ctx } = environment(); const state = emptyState();
  state.data.P01 = { id: 'P01', name: '花', mode: 'cold', reality: { F01: '长久免伤' }, wishes: {}, ties: {} };
  await host.establish(state);
  ctx.chat = JSON.parse(JSON.stringify(ctx.chat));
  assert.equal((await host.read()).state.data.P01.reality.F01, '长久免伤');
});
test('欢迎页不允许建立无法保存的基线', async () => {
  const { host, ctx } = environment(); ctx.getCurrentChatId = () => undefined;
  await assert.rejects(host.establish(emptyState()), /欢迎页/);
  assert.equal(ctx.chat[0].extra[KEY], undefined);
});
