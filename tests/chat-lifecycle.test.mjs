import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldReloadForChatChange } from '../prototype/runtime.js';

test('聊天 ID 真正变化时要求重载 LoreState runtime', () => {
  assert.equal(shouldReloadForChatChange('chat-a', 'chat-b'), true);
  assert.equal(shouldReloadForChatChange('chat-a', null), true);
  assert.equal(shouldReloadForChatChange('chat-a', 'chat-a'), false);
  assert.equal(shouldReloadForChatChange('chat-a', undefined), false);
});
