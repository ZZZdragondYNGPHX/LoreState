import { KEY, clone, digest, emptyState, GENESIS, nextBase, replay, stripProtocol, validateState } from './core.js';
import { buildPrompt } from './prompt.js';

export const REQUIRED_EVENTS = ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'GENERATION_ENDED'];
export function capabilities(ctx) {
  const missing = ['saveChat', 'setExtensionPrompt', 'getCurrentChatId'].filter(k => typeof ctx?.[k] !== 'function');
  if (!Array.isArray(ctx?.chat)) missing.push('chat');
  if (!ctx?.chatMetadata) missing.push('chatMetadata');
  if (typeof ctx?.eventSource?.on !== 'function' || typeof ctx?.eventSource?.removeListener !== 'function') missing.push('eventSource');
  for (const key of REQUIRED_EVENTS) if (!ctx?.eventTypes?.[key]) missing.push(`eventTypes.${key}`);
  return missing;
}
function writeOwned(message, fields) {
  message.extra ??= {};
  message.extra[KEY] = { ...message.extra[KEY], ...fields };
  const swipe = message.swipe_id ?? 0;
  if (message.swipe_info?.[swipe]) {
    message.swipe_info[swipe].extra ??= {};
    message.swipe_info[swipe].extra[KEY] = clone(message.extra[KEY]);
  }
}
const signature = chat => JSON.stringify(chat.map(m => [m.mes, m.name, m.is_user, m.is_system, m.swipe_id]));
export class LoreStateHost {
  constructor(getContext, notify = () => {}) {
    this.getContext = getContext;
    this.notify = notify;
    this.requested = new Set();
    this.closed = false;
    this.queue = Promise.resolve();
    this.listeners = [];
  }
  enabled(ctx = this.getContext()) { return ctx.chatMetadata?.[KEY]?.enabled === true; }
  clearPrompt() { this.getContext().setExtensionPrompt?.(KEY, '', 1, 1, false, 0); }
  async read() { return replay(this.getContext().chat); }
  enqueue(task) {
    const ctx = this.getContext(), chat = ctx.chat, id = ctx.getCurrentChatId();
    const valid = () => !this.closed && this.getContext().chat === chat && this.getContext().getCurrentChatId() === id;
    const job = this.queue.then(async () => { if (valid()) return task(ctx, valid); });
    this.queue = job.catch(e => { if (valid()) this.notify(e.message); });
    return job;
  }
  async refresh(persist = false) {
    return this.enqueue(async (ctx, valid) => {
      if (!this.enabled(ctx)) { this.clearPrompt(); return; }
      const before = signature(ctx.chat);
      const result = await replay(clone(ctx.chat));
      if (!valid() || signature(ctx.chat) !== before) return;
      if (persist) {
        let changed = false;
        for (const record of result.records) {
          const message = ctx.chat[record.index];
          const previous = message.extra?.[KEY]?.receipt;
          if (previous?.prefix !== record.prefix || JSON.stringify(previous.snapshot) !== JSON.stringify(record.snapshot)) {
            writeOwned(message, { receipt: record }); changed = true;
          }
        }
        if (changed && valid()) await ctx.saveChat();
      }
      if (valid()) this.notify(result.error ? `第 ${result.error.index} 层更新未提交：${result.error.message}` : '状态已按当前历史重算；磁盘持久化需刷新后核对');
      return result;
    });
  }
  async establish(state) {
    validateState(state);
    return this.enqueue(async (ctx, valid) => {
      if (!ctx.chat.length || typeof ctx.getCurrentChatId() !== 'string' || !ctx.getCurrentChatId().trim()) throw new Error('请先打开有开场白的角色聊天，再启用或迁移；欢迎页不能存档');
      const before = signature(ctx.chat);
      let prefix = GENESIS;
      for (const message of clone(ctx.chat)) prefix = await nextBase(prefix, message);
      if (!valid() || signature(ctx.chat) !== before) throw new Error('聊天已切换或消息已变化，未写入');
      writeOwned(ctx.chat.at(-1), { anchor: { prefix, state: clone(state) } });
      ctx.chatMetadata[KEY] = { ...ctx.chatMetadata[KEY], enabled: true };
      await ctx.saveChat();
      if (valid()) this.notify('基线已提交到当前聊天并请求保存；请导出备份，刷新后核对');
    });
  }
  async disableChat() {
    return this.enqueue(async (ctx, valid) => {
      ctx.chatMetadata[KEY] = { ...ctx.chatMetadata[KEY], enabled: false };
      this.clearPrompt();
      if (valid()) await ctx.saveChat();
      this.notify('本聊天已停用，已保存的数据仍保留');
    });
  }
  async skipFailed() {
    return this.enqueue(async (ctx, valid) => {
      const before = signature(ctx.chat);
      const result = await replay(clone(ctx.chat));
      if (!result.error) throw new Error('当前没有失败更新');
      const message = ctx.chat[result.error.index];
      if (message.extra?.[KEY]?.anchor) throw new Error('基线错误不可忽略，请重新预览迁移');
      const prefix = await nextBase(result.base, message);
      if (!valid() || signature(ctx.chat) !== before) throw new Error('聊天已切换或消息已变化');
      writeOwned(message, { skip: { prefix, reason: '用户明确选择保留上一版状态，忽略此轮更新' } });
      await ctx.saveChat();
      if (valid()) this.notify('已忽略该轮更新，文字正文保留；后续旧更新仍需重新核对');
    });
  }
  async intercept(promptChat, _contextSize, abort, type) {
    if (this.closed) return;
    const ctx = this.getContext();
    this.clearPrompt();
    if (!this.enabled(ctx)) return;
    if (['quiet', 'impersonate'].includes(type)) return;
    // A continuation can contain a second patch or append to a committed patch.
    if (type === 'continue') { abort(true); this.notify('第一版不支持续写同一回复；请新发一轮或重抽'); return; }
    try {
      await this.queue;
      const id = ctx.getCurrentChatId(), chat = ctx.chat;
      const sourceSignature = signature(chat);
      const last = chat.at(-1);
      const before = type === 'swipe' && last && !last.is_user && !last.is_system ? chat.slice(0, -1) : chat;
      const result = await replay(clone(before));
      if (this.closed || this.getContext().chat !== chat || this.getContext().getCurrentChatId() !== id || signature(chat) !== sourceSignature) throw new Error('聊天已切换或消息已变化，取消旧聊天的生成');
      if (!result.started) throw new Error('当前分支没有有效基线，请重新预览迁移/启用');
      if (result.error) throw new Error(`第 ${result.error.index} 层：${result.error.message}`);
      const recent = before.slice(-4).map(m => stripProtocol(m.mes ?? '')).join('\n');
      const prompt = buildPrompt(result, recent, [...this.requested]);
      // Replace entries; coreChat may share message objects with the actual chat.
      for (let i = 0; i < promptChat.length; i++) {
        if (!promptChat[i].is_user) promptChat[i] = { ...promptChat[i], mes: stripProtocol(promptChat[i].mes ?? '') };
      }
      ctx.setExtensionPrompt(KEY, prompt, 1, 1, false, 0);
    } catch (e) { abort(true); this.notify(`生成已停止：${e.message}`); }
  }
  attach() {
    const ctx = this.getContext(), missing = capabilities(ctx);
    if (missing.length) throw new Error(`宿主缺少能力：${missing.join(', ')}`);
    for (const key of REQUIRED_EVENTS) {
      const handler = () => {
        if (key === 'CHAT_CHANGED') { this.requested.clear(); this.clearPrompt(); }
        return this.refresh(key !== 'CHAT_CHANGED').catch(e => this.notify(e.message));
      };
      ctx.eventSource.on(ctx.eventTypes[key], handler);
      this.listeners.push(() => ctx.eventSource.removeListener(ctx.eventTypes[key], handler));
    }
    // Swipe deletion fires before the selected message is swapped; GENERATION/CHAT events
    // and every explicit read always replay the actual selected text, not an event payload.
  }
  dispose() { this.closed = true; this.listeners.splice(0).forEach(stop => stop()); this.clearPrompt(); this.requested.clear(); }
}

export async function exportState(result) {
  return { format: 'lorestate-backup', version: 1, base: result.base, state: result.state, checksum: await digest(result.state) };
}
export async function importBackup(value) {
  if (value?.format !== 'lorestate-backup' || value.version !== 1 || await digest(value.state) !== value.checksum) throw new Error('备份格式、版本或校验和不正确');
  return clone(validateState(value.state));
}
