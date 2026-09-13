import {inspectTemplateV2, validateTemplateV2, renderTemplateV2, selectEntities, TEMPLATE_V2_LIMITS} from '../prototype/template.js';
import {parseModules, moduleShape} from '../prototype/modules.js';
import {authorPrompt} from '../prototype/core.js';
const results = [];
const assert = (ok, message = '断言失败') => { if (!ok) throw new Error(message); };
async function check(name, fn) { try { await fn(); results.push('PASS ' + name); } catch (error) { results.push('FAIL ' + name + ': ' + error.message); } }
const page = (body, css = '') => '<!doctype html><html data-lore-template="2" lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + css + '</style></head><body>' + body + '</body></html>';
const schema = {shared: ['近况', '地点', '时间'], entity: ['近况', '身体状况', '目标', '持有者', '进展'], modules: {人物: ['近况', '身体状况', '目标'], 物品: ['持有者'], 事件: ['进展']}};
const state = {shared: {近况: '雨后的码头', 地点: '白帆港', 时间: '第三日 · 清晨'}, entities: {
  P1: {id: 'P1', name: '林舟', identity: '书商', type: '人物', presence: 'active', confirmed: '第三日', fields: {近况: '<script>文本而非代码</script>', 身体状况: '健康', 目标: '返回书店'}},
  P2: {id: 'P2', name: '林舟', identity: '邮差', type: '人物', presence: 'active', fields: {近况: '等待回信'}},
  P3: {id: 'P3', name: '旅人', identity: '向导', type: '人物', presence: 'active', fields: {近况: '等候出发'}},
  P4: {id: 'P4', name: '故友', identity: '旧识', type: '人物', presence: 'cold', fields: {近况: '留在远方'}},
  PX: {id: 'PX', name: '未知在场状态', type: '人物', presence: 'pending', fields: {}},
  I1: {id: 'I1', name: '铜钥匙', type: '物品', presence: 'active', fields: {持有者: '林舟'}},
}};
const renderDoc = (source, value = state, shape = schema, diagnostics = []) => new DOMParser().parseFromString(renderTemplateV2(source, value, shape, DOMParser, diagnostics), 'text/html');
function rejects(source, shape = schema, expected = '') { let error; try { validateTemplateV2(source, shape); } catch (e) { error = e; } assert(error, '应拒绝模板'); if (expected) assert(error.message.includes(expected), error.message); }
function renderRejects(source, value, expected) { let error; try { renderTemplateV2(source, value, schema); } catch (e) { error = e; } assert(error?.message.includes(expected), error?.message ?? '应拒绝超预算输出'); }
const freezeDeep = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); } return value; };
const basic = page('<p data-lore-shared="近况"></p><section class="party"><article data-lore-each="人物"><h3 data-lore-name></h3><p data-lore-field="近况"></p></article></section>');

await check('单类 three-clone 与公共/实体同名字段严格分域', () => {
  const doc = renderDoc(basic);
  assert(doc.querySelectorAll('.party article').length === 3);
  assert(doc.querySelector('[data-lore-shared]').textContent === '雨后的码头');
  assert(doc.querySelector('[data-lore-field]').textContent === '<script>文本而非代码</script>');
  assert(!doc.body.textContent.includes('留在远方'));
});
await check('多模块独立区域、同类型多区域和重复字段', () => {
  const source = page('<header><div data-lore-each="人物" data-lore-limit="1"><b data-lore-name></b><span data-lore-field="近况"></span><em data-lore-field="近况"></em></div></header><section class="party"><article data-lore-each="人物"><b data-lore-name></b></article></section><aside><p data-lore-each="物品"><span data-lore-field="持有者"></span></p></aside><footer><p data-lore-empty="事件">没有事件</p><article data-lore-each="事件"><b data-lore-field="进展"></b></article></footer>');
  const doc = renderDoc(source);
  assert(doc.querySelectorAll('header [data-lore-field]').length === 2);
  assert(doc.querySelectorAll('.party article').length === 3);
  assert(doc.querySelector('aside').textContent === '林舟');
  assert(doc.querySelector('footer').textContent === '没有事件');
});
await check('只展示十字段中的两项、只名称、模块省略与仅公共区均合法', () => {
  const fields = Array.from({length: 10}, (_, i) => '字段' + i), shape = {shared: ['地点'], entity: fields, modules: {人物: fields}};
  const before = JSON.stringify(shape);
  for (const source of [page('<article data-lore-each="人物"><b data-lore-field="字段0"></b><p data-lore-field="字段1"></p></article>'), page('<article data-lore-each="人物"><b data-lore-name></b></article>'), page('<p data-lore-shared="地点"></p>')]) {
    const plan = validateTemplateV2(source, shape); assert(Object.isFrozen(plan) && Object.isFrozen(plan.bindings)); assert(!('schema' in plan));
  }
  assert(JSON.stringify(shape) === before);
});
await check('each 内 shared 仍读取公共值；元数据与缺失确认时间明确显示', () => {
  const source = page('<article data-lore-each="人物" data-lore-select-id="P2"><b data-lore-id></b><span data-lore-type></span><em data-lore-identity></em><small data-lore-confirmed></small><p data-lore-shared="近况"></p><p data-lore-field="近况"></p></article>');
  const doc = renderDoc(source);
  assert(doc.querySelector('b').textContent === 'P2'); assert(doc.querySelector('em').textContent === '邮差');
  assert(doc.querySelector('small').textContent === '尚未记录'); assert([...doc.querySelectorAll('p')].map(el => el.textContent).join('|') === '雨后的码头|等待回信');
});
await check('active/cold/all 保持输入顺序且不推断未知 presence', () => {
  assert(selectEntities(state, {type: '人物'}).map(e => e.id).join() === 'P1,P2,P3');
  assert(selectEntities(state, {type: '人物', presence: 'cold'})[0].id === 'P4');
  assert(selectEntities(state, {type: '人物', presence: 'all'}).map(e => e.id).join() === 'P1,P2,P3,P4');
  const doc = renderDoc(page('<article data-lore-each="人物" data-lore-presence="cold"><b data-lore-name></b></article>'));
  assert(doc.body.textContent === '故友');
});
await check('精确 ID 不猜同名实体，也不把输入拼成 CSS selector', () => {
  assert(selectEntities(state, {type: '人物', selectId: 'P2'})[0].identity === '邮差');
  assert(selectEntities(state, {type: '人物', selectId: 'absent'}).length === 0);
  const special = 'P[]#&'; const value = {entities: {x: {...state.entities.P1, id: special}}};
  const doc = renderDoc(page('<article data-lore-each="人物" data-lore-select-id="P[]#&amp;"><b data-lore-id></b></article>'), value);
  assert(doc.body.textContent === special);
});
await check('limit 边界 1/100；count 与 empty 共用完整查询', () => {
  for (const limit of [1, 100]) {
    const doc = renderDoc(page('<b data-lore-count="人物"></b><article data-lore-each="人物" data-lore-limit="' + limit + '"><span data-lore-name></span></article>'));
    assert(doc.querySelector('b').textContent === '3'); assert(doc.querySelectorAll('article').length === Math.min(limit, 3));
  }
  const doc = renderDoc(page('<b data-lore-count="人物" data-lore-presence="cold"></b><p data-lore-empty="人物" data-lore-select-id="missing">空结果</p><p data-lore-empty="人物" data-lore-presence="cold">错误空态</p>'));
  assert(doc.body.textContent === '1空结果');
});
await check('非法 limit/presence/select-id 及孤立修饰符全部拒绝', () => {
  for (const limit of ['', '0', '-1', '1.5', '1e2', '101', '01', ' 2']) rejects(page('<article data-lore-each="人物" data-lore-limit="' + limit + '"></article>'));
  for (const body of ['<p data-lore-count="人物" data-lore-limit="2"></p>', '<p data-lore-empty="人物" data-lore-limit="2"></p>', '<article data-lore-each="人物" data-lore-presence="pending"></article>', '<article data-lore-each="人物" data-lore-select-id=""></article>', '<p data-lore-presence="cold"></p>']) rejects(page(body));
});
await check('未知类别/字段含区域与类型诊断，字段不跨模块或公共范围', () => {
  rejects(page('<article data-lore-each="未知"></article>'), schema, '区域 1 使用未声明模块：未知');
  rejects(page('<article data-lore-each="人物"><p data-lore-field="持有者"></p></article>'), schema, '区域 1 / 人物 未声明字段：持有者');
  rejects(page('<p data-lore-shared="身体状况"></p>'), schema, 'shared 未声明字段');
  rejects(page('<p data-lore-field="近况"></p>'));
});
await check('嵌套查询/empty 数据/混合输出/非文字绑定/未知属性拒绝', () => {
  for (const body of ['<article data-lore-each="人物"><div data-lore-each="人物"></div></article>', '<article data-lore-each="人物"><b data-lore-count="物品"></b></article>', '<p data-lore-empty="人物"><b data-lore-shared="地点"></b></p>', '<b data-lore-shared="地点" data-lore-count="人物"></b>', '<p data-lore-shared="地点"><span>标题</span></p>', '<p data-lore-each="人物" data-lore-name></p>', '<p data-lore-ech="人物"></p>', '<article data-lore-each="人物"><b data-lore-name="true"></b></article>', '<p data-lore-template="2"></p>']) rejects(page(body));
});
await check('重复区 id/IDREF、静态重复或断链引用拒绝；静态关联保留', () => {
  for (const attr of ['id="item"', 'aria-labelledby="title"', 'aria-controls="title"']) rejects(page('<h2 id="title">人物</h2><article data-lore-each="人物" ' + attr + '><b data-lore-name></b></article>'));
  rejects(page('<p id="x"></p><p id="x"></p>')); rejects(page('<p aria-labelledby="missing"></p>'));
  const doc = renderDoc(page('<h2 id="heading">人物</h2><section aria-labelledby="heading"><article data-lore-each="人物"><b data-lore-name></b></article></section>'));
  assert(doc.querySelectorAll('#heading').length === 1 && doc.querySelector('section').getAttribute('aria-labelledby') === 'heading');
});

await check('完整 v2 文档标识必需；旧 API/未知版本不执行', () => {
  for (const source of ['<p data-lore-shared="地点"></p>', basic.replace('data-lore-template="2"', ''), basic.replace('data-lore-template="2"', 'data-lore-template="3"'), page('<article data-lore-entity></article>'), page('<article data-lore-module="人物"></article>'), page('<article data-lore-person></article>')]) rejects(source, schema, '模板 API 已升级');
});
await check('危险标签、事件、URL 属性与作者 CSP/META 拒绝', () => {
  for (const body of ['<script>alert(1)</scr' + 'ipt>', '<iframe></iframe>', '<svg></svg>', '<form></form>', '<input>', '<base href="https://invalid.test">', '<p onclick="alert(1)"></p>', '<p srcdoc="bad"></p>', '<p contenteditable></p>', '<p href="javascript:alert(1)"></p>', '<p src="https://invalid.test"></p>', '<p background="https://invalid.test"></p>', '<meta http-equiv="refresh" content="0">', '<meta name="x" content="bad">', '<meta name="viewport" content="width=device-width, user-scalable=no">']) rejects(page(body));
});
await check('CSSOM 接受静态变量、渐变、Grid/Flex、伪元素及媒体查询', () => {
  const css = ':root{--accent:#c8b47e}body{display:grid;grid-template-columns:minmax(0,1fr);background:linear-gradient(120deg,#111,#222)}p{color:var(--accent)}p::before{content:"◆"}@media (min-width:600px){body{display:flex}}@supports (display:grid){p{padding:clamp(4px,2vw,12px)}}@keyframes soft{from{opacity:.9}to{opacity:1}}';
  validateTemplateV2(page('<p data-lore-shared="地点"></p>', css), schema);
});
await check('CSS 资源函数、import、转义与执行型属性拒绝', () => {
  const slash = String.fromCharCode(92);
  for (const css of ['@import "https://invalid.test/x.css";', 'p{background:url(https://invalid.test/x)}', 'p{background:URL("https://invalid.test/x")}', 'p{background:image-set("https://invalid.test/x" 1x)}', 'p{--asset:url(https://invalid.test/x);background:var(--asset)}', '@im/**/port "https://invalid.test/x";', 'p{background:u' + slash + '72l(https://invalid.test/x)}', '@' + slash + '69mport "https://invalid.test/x";', 'p{background:attr(data-url type(<url>))}', 'p{color:expression(alert(1))}', 'p{behavior:bad}', '@font-face{font-family:x;src:local(x)}', 'p{color:red', 'p{color:red}/*']) rejects(page('<p>静态内容</p>', css));
  rejects(page('<p style="background:url(https://invalid.test/x)">x</p>'));
});
await check('所有动态值作为文本；null/空串/数字/布尔与异常诊断区分', () => {
  const source = page('<article data-lore-each="人物"><p data-lore-field="近况"></p></article>');
  for (const [value, expected, count] of [[null, '尚未记录', 0], [undefined, '尚未记录', 0], ['', '', 0], [0, '0', 0], [false, 'false', 0], [{x: 1}, '数据格式异常', 1], [[1], '数据格式异常', 1], [Infinity, '数据格式异常', 1]]) {
    const diagnostics = [], doc = renderDoc(source, {entities: {x: {...state.entities.P1, fields: {近况: value}}}}, schema, diagnostics);
    assert(doc.querySelector('p').textContent === expected); assert(diagnostics.length === count); assert(!JSON.stringify(diagnostics).includes('[object Object]'));
  }
  const doc = renderDoc(basic); assert(!doc.querySelector('script')); assert(doc.body.textContent.includes('<script>文本而非代码</script>'));
  assert(doc.head.firstElementChild.httpEquiv === 'Content-Security-Policy');
  assert(doc.head.firstElementChild.content === "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
});
await check('重复 render 与 deep-freeze 状态/schema 保持不变，作者样式优先于基线', () => {
  const value = freezeDeep(structuredClone(state)), shape = freezeDeep(structuredClone(schema)), before = JSON.stringify([value, shape]);
  const source = page('<p data-lore-shared="地点"></p>', 'body{color:#123456}');
  const first = renderTemplateV2(source, value, shape); assert(renderTemplateV2(source, value, shape) === first);
  assert(JSON.stringify([value, shape]) === before); assert(first.indexOf('box-sizing') < first.indexOf('color:#123456'));
});
await check('100000 字符、5000 源元素与 32 each 的边界可定位', () => {
  const exact = page('x'.repeat(TEMPLATE_V2_LIMITS.sourceChars - page('').length)); validateTemplateV2(exact, schema); rejects(exact + ' ');
  validateTemplateV2(page('<i></i>'.repeat(4994)), schema); rejects(page('<i></i>'.repeat(4995)), schema, '5000');
  validateTemplateV2(page('<article data-lore-each="人物"></article>'.repeat(32)), schema); rejects(page('<article data-lore-each="人物"></article>'.repeat(33)), schema, '32');
});
await check('500 克隆边界与大量冷档显式 limit，不静默裁剪状态', () => {
  const entities = Object.fromEntries(Array.from({length: 501}, (_, i) => ['P' + i, {...state.entities.P1, id: 'P' + i, presence: 'cold'}]));
  const value = freezeDeep({entities}), before = JSON.stringify(value), source = page('<article data-lore-each="人物" data-lore-presence="cold"><b data-lore-name></b></article>');
  renderRejects(source, value, '500');
  const limited = page('<b data-lore-count="人物" data-lore-presence="cold"></b>' + '<article data-lore-each="人物" data-lore-presence="cold" data-lore-limit="100"><span data-lore-name></span></article>'.repeat(5));
  const doc = renderDoc(limited, value); assert(doc.querySelectorAll('article').length === 500); assert(doc.querySelector('b').textContent === '501'); assert(JSON.stringify(value) === before);
});
await check('逐批元素/序列化文字预算阻止放大，含转义字符', () => {
  const value = {entities: Object.fromEntries(Array.from({length: 100}, (_, i) => ['P' + i, {...state.entities.P1, id: 'P' + i}]))};
  renderRejects(page('<article data-lore-each="人物">' + '<i></i>'.repeat(300) + '</article>'), value, '30000');
  renderRejects(basic, {shared: {近况: 'x'.repeat(2000000)}}, '2000000');
  renderRejects(basic, {shared: {近况: '&'.repeat(400000)}}, '2000000');
});

const moduleRules = await (await fetch('../prototype/module-example.txt')).text();
const moduleSchema = moduleShape(parseModules(moduleRules));
const hudTemplate = await (await fetch('../prototype/example.html')).text();
const compactTemplate = await (await fetch('../prototype/module-example.html')).text();
const moduleState = {shared: {地点: '白帆港 · 北岸集市', 时间: '第三日 · 清晨'}, entities: {
  P1: {id: 'P1', name: '林舟', type: '人物', identity: '同行书商 / 旅途记录者', presence: 'active', confirmed: '第三日清晨', fields: {身体状况: '状态良好', 当前目标: '趁集市开门，取回寄存在书店的旅途手记。'}},
  P2: {id: 'P2', name: '伊芙', type: '人物', identity: '港口向导 / 旧识', presence: 'active', confirmed: '第三日清晨', fields: {身体状况: '左臂轻伤，已包扎', 当前目标: '带领队伍找到前往北境的渡船。'}},
  P3: {id: 'P3', name: '老船长', type: '人物', identity: '留在灯塔的引路人', presence: 'cold', fields: {身体状况: '休养中', 当前目标: '等待下一班船'}},
  I1: {id: 'I1', name: '旧铜钥匙', type: '物品', identity: '仓库钥匙', presence: 'active', fields: {持有者: '林舟', 完好状况: '齿纹完好，带有商会刻印'}},
  I2: {id: 'I2', name: '北境通行函', type: '物品', presence: 'active', fields: {持有者: '伊芙', 完好状况: '封蜡完整'}},
  I3: {id: 'I3', name: '旧罗盘', type: '物品', identity: '存放于灯塔', presence: 'cold', fields: {持有者: '老船长', 完好状况: '指针损坏'}},
  E1: {id: 'E1', name: '日落前的交付', type: '事件', presence: 'active', fields: {事项: '在日落之前，将商会的货物交给北岸仓库守卫。', 进展: '货物已经领取，尚待找到仓库入口。'}},
  N1: {id: 'N1', name: '北境公国', type: '国家', presence: 'active', fields: {政局: '港口恢复开放，议会正在招募远行使者。', 外交: '与南方商会保持通航，边境停战仍在持续。'}},
}};
await check('默认 HUD 与紧凑日志匹配同一现有模块声明，不混入其他类型字段', () => {
  for (const source of [hudTemplate, compactTemplate]) {
    validateTemplateV2(source, moduleSchema); const doc = renderDoc(source, moduleState, moduleSchema);
    assert(doc.querySelector('.party').textContent.includes('林舟')); assert(!doc.querySelector('.party').textContent.includes('旧铜钥匙'));
    assert(doc.querySelector('.inventory').textContent.includes('旧铜钥匙')); assert(doc.querySelector('.quests').textContent.includes('日落前的交付')); assert(doc.querySelector('.world').textContent.includes('北境公国'));
    assert(doc.querySelector('.archive').textContent.includes('老船长')); assert(doc.querySelector('.archive').textContent.includes('旧罗盘'));
  }
});
await check('作者文档与动态 authorPrompt 中的完整 HTML 通过同一 v2 校验/渲染', async () => {
  const prose = await (await fetch('../docs/HTML模板适配指南.md')).text();
  const prompt = authorPrompt(moduleRules), fence = String.fromCharCode(96).repeat(3);
  const pattern = new RegExp(fence + 'html\\s*\n([\\s\\S]*?)' + fence, 'g');
  for (const material of [prose, prompt]) {
    const examples = [...material.matchAll(pattern)]; assert(examples.length > 0, '缺少完整 HTML 示例');
    for (const match of examples) { validateTemplateV2(match[1], moduleSchema); assert(renderDoc(match[1], moduleState, moduleSchema).body.textContent.includes('林舟')); }
  }
  const withoutShared = moduleRules.replace(/【公共栏目】[\s\S]*?(?=【模块：)/, '');
  const shape = moduleShape(parseModules(withoutShared));
  for (const match of authorPrompt(withoutShared).matchAll(pattern)) validateTemplateV2(match[1], shape);
  assert(prompt.includes('HTML 只制作一次') && prompt.includes('XML v3'));
});
async function loadedFrame(source, width, sameOrigin = false) {
  const frame = document.createElement('iframe'); frame.setAttribute('sandbox', sameOrigin ? 'allow-same-origin' : '');
  frame.style.cssText = 'border:0;width:' + width + 'px;height:800px'; frame.title = '合成验证探针';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { frame.remove(); reject(new Error('验证 iframe 加载超时')); }, 2000);
    frame.onload = () => { clearTimeout(timer); resolve(); }; frame.srcdoc = source; document.getElementById('preview').append(frame);
  });
  return frame;
}
await check('真实浏览器探针：空 sandbox/CSP 阻断脚本与资源，CSS/HTML 拒绝路径不发请求', async () => {
  const endpoint = location.origin + '/__lorestate_template_probe__';
  const before = (await (await fetch('/__lorestate_template_probe_results__')).json()).length;
  rejects(page('<img src="' + endpoint + '">')); rejects(page('<p>x</p>', '@import "' + endpoint + '";'));
  const attack = '<img src="' + endpoint + '"><script>parent.postMessage("lorestate-probe","*")</scr' + 'ipt>';
  const value = {entities: {P1: {...state.entities.P1, fields: {近况: attack}}}};
  let message = false; const handler = event => { if (event.data === 'lorestate-probe') message = true; }; window.addEventListener('message', handler);
  // Deliberately append rejected markup after rendering to exercise the second containment layer.
  const source = renderTemplateV2(basic, value, schema).replace('</body>', attack + '</body>');
  const frame = await loadedFrame(source, 320);
  try { await new Promise(resolve => setTimeout(resolve,80)); assert(frame.getAttribute('sandbox') === ''); assert(!message); assert((await (await fetch('/__lorestate_template_probe_results__')).json()).length === before, '探针产生资源请求'); }
  finally { window.removeEventListener('message', handler); frame.remove(); }
});

await check('两种皮肤在 320/960px、200% 字体与长 CJK/无空格文字下不溢出', async () => {
  const longState = structuredClone(moduleState);
  longState.entities.P1.fields.当前目标 = '长篇已确认目标，需要在狭窄的消息容器中正常折行。'.repeat(12) + 'UnbrokenQuestRecord'.repeat(35);
  const before = JSON.stringify(longState);
  for (const source of [hudTemplate, compactTemplate]) for (const width of [320, 960]) for (const scale of [1, 2]) {
    // Test-only same-origin access measures layout; production frames are separately asserted opaque.
    const frame = await loadedFrame(renderTemplateV2(source, longState, moduleSchema), width, true);
    try {
      const doc = frame.contentDocument; doc.documentElement.style.fontSize = (16 * scale) + 'px';
      const view = frame.contentWindow, root = doc.documentElement, grid = doc.querySelector('.dashboard,.layout');
      assert(root.scrollWidth <= root.clientWidth + 1, width + 'px / ' + scale + 'x 根节点横向溢出');
      assert(doc.body.scrollWidth <= doc.body.clientWidth + 1, width + 'px / ' + scale + 'x 内容横向溢出');
      if (width === 320) assert(view.getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1, '窄屏应单列');
      const summary = doc.querySelector('summary'); summary.focus();
      assert(doc.activeElement === summary && summary.getBoundingClientRect().height >= 44, '折叠键盘/触控热区');
      assert(view.getComputedStyle(summary).outlineStyle !== 'none', '焦点样式缺失：'+doc.title+' / '+width+'px / '+scale+'x / documentFocus='+doc.hasFocus()+' / matchesFocus='+summary.matches(':focus'));
      assert(parseFloat(view.getComputedStyle(doc.body).fontSize) >= 14 * scale, '字体缩放未生效');
    } finally { frame.remove(); }
  }
  assert(JSON.stringify(longState) === before);
});
await check('reduced-motion 浏览器环境下两套模板没有运动效果', async () => {
  assert(matchMedia('(prefers-reduced-motion: reduce)').matches, '测试浏览器应启用 reduced-motion');
  for (const source of [hudTemplate, compactTemplate]) {
    const frame = await loadedFrame(renderTemplateV2(source, moduleState, moduleSchema), 320, true);
    try { for (const node of frame.contentDocument.querySelectorAll('article,summary')) assert(frame.contentWindow.getComputedStyle(node).animationName === 'none'); }
    finally { frame.remove(); }
  }
});
await check('受控显隐：精确字段、每实体作用域、嵌套容器与完整 count 分离',()=>{
  const source=page('<header data-lore-if-shared="地点" data-lore-equals="白帆港"><p data-lore-shared="地点"></p></header><section data-lore-if-shared="时间" data-lore-equals="不存在"><p data-lore-count="人物"></p></section><p class="count" data-lore-count="人物"></p><article class="visible-person" data-lore-each="人物" data-lore-if-field="身体状况" data-lore-equals="健康"><b data-lore-name></b><div data-lore-if-field="目标"><span data-lore-field="目标"></span></div></article>');
  const before=JSON.stringify(state),doc=renderDoc(source);
  assert(doc.querySelector('header').textContent==='白帆港');assert(!doc.querySelector('section'));
  assert(doc.querySelectorAll('.visible-person').length===1);assert(doc.querySelector('.visible-person').textContent.includes('返回书店'));
  assert(doc.querySelector('.count').textContent==='3');assert(JSON.stringify(state)===before);
  assert(validateTemplateV2(source,schema).displayBindings.length===4);
});
await check('class 映射只添加白名单 class，不改原 class 或状态、不依赖脚本',()=>{
  const source=page('<main class="base" data-lore-class-shared="地点" data-lore-class-map=\'{"白帆港":"port"}\'><article class="person" data-lore-each="人物" data-lore-class-field="身体状况" data-lore-class-map=\'{"健康":"is-healthy","危险":"is-danger"}\'><b data-lore-name></b></article></main>');
  const doc=renderDoc(source);assert(doc.querySelector('main').className==='base port');assert(doc.querySelectorAll('.is-healthy').length===1);assert(doc.querySelectorAll('.person').length===3);assert(!doc.querySelector('script'));
  assert(doc.querySelector('meta[http-equiv]').content.includes("default-src 'none'"));
});
await check('显隐标量边界：零和 false 是记录值，缺失/对象隐藏，空串需显式 equals',()=>{
  const source=page('<div class="present" data-lore-if-shared="地点">已记录</div><span class="empty" data-lore-if-shared="地点" data-lore-equals="">空值</span>');
  for(const value of [0,false])assert(renderDoc(source,{shared:{地点:value}}).querySelector('.present'));
  for(const value of [null,undefined,{},[],NaN])assert(!renderDoc(source,{shared:{地点:value}}).querySelector('.present'));
  const doc=renderDoc(source,{shared:{地点:''}});assert(!doc.querySelector('.present'));assert(doc.querySelector('.empty'));
});
await check('展示接口拒绝未知字段、跨域、孤立修饰符、条件引用与不安全 class',()=>{
  for(const body of [
    '<p data-lore-if-field="身体状况">x</p>',
    '<p data-lore-if-shared="未知字段">x</p>',
    '<p data-lore-if-shared="地点" data-lore-if-field="身体状况">x</p>',
    '<p data-lore-equals="危险">x</p>',
    '<p data-lore-class-map=\'{"健康":"fine"}\'>x</p>',
    '<p data-lore-class-shared="地点" data-lore-class-map=\'{"白帆港":"red blue"}\'>x</p>',
    '<p data-lore-class-shared="地点" data-lore-class-map="[]">x</p>',
    '<div data-lore-if-shared="地点"><p id="optional">x</p></div>',
    '<article data-lore-each="物品" data-lore-class-field="身体状况" data-lore-class-map=\'{"健康":"fine"}\'></article>',
  ])rejects(page(body));
  rejects(page('<p data-lore-class-shared="地点" data-lore-class-map=\''+JSON.stringify(Object.fromEntries(Array.from({length:33},(_,i)=>[i,'c'])))+'\'>x</p>'));
});
const visual = new URLSearchParams(location.search).get('preview');
if (['hud', 'compact'].includes(visual)) {
  const source = renderTemplateV2(visual === 'hud' ? hudTemplate : compactTemplate, moduleState, moduleSchema);
  document.open(); document.write(source); document.close();
} else {
  document.getElementById('result').textContent = results.join('\n');
  const frame = document.createElement('iframe'); frame.title = 'Template API v2 预览'; frame.setAttribute('sandbox', '');
  frame.style = 'width:320px;height:360px'; frame.srcdoc = renderTemplateV2(basic, state, schema); document.getElementById('preview').append(frame);
}
