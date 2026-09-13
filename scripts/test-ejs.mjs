import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { installEjsBridge, EJS_PREPARE_EVENT } from '../prototype/ejs-bridge.js';

// Optional development smoke: fixed upstream bytes, no install or vendored runtime engine.
// VM isolates the test context for convenience; it is not a security sandbox or real-host proof.
const revision = 'd6f520d149aba146305b0b781ddd691d449c28d2';
const url = 'https://raw.githubusercontent.com/zonde306/ST-Prompt-Template/' + revision + '/src/3rdparty/ejs.js';
const expectedHash = '66b3c84f33adbf154950e18cb55704062e3fa5e2f4e69001f6df296d11548d54';
const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
assert.ok(response.ok, 'Upstream EJS HTTP ' + response.status);
const source = await response.text();
assert.equal(createHash('sha256').update(source).digest('hex'), expectedHash, 'Upstream engine content changed');
const environment = { module: { exports: {} }, exports: {} };
runInNewContext(source, environment, { timeout: 2000, filename: 'pinned-upstream-ejs.js' });
const ejs = environment.module.exports;
assert.equal(ejs.VERSION, '3.1.9');

const documentation = await readFile(new URL('../docs/EJS动态世界书.md', import.meta.url), 'utf8');
const snippet = documentation.match(/<!-- ejs-smoke:progressive -->\s*```ejs\n([\s\S]*?)```/);
assert.ok(snippet, 'Missing executable author example');
const path = 'entities.P1.fields.好感度';
function contextFor(value) {
  let prepare;
  const dispose = installEjsBridge({
    eventOn(event, listener) { assert.equal(event, EJS_PREPARE_EVENT); prepare = listener; },
    eventRemoveListener(event, listener) { assert.equal(event, EJS_PREPARE_EVENT); assert.equal(listener, prepare); },
    read: () => value === null ? {} : { state: { version: 3, shared: {}, entities: { P1: { fields: { 好感度: String(value) } } } } },
  });
  const context = {}; prepare(context); dispose(); return context;
}
let cases = 0;
for (const withoutWith of [false, true]) {
  const render = async (template, context) => {
    const options = { async: true, client: true, outputFunctionName: "print", _with: !withoutWith, strict: withoutWith };
    if (withoutWith) options.destructuredLocals = Object.keys(context);
    const fn = ejs.compile(template, options);
    // Prompt Template supplies an identity escaper, unlike upstream EJS defaults.
    return await fn.call(context, context, value => value);
  };
  for (const [value, levels] of [[-30, 0], [-60, 1], [-80, 2], [-95, 3]]) {
    const context = contextFor(value), before = JSON.stringify(context.lorestate);
    const output = await render(snippet[1], context);
    assert.ok(output.includes('爱丽丝当前好感度：' + value));
    assert.equal(output.includes('明显敌意'), levels >= 1);
    assert.equal(output.includes('主动寻找'), levels >= 2);
    assert.equal(output.includes('严重报复或背叛'), levels >= 3);
    assert.equal(JSON.stringify(context.lorestate), before); cases++;
  }
  assert.equal((await render(snippet[1], contextFor(null))).trim(), ''); cases++;
  assert.equal((await render(snippet[1], {})).trim(), ''); cases++;
  const invalid = await render(snippet[1], contextFor('很高'));
  assert.ok(!invalid.includes('明显敌意') && !invalid.includes('主动寻找') && !invalid.includes('严重报复')); cases++;
  assert.equal((await render('<%= ls("entities.P1.fields.好感度") %>', contextFor('<b>&'))).trim(), '<b>&'); cases++;
  const immutable = contextFor(-95);
  const writeAttempt = '<% try { LoreState.state.entities.P1.fields.好感度 = "100"; } catch {} %><%= ls("entities.P1.fields.好感度") %>';
  assert.equal((await render(writeAttempt, immutable)).trim(), '-95'); assert.equal(immutable.ls(path), '-95'); cases++;
  const aliases = '<%= lorestate.entities.P1.fields.好感度 %>|<%= lsHas("entities.P1.fields.好感度") %>|<%= lsRange("entities.P1.fields.好感度", -100, 0) %>|<%= lsStage("entities.P1.fields.好感度", [{name:"敌意",min:-100,max:0}]) %>';
  assert.equal((await render(aliases, contextFor(-60))).trim(), '-60|true|true|敌意'); cases++;
}
console.log('PASS upstream EJS ' + ejs.VERSION + ': ' + cases + ' author-template cases (with + strict/destructured locals)');
console.log('Source revision: ' + revision + '; SHA-256: ' + expectedHash);
