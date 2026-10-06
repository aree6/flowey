import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from '../bin/visual-check.mjs';
import { desktopBrowser, desktopPointerCheck } from './helpers/desktop-browser.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.FLOWEY_CHROME ? findChrome() : null;

test('Semantic Lens preserves selection, legend preview and panel contracts', {
  skip: chrome ? false : 'Set FLOWEY_CHROME to run real-browser Semantic Lens checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-lens-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const evidence = process.env.FLOWEY_LENS_EVIDENCE;
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const records = [];
  t.after(() => {
    if (evidence) fs.writeFileSync(path.join(evidence, 'observations.json'), JSON.stringify(records, null, 2) + '\n');
  });
  const cases = {
    architecture: 'web-app.architecture.json', workflow: 'agent-tool-call.workflow.json',
    sequence: 'cache-miss-request.sequence.json', dataflow: 'product-analytics.dataflow.json',
    lifecycle: 'agent-run.lifecycle.json',
  };
  const files = {};
  for (const [mode, example] of Object.entries(cases)) {
    files[mode] = path.join(scratch, mode + '.html');
    execFileSync(process.execPath, [path.join(skillRoot, `renderers/${mode}/render-${mode}.mjs`),
      path.join(skillRoot, 'examples', example), files[mode]]);
  }
  const trace = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', cases.architecture), 'utf8'));
  trace.meta.animation = 'trace';
  const traceInput = path.join(scratch, 'trace.json');
  fs.writeFileSync(traceInput, JSON.stringify(trace)); files.trace = path.join(scratch, 'trace.html');
  execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), traceInput, files.trace]);
  // Initialization fixtures alter only inputs immediately before Lens captures DOM/media.
  const original = fs.readFileSync(files.architecture, 'utf8');
  assert.ok(original.includes('    Flowey.semanticLens = (function () {'), 'Lens fixture anchor');
  for (const [name, source] of Object.entries({
    absent: `document.querySelector('[data-legend-bridge]').remove();`,
    small: `document.querySelectorAll('[data-legend-kind]').forEach((e,i)=>{if(i>1)e.remove();});`,
    zero: `document.querySelector('[data-legend-kind]').setAttribute('data-legend-kind','missing');`,
    coarse: `window.lensMatchMedia=window.matchMedia;window.matchMedia=q=>q==='(hover: hover) and (pointer: fine)'?{matches:false}:lensMatchMedia(q);`,
  })) {
    files[name] = path.join(scratch, name + '.html');
    fs.writeFileSync(files[name], original.replace('    Flowey.semanticLens = (function () {', source + '\n    Flowey.semanticLens = (function () {'));
  }
  const browser = desktopBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const checkPointer = await desktopPointerCheck(browser, session);
  await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  async function run(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.lensErrors=[];window.lensEnds=[];addEventListener('animationend',e=>{if(e.target.matches('.semantic-lens-flow'))lensEnds.push({name:e.animationName,trusted:e.isTrusted});},true);addEventListener('error',e=>lensErrors.push(e.message));
    addEventListener('unhandledrejection',e=>lensErrors.push(String(e.reason)));
    try {localStorage.removeItem('flowey-motion');} catch (_) {}
    window.lensWait=predicate=>new Promise((resolve,reject)=>{
      const start=performance.now();function sample(){if(predicate())return resolve();
      if(performance.now()-start>12000)return reject(new Error('Lens observation timed out'));requestAnimationFrame(sample);}requestAnimationFrame(sample);
    });
  ` });
  async function load(mode = 'architecture', { theme = 'dark', reduced = false, suffix = '' } = {}) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url: pathToFileURL(files[mode]).href + `?theme=${theme}` + suffix });
    await loaded;
    await checkPointer();
    await run('document.fonts.ready'); await run('Flowey.viewerChromeLayout.whenStable()');
  }
  async function point(selector) {
    return run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  }
  async function move(selector) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(selector ? await point(selector) : { x: 0, y: 0 }) }); }
  async function click(selector) {
    const p = await point(selector);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
  }
  async function key(key, code, windowsVirtualKeyCode) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  }
  const legend = kind => `[data-legend-kind="${kind}"]`;
  async function snapshot(scenario) {
    const state = await run(`(()=>{
      const svg=document.querySelector('.diagram-container > svg'),p=Flowey.semanticLens;
      const ids=a=>[...svg.querySelectorAll('[data-node-id]['+a+']')].map(n=>n.getAttribute('data-node-id'));
      return {active:p.active(),open:p.isOpen(),kinds:p.kinds(),hash:location.hash,
        selected:ids('data-lens-selected'),peers:ids('data-lens-peer'),preview:svg.getAttribute('data-legend-preview-active'),
        previewSelected:ids('data-legend-preview-selected'),previewPeers:ids('data-legend-preview-peer'),
        edges:[...svg.querySelectorAll('[data-edge-from][data-lens-match]')].map(n=>[n.getAttribute('data-edge-from'),n.getAttribute('data-edge-to'),n.getAttribute('data-edge-key')]),
        count:svg.getAttribute('data-lens-flow-count'),density:svg.getAttribute('data-lens-flow-density'),
        overlays:svg.querySelectorAll('[data-semantic-lens-overlay]').length,
        directions:[...svg.querySelectorAll('.semantic-lens-flow')].map(n=>n.getAttribute('data-direction')),
        status:document.getElementById('semantic-lens-status').textContent,
        buttons:[...document.querySelectorAll('#semantic-lens-kinds button')].map(n=>({kind:n.dataset.kind,disabled:n.disabled,pressed:n.getAttribute('aria-pressed'),label:n.getAttribute('aria-label')})),
        owner:Flowey.motionGovernor.owner(),errors:lensErrors,external:performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/^https?:/.test(n))};
    })()`);
    assert.deepEqual(state.errors, [], scenario); assert.deepEqual(state.external, [], scenario);
    records.push({ scenario, ...state }); return state;
  }
  async function hash(value) {
    await run(`new Promise(resolve=>{addEventListener('hashchange',()=>resolve(),{once:true});location.hash=${JSON.stringify(value)};})`);
  }

  await t.test('five modes and optional legend initialization preserve counts, roles and embed boundaries', async () => {
    for (const mode of Object.keys(cases)) {
      await load(mode); const state = await snapshot(mode + '-initial');
      assert.equal(state.active, null); assert.equal(state.open, false);
      assert.deepEqual(await run('Object.keys(Flowey.semanticLens).sort()'), ['active', 'clear', 'clearPreview', 'close', 'copyLink', 'isOpen', 'kinds', 'open', 'select', 'toggle']);
      assert.deepEqual(state.buttons.map(n => n.kind), state.kinds.map(n => n.id));
      assert.ok(state.kinds.every((k, i, a) => i === 0 || a[i - 1].count >= k.count));
      assert.equal(await run(`(()=>{const svg=document.querySelector('.diagram-container > svg');return Flowey.semanticLens.kinds().reduce((n,k)=>n+k.count,0)===new Set([...svg.querySelectorAll('[data-node-id][data-node-kind]')].map(n=>n.dataset.nodeId).filter(Boolean)).size;})()`), true);
    }
    for (const mode of ['absent', 'small', 'zero']) {
      await load(mode);
      const facts = await run(`(()=>{const b=document.querySelector('[data-legend-bridge]'),z=document.querySelector('[data-legend-zero]');return {role:b?.getAttribute('role')||null,buttons:b?.querySelectorAll('[role="button"]').length||0,zero:z?{count:z.dataset.legendCount,role:z.getAttribute('role'),hit:!!z.querySelector('[data-legend-hit]'),badge:!!z.querySelector('[data-legend-count-badge]')}:null};})()`);
      if (mode === 'absent') assert.equal(facts.role, null);
      if (mode === 'small') { assert.equal(facts.role, 'group'); assert.equal(facts.buttons, 2); }
      if (mode === 'zero') assert.deepEqual(facts.zero, { count: '0', role: null, hit: true, badge: true });
      assert.equal(await run(`Flowey.semanticLens.select('action')`), true); await snapshot(mode);
    }
    await load('architecture', { suffix: '&embed=1#lens=backend' });
    assert.equal(await run('Flowey.semanticLens.open()'), false);
    assert.equal(await run(`document.querySelectorAll('[data-legend-bridge-runtime]').length`), 0);
    assert.deepEqual((await snapshot('embed-hash')).active, ['action']);
    assert.equal((await snapshot('embed-flow')).overlays, 0);
  });

  await t.test('trusted buttons, selection transitions, return values and three cleanup operations stay distinct', async () => {
    await load(); await click('#btn-semantic-lens');
    await run(`lensWait(()=>document.activeElement.matches('#semantic-lens-kinds button'))`);
    await click('#semantic-lens-kinds [data-kind="action"]');
    let s = await snapshot('one-kind'); assert.deepEqual(s.active, ['action']); assert.equal(s.open, true);
    assert.deepEqual(s.selected, ['api', 'worker']); assert.ok(s.peers.length > 0); assert.ok(s.edges.length > 0);
    await click('#semantic-lens-kinds [data-kind="document"]');
    s = await snapshot('two-kinds'); assert.deepEqual(s.active, ['action', 'document']);
    assert.ok(s.buttons.filter(n => !s.active.includes(n.kind)).every(n => n.disabled));
    assert.equal(await run('Flowey.semanticLens.clearPreview()===undefined'), true);
    s = await snapshot('selection-after-clear-preview'); assert.deepEqual(s.active, ['action', 'document']); assert.equal(s.open, true); assert.equal(s.hash, '#lens=backend~database');
    assert.equal(await run(`Flowey.semanticLens.select('milestone')`), false);
    assert.equal(await run(`Flowey.semanticLens.select('unknown')`), false);
    assert.equal(await run(`(()=>{const a=Flowey.semanticLens.active();a.push('fake');return Flowey.semanticLens.active().length;})()`), 2);
    const close = await run(`(()=>{const p=Flowey.semanticLens,h=location.hash,o=document.querySelector('[data-semantic-lens-overlay]');return {value:p.close(),hash:h===location.hash,overlay:o===document.querySelector('[data-semantic-lens-overlay]'),focus:document.activeElement.id};})()`);
    assert.deepEqual(close, { value: false, hash: true, overlay: true, focus: 'btn-semantic-lens' });
    assert.equal((await snapshot('closed-selected')).open, false);
    assert.equal(await run(`Flowey.semanticLens.select('document')`), true);
    await run('Flowey.view.zoomIn()'); const zoom = await run('Flowey.view.state()');
    assert.equal(await run(`Flowey.semanticLens.select('action')`), false);
    assert.deepEqual(await run('Flowey.view.state()'), zoom);
    await run(`Flowey.semanticLens.select('action');Flowey.semanticLens.open()`);
    await run(`lensWait(()=>document.activeElement.matches('#semantic-lens-kinds button'))`);
    await run('Flowey.view.zoomIn()'); const beforeClear = await run('Flowey.view.state()');
    assert.equal(await run(`Flowey.semanticLens.clear({preserveView:true,updateUrl:false})`), false);
    s = await snapshot('clear-preserve'); assert.equal(s.active, null); assert.equal(s.open, true); assert.equal(s.hash, '#lens=backend');
    assert.deepEqual(await run('Flowey.view.state()'), beforeClear);
    await run(`Flowey.semanticLens.clear({closePanel:true})`);
    s = await snapshot('clear-default'); assert.equal(s.open, false); assert.equal(s.hash, ''); assert.equal(s.overlays, 0);
    assert.equal(await run('Flowey.view.state().scale'), 1);
    // The reset above animates the camera; measure the legend only once it settles.
    await run(`lensWait(()=>!document.querySelector('.diagram-container').hasAttribute('data-camera-transaction'))`);
    await run('Flowey.viewerChromeLayout.whenStable()');
    await move(legend('action')); assert.equal((await snapshot('preview-only')).preview, 'action');
    assert.equal(await run(`Flowey.semanticLens.clear({preserveView:true});document.querySelector('.diagram-container > svg').getAttribute('data-legend-preview-active')`), 'action');
    assert.equal(await run('Flowey.semanticLens.clearPreview()===undefined'), true);
    assert.equal((await snapshot('preview-cleared')).preview, null);
    // Retained hover reference is reused by the original focusout sync path.
    await run(`document.querySelector(${JSON.stringify(legend('document'))}).focus();document.activeElement.blur()`);
    assert.equal((await snapshot('retained-hover')).preview, 'action');
    assert.equal(await run(`Flowey.semanticLens.select('unknown')`), false);
    assert.equal((await snapshot('invalid-clears-preview')).preview, null);
  });

  await t.test('native legend focus, pointer transitions, keyboard activation and opener restoration', async () => {
    await load(); await move(legend('action'));
    let s = await snapshot('legend-hover'); assert.equal(s.preview, 'action'); assert.equal(s.active, null); assert.equal(s.overlays, 0); assert.equal(s.hash, '');
    await run(`document.querySelector(${JSON.stringify(legend('document'))}).focus()`);
    await move(legend('milestone')); assert.equal((await snapshot('focus-preferred')).preview, 'document');
    await run('document.activeElement.blur()'); assert.equal((await snapshot('hover-fallback')).preview, 'milestone');
    const internal = await run(`(()=>{const e=document.querySelector(${JSON.stringify(legend('milestone'))});e.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:e.querySelector('text')}));return document.querySelector('.diagram-container > svg').getAttribute('data-legend-preview-active');})()`);
    assert.equal(internal, 'milestone');
    await move(); await run(`document.querySelector('[data-legend-kind][role="button"]').focus()`);
    const entries = await run(`Array.from(document.querySelectorAll('[data-legend-kind][role="button"]'),n=>n.dataset.legendKind)`);
    await key('End', 'End', 35); assert.equal(await run('document.activeElement.dataset.legendKind'), entries.at(-1));
    await key('ArrowRight', 'ArrowRight', 39); assert.equal(await run('document.activeElement.dataset.legendKind'), entries[0]);
    await key('ArrowLeft', 'ArrowLeft', 37); assert.equal(await run('document.activeElement.dataset.legendKind'), entries.at(-1));
    await key('Home', 'Home', 36); assert.equal(await run('document.activeElement.dataset.legendKind'), entries[0]);
    assert.equal(await run(`document.querySelectorAll('[data-legend-kind][tabindex="0"]').length`), 1);
    await key('Enter', 'Enter', 13);
    await run(`lensWait(()=>document.activeElement.matches('#semantic-lens-kinds button'))`);
    assert.deepEqual((await snapshot('legend-enter')).active, [entries[0]]);
    await key('Escape', 'Escape', 27); assert.equal(await run('document.activeElement.dataset.legendKind'), entries[0]);
    await key(' ', 'Space', 32); await run(`lensWait(()=>document.activeElement.matches('#semantic-lens-kinds button'))`);
    s = await snapshot('legend-space-toggle'); assert.equal(s.active, null); assert.equal(s.open, true);
    await key('Enter', 'Enter', 13); assert.ok((await snapshot('panel-native-enter')).active);
    // Selection rebuilds buttons and removes the focused target; refocus the new button.
    await run(`document.querySelector('#semantic-lens-kinds [aria-pressed="true"]').focus()`);
    await key(' ', 'Space', 32);
    assert.equal((await snapshot('panel-native-space')).active, null);
    await run(`Flowey.semanticLens.clear({closePanel:true,preserveView:true});Flowey.semanticLens.select('action');Flowey.semanticLens.select('document');`);
    await click(legend('milestone'));
    s = await snapshot('third-legend-opens'); assert.deepEqual(s.active, ['action', 'document']); assert.equal(s.open, true);
    await run(`lensWait(()=>document.activeElement.matches('#semantic-lens-kinds button'))`); await key('Escape', 'Escape', 27);
    assert.equal(await run('document.activeElement.dataset.legendKind'), 'milestone');
    for (const mode of ['architecture', 'coarse']) {
      await load(mode);
      await run(`document.querySelector(${JSON.stringify(legend('action'))}).dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:${JSON.stringify(mode === 'coarse' ? 'mouse' : 'touch')}}))`);
      assert.equal((await snapshot(mode + '-filtered-pointer')).preview, null);
    }
  });

  await t.test('minimal SVG fixtures preserve node indexing, grouped directions, first-member geometry and 24/25 threshold', async () => {
    await load();
    const data = await run(`(()=>{
      const svg=document.querySelector('.diagram-container > svg'),p=Flowey.semanticLens;
      svg.innerHTML='<g data-edge-from="a" data-edge-to="b" data-edge-key="ab" transform="translate(3 4)"><path id="source-path" d="M0 0 L10 10" class="author" style="opacity:.7" marker-end="url(#arrow)"/><line x1="1" y1="2" x2="3" y2="4"/></g><path data-edge-from="a" data-edge-to="b" data-edge-key="ab" d="M1 1 L2 2"/><polyline data-edge-from="b" data-edge-to="a" points="1,2 3,4"/><path data-edge-from="b" data-edge-to="a" d="M3 3 L5 5"/><path data-edge-from="a" data-edge-to="a" d="M0 0 C1 2 3 4 0 0"/><g data-node-id="a" data-node-kind="action"/><g data-node-id="b" data-node-kind="document"/><g data-node-id="a" data-node-kind="ignored"/><g data-node-id="missing-kind"/><g data-node-id="" data-node-kind="ignored"/><g data-node-id="solo" data-node-kind=""/>';
      const before=svg.querySelector('#source-path').outerHTML;p.select('action');
      const overlay=svg.querySelector('[data-semantic-lens-overlay]'),shapes=[...overlay.querySelectorAll('.semantic-lens-flow')];
      const result={kinds:p.kinds(),single:{count:svg.dataset.lensFlowCount,matched:svg.querySelectorAll('[data-edge-from][data-lens-match]').length,directions:shapes.map(n=>n.dataset.direction),status:document.getElementById('semantic-lens-status').textContent},
        geometry:{transform:overlay.firstElementChild.getAttribute('transform'),d:shapes[0].getAttribute('d'),points:shapes[2].getAttribute('points'),delays:shapes.map(n=>n.style.getPropertyValue('--lens-flow-delay')),stripped:!overlay.querySelector('[id],[marker-end],[data-edge-from]'),normalized:shapes.every(n=>n.getAttribute('pathLength')==='1'),unchanged:before===svg.querySelector('#source-path').outerHTML,beforeNode:overlay.nextElementSibling.hasAttribute('data-node-id')}};
      p.select('document');result.double={count:svg.dataset.lensFlowCount,directions:[...svg.querySelectorAll('.semantic-lens-flow')].map(n=>n.dataset.direction),peers:svg.querySelectorAll('[data-lens-peer]').length,status:document.getElementById('semantic-lens-status').textContent};
      p.clear({preserveView:true});p.select('document');p.select('action');result.reverse=[...svg.querySelectorAll('.semantic-lens-flow')].map(n=>n.dataset.direction);
      p.clear({preserveView:true});p.select('neutral');p.select('action');result.zero={count:svg.dataset.lensFlowCount,overlays:svg.querySelectorAll('[data-semantic-lens-overlay]').length};return result;
    })()`);
    assert.deepEqual(data.kinds.map(n => n.id).sort(), ['action', 'document', 'neutral']);
    assert.ok(data.kinds.every(n => n.count === 1));
    assert.equal(data.single.count, '3'); assert.equal(data.single.matched, 5);
    assert.deepEqual(data.single.directions, ['out', 'out', 'in', 'within']); assert.match(data.single.status, /3 touching relationships/);
    assert.deepEqual(data.geometry, { transform: 'translate(3 4)', d: 'M0 0 L10 10', points: '1,2 3,4', delays: ['0.00s', '0.00s', '0.08s', '0.16s'], stripped: true, normalized: true, unchanged: true, beforeNode: true });
    assert.equal(data.double.count, '2'); assert.equal(data.double.peers, 0);
    assert.deepEqual(data.double.directions, ['forward', 'forward', 'reverse']);
    assert.deepEqual(data.reverse, ['reverse', 'reverse', 'forward']); assert.deepEqual(data.zero, { count: '0', overlays: 0 });
    records.push({ scenario: 'geometry-fixture', ...data });
    for (const count of [24, 25, 24, 0]) {
      await run(`(()=>{const svg=document.querySelector('.diagram-container > svg');Flowey.semanticLens.clear({preserveView:true});svg.innerHTML=Array.from({length:${count}},(_,i)=>'<path data-edge-from="a" data-edge-to="b" data-edge-key="e'+i+'" d="M0 0 L10 10"/>').join('')+'<g data-node-id="a" data-node-kind="action"/><g data-node-id="b" data-node-kind="document"/>';Flowey.semanticLens.select('action');})()`);
      const s = await snapshot('threshold-' + count); assert.equal(s.count, String(count)); assert.equal(s.edges.length, count);
      assert.equal(s.overlays, count > 0 && count <= 24 ? 1 : 0); assert.equal(s.density, count > 24 ? 'quiet' : null);
    }
    await run(`(()=>{const svg=document.querySelector('.diagram-container > svg');Flowey.semanticLens.clear({preserveView:true});svg.innerHTML='<g data-edge-from="a" data-edge-to="b"><text>No shape</text></g><g data-node-id="a" data-node-kind="action"/><g data-node-id="b" data-node-kind="document"/>';Flowey.semanticLens.select('action');})()`);
    const s = await snapshot('no-shape'); assert.equal(s.count, '1'); assert.equal(s.overlays, 0);
  });

  await t.test('initial URL, hashchange and controlled clipboard boundaries retain normalization and feedback', async () => {
    await load('architecture', { suffix: '&keep=yes#lens=database~database~unknown~backend~cloud' });
    let s = await snapshot('initial-hash'); assert.deepEqual(s.active, ['document', 'action']); assert.equal(s.open, false);
    assert.equal(s.hash, '#lens=database~database~unknown~backend~cloud');
    await hash('#lens=unknown'); assert.deepEqual((await snapshot('invalid-hash')).active, ['document', 'action']);
    await hash('#lens='); assert.equal((await snapshot('empty-hash')).active, null);
    await hash('#lens=backend'); await hash('#unrelated=1'); assert.equal((await snapshot('missing-hash')).active, null);
    assert.equal(await run('Flowey.semanticLens.copyLink()'), false);
    await run(`Flowey.semanticLens.select('action',{updateUrl:false})`);
    assert.equal(await run('location.hash'), '#unrelated=1');
    await run(`Flowey.semanticLens.select('document')`); assert.equal(await run('location.search'), '?theme=dark&keep=yes');
    // Never touch the host clipboard: replace both the preferred API and fallback.
    for (const mode of ['success', 'reject', 'absent', 'failure', 'throw']) {
      const copied = await run(`(async()=>{
        const descriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard'),exec=document.execCommand;let captured,commands=0;
        const expected=location.href.replace(/#.*$/,'')+'#lens=backend~database';
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:${mode === 'success' ? "{writeText:v=>{captured=v;return Promise.resolve();}}" : mode === 'reject' ? "{writeText:()=>Promise.reject(new Error('fixture'))}" : 'undefined'}});
        document.execCommand=command=>{commands++;captured=document.activeElement.value;if(${JSON.stringify(mode)}==='throw')throw new Error('fixture');return ${JSON.stringify(mode)}!=='failure';};
        try {const value=await Flowey.semanticLens.copyLink();return {value,commands,correct:captured===expected,fields:document.querySelectorAll('textarea[readonly]').length,text:document.getElementById('semantic-lens-copy').textContent};}
        finally {document.execCommand=exec;if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);else delete navigator.clipboard;}
      })()`);
      assert.equal(copied.value, !['failure', 'throw'].includes(mode)); assert.equal(copied.commands, mode === 'success' ? 0 : 1);
      assert.equal(copied.correct, true); assert.equal(copied.fields, 0);
      assert.match(copied.text, copied.value ? /Copied/ : /Copy failed/i);
      await run(`lensWait(()=>document.getElementById('semantic-lens-copy').textContent==='Copy link')`);
      records.push({ scenario: 'copy-' + mode, ...copied });
    }
    await snapshot('copy-feedback-restored');
  });

  await t.test('actual capability handoffs and blocked previews preserve existing ownership', async () => {
    for (const [name, action] of [
      ['focus', `Flowey.focus.set('api',{toggle:false})`],
      ['route', `Flowey.routeProbe.begin({source:'users'})`],
      ['intent', `Flowey.intentTrace.show('api',{announce:true})`],
    ]) {
      await load('trace'); await run(`(async()=>{${action}})()`); await run(`Flowey.semanticLens.select('action')`);
      const result = await run(`({focus:Flowey.focus.active(),route:Flowey.routeProbe.active(),intent:Flowey.intentTrace.active()})`);
      assert.deepEqual(result, { focus: null, route: null, intent: null });
      await run(`lensWait(()=>Flowey.motionGovernor.owner()==='lens')`); await snapshot(name + '-to-lens');
    }
    await run('Flowey.semanticLens.open();Flowey.finder.open()');
    assert.equal(await run('Flowey.semanticLens.isOpen()'), false); assert.equal(await run('Flowey.finder.isOpen()'), true);
    await run('Flowey.semanticLens.open();Flowey.guide.open()');
    assert.equal(await run('Flowey.semanticLens.isOpen()'), false); await snapshot('lens-to-guide');
    await load();
    const blockers = await run(`(()=>{
      const svg=document.querySelector('.diagram-container > svg'),html=document.documentElement,e=document.querySelector(${JSON.stringify(legend('action'))});
      return [[html,'data-present'],[svg,'data-focus-active'],[svg,'data-intent-trace-active'],[svg,'data-route-picking'],[svg,'data-route-active'],[svg,'data-relationship-preview-active']].map(([el,a])=>{
        el.setAttribute(a,'true');e.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));const preview=svg.getAttribute('data-legend-preview-active');e.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse'}));el.removeAttribute(a);return {attribute:a,preview};});
    })()`);
    assert.ok(blockers.every(row => row.preview === null)); records.push({ scenario: 'blocker-fixture', blockers });
  });

  await t.test('panel events, pending frames and controlled docking geometry preserve responsive branches', async () => {
    await load(); await key('l', 'KeyL', 76);
    await run(`lensWait(()=>document.activeElement.matches('#semantic-lens-kinds button'))`);
    await click('#semantic-lens-kinds [data-kind="action"]'); assert.equal(await run('Flowey.semanticLens.isOpen()'), true);
    await click('h1'); assert.equal(await run('Flowey.semanticLens.isOpen()'), false);
    await click('#btn-semantic-lens'); await click('#btn-semantic-lens'); assert.equal(await run('Flowey.semanticLens.isOpen()'), false);
    const quick = await run(`new Promise(resolve=>{const p=Flowey.semanticLens;const values=[p.open(),p.open(),p.close({restoreFocus:false})];requestAnimationFrame(()=>resolve({values,open:p.isOpen(),dock:document.getElementById('semantic-lens').getAttribute('data-dock-side')}));})`);
    assert.deepEqual(quick, { values: [true, true, false], open: false, dock: null });
    // Only measured rectangle inputs are overridden; public open/select/resize drive docking.
    const docking = await run(`(async()=>{
      const panel=document.getElementById('semantic-lens'),svg=document.querySelector('.diagram-container > svg'),container=svg.parentElement,nav=container.querySelector('.diagram-nav'),legend=svg.querySelector('[data-legend]'),node=svg.querySelector('[data-node-id="api"]');
      const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
      const elements=[panel,container,nav,legend,node].filter(Boolean),saved=elements.map(e=>Object.getOwnPropertyDescriptor(e,'getBoundingClientRect'));
      let position=700;panel.getBoundingClientRect=()=>rect(700,100,200,200);container.getBoundingClientRect=()=>rect(0,0,1000,800);
      [nav,legend].filter(Boolean).forEach(e=>e.getBoundingClientRect=()=>rect(0,600,100,20));node.getBoundingClientRect=()=>rect(position,100,200,200);
      try {Flowey.semanticLens.open();await new Promise(requestAnimationFrame);const sides=[];for(const x of [700,16,400]){position=x;dispatchEvent(new Event('resize'));sides.push(panel.getAttribute('data-dock-side'));}return sides;}
      finally {elements.forEach((e,i)=>{if(saved[i])Object.defineProperty(e,'getBoundingClientRect',saved[i]);else delete e.getBoundingClientRect;});}
    })()`);
    assert.deepEqual(docking, ['left', 'right', 'right']); records.push({ scenario: 'docking-fixture', sides: docking });
    for (const width of [720, 721, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await run(`lensWait(()=>innerWidth===${width}).then(()=>Flowey.viewerChromeLayout.whenStable())`);
      const dock = await run(`document.getElementById('semantic-lens').getAttribute('data-dock-side')`);
      if (width === 720) assert.equal(dock, null); else assert.ok(['left', 'right'].includes(dock));
      assert.equal(await run(`Array.from(document.querySelectorAll('[data-legend-hit]'),n=>Number(n.getAttribute('width'))).every(w=>w>=24)`), true);
      records.push({ scenario: 'width-' + width, dock });
    }
  });

  await t.test('themes, reduced motion, Still and real SVG export retain selection and preview rendering', async () => {
    for (const theme of ['dark', 'light']) {
      for (const state of ['selection', 'preview']) {
        await load('trace', { theme, reduced: true });
        if (state === 'selection') await run(`Flowey.semanticLens.select('action')`); else await move(legend('action'));
        await run(`lensWait(()=>Flowey.motionGovernor.owner()===${JSON.stringify(state === 'selection' ? 'lens' : 'legend')})`);
        const s = await snapshot(theme + '-' + state); assert.equal(state === 'selection' ? s.active[0] : s.preview, 'action');
        if (state === 'selection') {
          const style = await run(`(()=>{const n=document.querySelector('.semantic-lens-flow'),c=getComputedStyle(n);return {animation:c.animationName,pointer:getComputedStyle(n.parentElement.parentElement).pointerEvents};})()`);
          assert.deepEqual(style, { animation: 'none', pointer: 'none' });
        }
        if (evidence) {
          await run(`Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))`);
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(evidence, theme + '-' + state + '.png'), Buffer.from(shot.data, 'base64'));
        }
        const exported = await run(`(async()=>{
          const original=URL.createObjectURL;let blob;URL.createObjectURL=function(v){if(v.type.startsWith('image/svg+xml'))blob=v;return original.call(URL,v);};
          try {await Flowey.exportMenu.run('svg');}finally{URL.createObjectURL=original;}
          const root=new DOMParser().parseFromString(await blob.text(),'image/svg+xml').documentElement;
          return {clean:!root.hasAttribute('data-lens-active')&&!root.hasAttribute('data-legend-preview-active')&&!root.querySelector('[data-semantic-lens-overlay],[data-lens-match],[data-lens-selected],[data-lens-peer],[data-legend-preview-match],[data-legend-bridge-runtime],[data-legend-count]'),viewBox:root.getAttribute('viewBox')===document.querySelector('.diagram-container > svg').getAttribute('viewBox')};
        })()`);
        assert.deepEqual(exported, { clean: true, viewBox: true });
      }
    }
    await load('trace'); await run(`Flowey.semanticLens.select('action')`);
    const animation = await run(`getComputedStyle(document.querySelector('.semantic-lens-flow')).animationName`);
    assert.equal(animation, 'flowey-semantic-lens-flow');
    await run(`lensWait(()=>lensEnds.some(e=>e.trusted&&e.name==='flowey-semantic-lens-flow'))`);
    assert.deepEqual((await snapshot('animation-finished')).active, ['action']);
    await run(`Flowey.motionGovernor.setMode('still')`);
    await run(`lensWait(()=>getComputedStyle(document.querySelector('.semantic-lens-flow')).animationName==='none')`);
    assert.deepEqual((await snapshot('still-selection')).active, ['action']);
  });
});
