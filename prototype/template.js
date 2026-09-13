import { checkSchema } from './core.js';

// Template API v2 is presentation only: never derive or persist a data schema here.
export const TEMPLATE_V2_LIMITS = Object.freeze({
  sourceChars: 100000, sourceElements: 5000, repeaters: 32,
  clones: 500, outputElements: 30000, outputChars: 2000000,
});
const V2_QUERY = ['data-lore-each', 'data-lore-count', 'data-lore-empty'];
const V2_META = ['name', 'id', 'type', 'identity', 'confirmed'];
const V2_OUTPUT = ['data-lore-field', 'data-lore-shared', 'data-lore-count', ...V2_META.map(k => 'data-lore-' + k)];
const V2_MODIFIERS = ['data-lore-presence', 'data-lore-select-id', 'data-lore-limit'];
const V2_KNOWN = new Set(['data-lore-template', ...V2_QUERY, ...V2_OUTPUT, ...V2_MODIFIERS]);
const V2_QUERY_SELECTOR = V2_QUERY.map(a => '[' + a + ']').join(',');
const V2_OUTPUT_SELECTOR = V2_OUTPUT.map(a => '[' + a + ']').join(',');
const V2_IDREFS = new Set('for headers aria-activedescendant aria-controls aria-describedby aria-details aria-errormessage aria-flowto aria-labelledby aria-owns'.split(' '));
const V2_TAGS = new Set('HTML HEAD BODY TITLE META STYLE DIV SECTION ARTICLE HEADER FOOTER MAIN ASIDE NAV P SPAN H1 H2 H3 H4 H5 H6 STRONG EM B I U S SMALL SUB SUP MARK BR WBR HR UL OL LI DL DT DD TABLE THEAD TBODY TFOOT TR TH TD CAPTION DETAILS SUMMARY LABEL BLOCKQUOTE PRE CODE KBD SAMP ABBR TIME FIGURE FIGCAPTION'.split(' '));
const V2_GLOBAL_ATTRS = new Set('id class style title lang dir role tabindex'.split(' '));
const V2_NATIVE_ATTRS = {META: ['charset', 'name', 'content'], DETAILS: ['open', 'name'], OL: ['start', 'reversed', 'type'], LI: ['value'], TH: ['colspan', 'rowspan', 'scope', 'headers', 'abbr'], TD: ['colspan', 'rowspan', 'headers'], LABEL: ['for'], TIME: ['datetime']};
const V2_CSS_FUNCTIONS = new Set(('var calc min max clamp minmax repeat fit-content rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix light-dark ' +
  'linear-gradient radial-gradient conic-gradient repeating-linear-gradient repeating-radial-gradient repeating-conic-gradient ' +
  'translate translatex translatey translatez translate3d scale scalex scaley scalez scale3d rotate rotatex rotatey rotatez rotate3d skew skewx skewy matrix matrix3d perspective cubic-bezier steps ' +
  'not is where has nth-child nth-last-child nth-of-type nth-last-of-type lang dir selector counter counters').split(' '));
const V2_UPGRADE = '模板 API 已升级，请重新制作 v2 模板；旧 HTML 与聊天存档保留。需要完整 <html data-lore-template="2"> 文档';

// Use a bounded lexical gate AND the browser's parsed CSSOM. Escapes, unknown
// functions/at-rules and resource-bearing syntax are rejected, not normalized open.
function v2CssTokens(source) {
  if (/[\\\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new Error('CSS 不接受转义或控制字符，请使用字面 Unicode');
  let text = '', stack = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error('CSS 注释未闭合');
      i = end + 1; continue;
    }
    if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, i + 1);
      if (end < 0 || /[\r\n]/.test(source.slice(i + 1, end))) throw new Error('CSS 字符串未闭合');
      text += '""'; i = end; continue;
    }
    if ('({['.includes(ch)) stack.push(ch);
    if (')}]'.includes(ch) && stack.pop() !== {')': '(', '}': '{', ']': '['}[ch]) throw new Error('CSS 括号未配对');
    text += ch;
  }
  if (stack.length) throw new Error('CSS 括号未闭合');
  for (const match of text.matchAll(/@([-\w]+)/g)) {
    if (!['media', 'supports', 'keyframes', 'container', 'layer'].includes(match[1].toLowerCase())) throw new Error('CSS 不接受 @' + match[1]);
  }
  for (const match of text.matchAll(/([-a-zA-Z][\w-]*)\s*\(/g)) {
    const name = match[1].toLowerCase();
    if (text[match.index - 1] !== '@' && !['and', 'or'].includes(name) && !V2_CSS_FUNCTIONS.has(name)) throw new Error('CSS 不接受函数 ' + name + '()');
  }
  if (/(?:^|[;{])\s*(?:behavior|-moz-binding)\s*:/i.test(text)) throw new Error('CSS 包含执行型属性');
  return text;
}
function v2CheckDeclarations(style) {
  for (const property of style) {
    if (['behavior', '-moz-binding'].includes(property.toLowerCase())) throw new Error('CSS 包含执行型属性');
    v2CssTokens(style.getPropertyValue(property));
  }
}
function v2CheckCss(element) {
  if (element.hasAttribute('style')) {
    const tokens = v2CssTokens(element.getAttribute('style'));
    if (/[{}@]/.test(tokens)) throw new Error('style 属性只接受 CSS 声明');
    v2CheckDeclarations(element.style);
  }
  if (element.tagName !== 'STYLE') return;
  const tokens = v2CssTokens(element.textContent);
  if (typeof CSSStyleSheet !== 'function') throw new Error('当前浏览器缺少 CSSStyleSheet 校验接口');
  const sheet = new CSSStyleSheet(); sheet.replaceSync(element.textContent);
  if (tokens.trim() && !sheet.cssRules.length) throw new Error('CSS 未解析为受支持的规则');
  function visit(rules) {
    for (const rule of rules) {
      const grouping = ['CSSContainerRule', 'CSSLayerBlockRule', 'CSSLayerStatementRule'].includes(rule.constructor.name);
      if (![1, 4, 7, 8, 12].includes(rule.type) && !grouping) throw new Error('CSS 规则未开放：' + rule.constructor.name);
      if (rule.style) v2CheckDeclarations(rule.style);
      if (rule.cssRules) visit(rule.cssRules);
    }
  }
  visit(sheet.cssRules);
}
function v2CheckElement(element) {
  if (!V2_TAGS.has(element.tagName)) throw new Error('静态模板不接受 ' + element.tagName);
  for (const attr of element.attributes) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('data-lore-') && !V2_KNOWN.has(name)) throw new Error('未知模板属性：' + name);
    if (/^on/i.test(name) || !(V2_GLOBAL_ATTRS.has(name) || /^aria-[a-z-]+$/.test(name) || /^data-[a-z0-9_-]+$/.test(name) || V2_NATIVE_ATTRS[element.tagName]?.includes(name))) throw new Error('静态模板不接受属性 ' + name);
    if (name === 'tabindex' && !['0', '-1'].includes(attr.value)) throw new Error('tabindex 只接受 0 或 -1');
  }
  if (element.tagName === 'META') {
    const attrs = [...element.attributes].map(a => a.name);
    const charset = attrs.length === 1 && element.getAttribute('charset')?.toLowerCase() === 'utf-8';
    const viewport = attrs.length === 2 && element.getAttribute('name')?.toLowerCase() === 'viewport' && /^\s*width\s*=\s*device-width\s*,\s*initial-scale\s*=\s*1(?:\.0)?\s*$/i.test(element.getAttribute('content') ?? '');
    if (!charset && !viewport) throw new Error('META 只接受 UTF-8 charset 或标准 viewport');
  }
  v2CheckCss(element);
}


function v2ReadQuery(node, attribute, region) {
  const type = node.getAttribute(attribute), presence = node.getAttribute('data-lore-presence') ?? 'active';
  if (!type || type !== type.trim()) throw new Error('区域 ' + region + ' 需要精确模块名称');
  if (!['active', 'cold', 'all'].includes(presence)) throw new Error('区域 ' + region + ' presence 只接受 active/cold/all');
  const selectId = node.getAttribute('data-lore-select-id');
  if (selectId !== null && (!selectId || selectId !== selectId.trim())) throw new Error('区域 ' + region + ' select-id 需要非空精确编号');
  const rawLimit = node.getAttribute('data-lore-limit');
  if (rawLimit !== null && (attribute !== 'data-lore-each' || !/^(?:[1-9]\d?|100)$/.test(rawLimit))) throw new Error('区域 ' + region + ' limit 仅用于 each，值为 1–100 的十进制整数');
  return {node, kind: attribute.slice(10), region, type, presence, selectId, limit: rawLimit === null ? undefined : Number(rawLimit)};
}
function v2PublicPlan(queries, bindings) {
  const freeze = items => Object.freeze(items.map(item => Object.freeze(item)));
  return Object.freeze({apiVersion: 2,
    queries: freeze(queries.map(({node, ...query}) => query)),
    bindings: freeze(bindings.map(({node, ...binding}) => binding)), diagnostics: Object.freeze([])});
}
export function inspectTemplateV2(html, Parser = DOMParser) {
  if (typeof html !== 'string' || !html.trim() || html.length > TEMPLATE_V2_LIMITS.sourceChars) throw new Error('HTML 必须为非空文字，最多 100000 字符');
  const complete = /^(?:\s*<!doctype\s+html\s*>)?\s*<html(?:\s|>)/i.test(html.trim()) && /<\/html>\s*$/i.test(html);
  const doc = new Parser().parseFromString(html, 'text/html');
  if (!complete || doc.documentElement.getAttribute('data-lore-template') !== '2' || doc.querySelector('[data-lore-person],[data-lore-entity],[data-lore-module]')) throw new Error(V2_UPGRADE);
  const elements = [], walker = doc.createTreeWalker(doc.documentElement, 1);
  for (let el = doc.documentElement; el; el = walker.nextNode()) {
    if (elements.length >= TEMPLATE_V2_LIMITS.sourceElements) throw new Error('模板原始 DOM 超过 5000 元素预算');
    elements.push(el); v2CheckElement(el);
  }
  const queries = [], bindings = [], ids = new Map();
  let repeaters = 0;
  for (const el of elements) {
    if (el.hasAttribute('data-lore-template') && el !== doc.documentElement) throw new Error('版本标识仅属于 HTML 根节点');
    const attrs = V2_QUERY.filter(a => el.hasAttribute(a));
    if (attrs.length > 1) throw new Error('一个节点只接受一种查询');
    if (V2_MODIFIERS.some(a => el.hasAttribute(a)) && !attrs.length) throw new Error('查询修饰符须与 each/count/empty 同节点');
    if (attrs.length) {
      if (!doc.body.contains(el) || el === doc.body || ['STYLE', 'META', 'TITLE'].includes(el.tagName)) throw new Error('查询必须位于正文区域');
      if (el.parentElement?.closest(V2_QUERY_SELECTOR)) throw new Error('each/count/empty 查询不得嵌套');
      const query = v2ReadQuery(el, attrs[0], queries.length + 1); queries.push(query);
      if (query.kind === 'each' && ++repeaters > TEMPLATE_V2_LIMITS.repeaters) throw new Error('模板最多 32 个 each 区域');
      if (query.kind === 'empty' && [...el.querySelectorAll('*')].some(child => [...child.attributes].some(a => a.name.startsWith('data-lore-')))) throw new Error('empty 只接受静态内容，不嵌套查询或绑定');
    }
    if (el.hasAttribute('id')) {
      const id = el.getAttribute('id');
      if (!id || /\s/.test(id) || ids.has(id)) throw new Error('静态 id 须非空且唯一：' + id);
      ids.set(id, el);
    }
    if (el.closest('[data-lore-each]') && [...el.attributes].some(a => a.name === 'id' || V2_IDREFS.has(a.name))) throw new Error('重复区域不接受 id 或 IDREF 引用，请使用 class 与静态 aria-label');
  }
  const eachByNode = new Map(queries.filter(q => q.kind === 'each').map(q => [q.node, q]));
  for (const el of elements) {
    for (const attr of el.attributes) if (V2_IDREFS.has(attr.name)) {
      const refs = attr.value.trim().split(/\s+/);
      if (refs.some(id => !ids.has(id) || ids.get(id).closest('[data-lore-each]'))) throw new Error('静态引用需要已存在的非重复区 id：' + attr.name);
    }
    const attrs = V2_OUTPUT.filter(a => el.hasAttribute(a));
    if (!attrs.length) continue;
    if (attrs.length !== 1 || !doc.body.contains(el) || el === doc.body || ['STYLE', 'META', 'TITLE'].includes(el.tagName) || el.children.length || el.hasAttribute('data-lore-each') || el.hasAttribute('data-lore-empty')) throw new Error('绑定须位于正文独立文字节点，不混用输出属性');
    const attribute = attrs[0], field = el.getAttribute(attribute), owner = eachByNode.get(el.closest('[data-lore-each]'));
    if (attribute !== 'data-lore-shared' && attribute !== 'data-lore-count' && !owner) throw new Error('实体绑定须位于 each 区域：' + attribute);
    if (V2_META.some(key => attribute === 'data-lore-' + key) && field !== '') throw new Error('元数据绑定属性值必须为空：' + attribute);
    bindings.push({node: el, attribute, field, region: owner?.region ?? null, type: owner?.type ?? null});
  }
  return {doc, queries, bindings, elementCount: elements.length, plan: v2PublicPlan(queries, bindings)};
}
function v2ValidateInspection(inspection, dataSchema) {
  checkSchema(dataSchema);
  for (const query of inspection.queries) {
    if (!Object.hasOwn(dataSchema.modules ?? {}, query.type)) throw new Error('区域 ' + query.region + ' 使用未声明模块：' + query.type);
  }
  for (const binding of inspection.bindings) {
    if (binding.attribute === 'data-lore-field' && !dataSchema.modules[binding.type].includes(binding.field)) throw new Error('区域 ' + binding.region + ' / ' + binding.type + ' 未声明字段：' + binding.field);
    if (binding.attribute === 'data-lore-shared' && !dataSchema.shared.includes(binding.field)) throw new Error('区域 ' + (binding.region ?? '公共') + ' / shared 未声明字段：' + binding.field);
  }
  return inspection;
}
export function validateTemplateV2(html, dataSchema, Parser = DOMParser) {
  return v2ValidateInspection(inspectTemplateV2(html, Parser), dataSchema).plan;
}

// Queries preserve input traversal order; neither limit nor the first match means "player" or "latest".
export function selectEntities(state, {type, presence = 'active', selectId = null, limit} = {}) {
  if (typeof type !== 'string' || !type || !['active', 'cold', 'all'].includes(presence)) throw new Error('实体查询需要精确类别与有效 presence');
  if (selectId !== null && (typeof selectId !== 'string' || !selectId)) throw new Error('实体查询需要非空 selectId');
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw new Error('实体查询 limit 为 1–100');
  const selected = Object.values(state?.entities ?? {}).filter(entity => entity && entity.type === type &&
    (presence === 'all' ? ['active', 'cold'].includes(entity.presence) : entity.presence === presence) &&
    (selectId === null || entity.id === selectId));
  return limit === undefined ? selected : selected.slice(0, limit);
}
function v2DisplayValue(value, diagnostics, context) {
  if (value === null || value === undefined) return '尚未记录';
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  diagnostics.push(Object.freeze({code: 'invalid-value', ...context}));
  return '数据格式异常';
}
function v2EscapedLength(text, available) {
  let length = text.length;
  if (length > available) throw new Error('模板输出超过 2000000 字符预算');
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '&') length += 4;
    else if (text[i] === '<' || text[i] === '>') length += 3;
    else if (text[i] === '\u00a0') length += 5;
    if (length > available) throw new Error('模板输出超过 2000000 字符预算');
  }
  return length;
}
export function renderTemplateV2(html, state, dataSchema, Parser = DOMParser, diagnostics = []) {
  const {doc, queries, bindings, elementCount} = v2ValidateInspection(inspectTemplateV2(html, Parser), dataSchema);
  const csp = doc.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  const base = doc.createElement('style');
  base.textContent = '*{box-sizing:border-box;min-width:0}html,body{margin:0;max-width:100%}body{padding:12px;color:#e5dfd3;background:#242421;font:14px/1.6 system-ui}p,span,dd,li,h1,h2,h3,h4,h5,h6{overflow-wrap:anywhere}' + V2_OUTPUT_SELECTOR + '{white-space:pre-wrap;overflow-wrap:anywhere}';
  doc.head.prepend(csp, base); // Author CSS follows the minimal readable baseline.
  let outputElements = elementCount + 2, outputChars = '<!doctype html>'.length + doc.documentElement.outerHTML.length, clones = 0;
  function setText(node, value, context) {
    const text = v2DisplayValue(value, diagnostics, context), previous = node.innerHTML.length;
    const length = v2EscapedLength(text, TEMPLATE_V2_LIMITS.outputChars - outputChars + previous);
    outputChars += length - previous; node.textContent = text;
  }
  function bind(node, entity, region) {
    const attribute = V2_OUTPUT.find(a => node.hasAttribute(a)), field = node.getAttribute(attribute);
    const value = attribute === 'data-lore-shared' ? state?.shared?.[field] : attribute === 'data-lore-field' ? entity?.fields?.[field] : entity?.[attribute.slice(10)];
    setText(node, value, {region, field: field || attribute.slice(10), entityId: entity?.id ?? null});
  }
  // Use the scopes recorded before cloning; removing each attributes never reclassifies fields.
  for (const binding of bindings) if (binding.region === null && binding.attribute === 'data-lore-shared') bind(binding.node, null, null);
  for (const query of queries.filter(q => q.kind !== 'each')) {
    const matches = selectEntities(state, query);
    if (query.kind === 'count') setText(query.node, matches.length, {region: query.region, field: 'count'});
    else if (matches.length) {
      outputChars -= query.node.outerHTML.length; outputElements -= query.node.querySelectorAll('*').length + 1;
      query.node.remove();
    }
  }
  for (const query of queries.filter(q => q.kind === 'each')) {
    const selected = selectEntities(state, query), source = query.node, size = source.querySelectorAll('*').length + 1;
    if (clones + selected.length > TEMPLATE_V2_LIMITS.clones) throw new Error('模板总克隆超过 500 预算，请缩小查询或设置 limit');
    outputChars -= source.outerHTML.length; outputElements -= size;
    for (const attr of ['data-lore-each', ...V2_MODIFIERS]) source.removeAttribute(attr);
    const sourceChars = source.outerHTML.length, fragment = doc.createDocumentFragment();
    for (const entity of selected) {
      if (outputElements + size > TEMPLATE_V2_LIMITS.outputElements) throw new Error('模板输出超过 30000 元素预算');
      if (outputChars + sourceChars > TEMPLATE_V2_LIMITS.outputChars) throw new Error('模板输出超过 2000000 字符预算');
      outputElements += size; outputChars += sourceChars; clones++;
      const clone = source.cloneNode(true);
      for (const node of clone.querySelectorAll(V2_OUTPUT_SELECTOR)) bind(node, entity, query.region);
      fragment.append(clone);
    }
    source.replaceWith(fragment);
  }
  const result = '<!doctype html>' + doc.documentElement.outerHTML;
  if (result.length > TEMPLATE_V2_LIMITS.outputChars) throw new Error('模板输出超过 2000000 字符预算');
  return result;
}
