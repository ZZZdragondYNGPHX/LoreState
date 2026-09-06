import { emptyState, peopleOf, validateState } from './core.js';

// Restricted legacy XML reader. It accepts attributes in any order and either quote style.
// No DTD, external entities, executable markup, or guessed repair of malformed input.
function entity(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, name) => {
    if (name.startsWith('#')) {
      const point = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      if (point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error('无效 XML 字符');
      return String.fromCodePoint(point);
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()];
  });
}
export function parseLegacyXml(source) {
  if (typeof source !== 'string' || source.length > 2000000 || /<!|<\?/.test(source)) throw new Error('旧档 XML 大小或声明不受支持');
  const root = { tag: 'root', attrs: {}, children: [], text: '' }, stack = [root];
  const tokens = source.match(/<[^>]*>|[^<]+/g) ?? [];
  if (tokens.join('') !== source) throw new Error('XML 标签不完整');
  for (const token of tokens) {
    if (!token.startsWith('<')) { stack.at(-1).text += entity(token); continue; }
    const close = token.match(/^<\/([A-Za-z]+)\s*>$/);
    if (close) {
      if (stack.length === 1 || stack.at(-1).tag !== close[1]) throw new Error('XML 标签未正确闭合');
      stack.pop(); continue;
    }
    const open = token.match(/^<([A-Za-z]+)([\s\S]*?)(\/?)>$/);
    if (!open || !['WishBook', 'WishPerson', 'Reality', 'Wish', 'Tie', 'WishArchive'].includes(open[1])) throw new Error('旧档包含未知标签');
    const attrs = {};
    let tail = open[2];
    while (tail.trim()) {
      const attr = tail.match(/^\s+([a-zA-Z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (!attr || Object.hasOwn(attrs, attr[1]) || ['constructor', 'prototype'].includes(attr[1])) throw new Error('XML 属性格式或重复属性无效');
      attrs[attr[1]] = entity(attr[2] ?? attr[3]);
      tail = tail.slice(attr[0].length);
    }
    const node = { tag: open[1], attrs, children: [], text: '' };
    stack.at(-1).children.push(node);
    if (!open[3]) stack.push(node);
  }
  if (stack.length !== 1 || root.text.trim()) throw new Error('旧档存在未闭合标签或档外文字');
  return root.children;
}
function fresh(id, name, mode) { return { id, name, mode, reality: {}, wishes: {}, ties: {} }; }
function addFact(person, value) { person.reality[`F${String(Object.keys(person.reality).length + 1).padStart(2, '0')}`] = value; }
export function migrateLegacy(wishBookText, worldbook = null) {
  const state = emptyState(), people = peopleOf(state), warnings = [];
  if (wishBookText.trim()) {
    const nodes = parseLegacyXml(wishBookText);
    if (nodes.length !== 1 || nodes[0].tag !== 'WishBook' || nodes[0].text.trim()) throw new Error('请输入一份完整 WishBook');
    state._legacy = { wishBook: wishBookText };
    const pendingTies = [];
    for (const node of nodes[0].children) {
      if (node.tag !== 'WishPerson' || node.text.trim()) throw new Error('WishBook 人物结构无效');
      const { id, name } = node.attrs;
      if (Object.hasOwn(people, id)) throw new Error(`旧热档人物编号重复：${id}`);
      if (!/^P\d{2,8}$/.test(id ?? '')) throw new Error('旧档人物编号无效');
      const p = fresh(id, name, 'hot');
      people[id] = p;
      p._legacy = {};
      for (const child of node.children) {
        if (child.children.length || !['Reality', 'Wish', 'Tie'].includes(child.tag)) throw new Error('人物字段存在未知或嵌套标签');
        const value = child.text.trim();
        if (!value) continue;
        if (child.tag === 'Reality') addFact(p, value);
        if (child.tag === 'Wish') {
          const match = value.match(/^(W\d{2,8})[｜|](恒|程)[｜|]([\s\S]+)$/);
          if (match) {
            if (Object.hasOwn(p.wishes, match[1])) throw new Error(`${id} 愿望编号重复`);
            p.wishes[match[1]] = { kind: match[2], text: match[3] };
          } else {
            warnings.push(`${id} 有无法确认的 Wish 行，原文保留为事实，请在确认迁移前检查：${value}`);
            addFact(p, `旧愿档待核对：${value}`);
          }
        }
        if (child.tag === 'Tie') pendingTies.push([p, value]);
      }
    }
    // Resolve after cold records are loaded too.
    state._pendingTies = pendingTies;
  }
  if (worldbook) {
    if (!worldbook.entries || typeof worldbook.entries !== 'object') throw new Error('文件不是旧世界书 JSON（缺少 entries）');
    const seen = new Set();
    for (const entry of Object.values(worldbook.entries)) {
      const keys = Array.isArray(entry.key) ? entry.key : typeof entry.key === 'string' ? entry.key.split(',') : [];
      const ids = keys.map(k => String(k).trim()).filter(k => /^@WishNote:P\d{2,8}$/.test(k)).map(k => k.slice(10));
      if (!ids.length) continue;
      if (ids.length !== 1 || seen.has(ids[0])) throw new Error('旧冷档的精确编号重复或歧义，须先消歧');
      const id = ids[0]; seen.add(id);
      const nodes = parseLegacyXml(entry.content ?? '');
      if (nodes.length !== 1 || nodes[0].tag !== 'WishArchive' || nodes[0].attrs.id !== id || nodes[0].children.length) throw new Error(`${id} 冷档内容与精确关键词不一致`);
      const n = nodes[0];
      if (people[id]) {
        people[id]._legacy.coldEntry = structuredClone(entry);
        warnings.push(`${id} 同时有热档和冷档：采用热档，冷档原件保留在导出数据中`);
      } else {
        if (entry.disable === true || entry.disable === 1) warnings.push(`${id} 冷档在旧书中已禁用，但热档中未找到；仍保留为冷档，请核对`);
        const p = fresh(id, n.attrs.name, 'cold');
        addFact(p, n.text.trim());
        p._legacy = { coldEntry: structuredClone(entry) };
        people[id] = p;
      }
    }
  }
  for (const [p, value] of state._pendingTies ?? []) {
    const match = value.match(/^(P\d{2,8})[｜|]([\s\S]+)$/);
    if (match && people[match[1]]) p.ties[`T${String(Object.keys(p.ties).length + 1).padStart(2, '0')}`] = { target: match[1], text: match[2] };
    else { addFact(p, `旧关系原文：${value}`); warnings.push(`${p.id} 有无法结构化的关系，已完整保留为文字`); }
  }
  delete state._pendingTies;
  validateState(state);
  return { state, warnings };
}
export function latestLegacyBook(chat) {
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].is_user || chat[i].is_system) continue;
    const matches = [...(chat[i].mes ?? '').matchAll(/<WishBook\b[^>]*>[\s\S]*?<\/WishBook>/g)];
    if (matches.length > 1) throw new Error(`楼层 ${i} 含多份 WishBook，请手工选择`);
    if (matches.length === 1) return matches[0][0];
  }
  return '';
}
