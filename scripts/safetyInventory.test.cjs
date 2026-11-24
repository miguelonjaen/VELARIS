const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

// Small hook harness: execute the real event handlers and effects without a browser.
function mount(filename, props, exportName = 'default') {
  const slots = []; let index = 0; let effects = []; let tree;
  const changed = (old, deps) => !old || !deps || deps.some((value, i) => value !== old[i]);
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = index++; if (changed(slots[i]?.deps, deps)) effects.push(() => {
      slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    useMemo(fn, deps) { const i = index++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; }
  };
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
  } }).outputText;
  const jsx = (type, props, key) => ({ type, props, key });
  const storage = new Map();
  const localStorage = { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); } };
  vm.runInNewContext(compiled, { exports, localStorage, console: { log() {}, error() {}, warn() {} }, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === 'motion/react') return { motion: { div: 'div' }, AnimatePresence: 'presence' };
    if (name.endsWith('/utils')) return { cn: (...values) => values.join(' ') };
    if (name === './SafetyInventoryLinks') return { default: 'inventory' };
    throw Error(name);
  }});
  return {
    render(next = props) { props = next; index = 0; effects = []; tree = exports[exportName](props); effects.forEach(fn => fn()); return tree; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    nodes() { const result = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return; result.push(node); walk(node.props?.children); } walk(tree); return result; },
    text() { return JSON.stringify(tree); }
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function client({ inventory = [], failLoad = false, failWrite = false, failStatus = false } = {}) {
  const calls = []; const links = new Set();
  return { calls, links, from(table) {
    const query = { table, action: 'select', filters: {} }; calls.push(query);
    const builder = {
      select() { return builder; }, order() { return builder; }, single() { return builder; },
      eq(key, value) { query.filters[key] = value; return builder; },
      upsert(value, options) { query.action = 'upsert'; query.value = value; query.options = options; return builder; },
      delete() { query.action = 'delete'; return builder; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if ((failLoad && query.action === 'select') || (failWrite && query.action !== 'select') || (table === 'vessel_status' && failStatus)) return { error: { message: 'denied' }, data: null };
        if (table === 'inventario') return { data: inventory, error: null };
        if (table === 'tripulacion') return { data: [], error: null };
        if (table === 'vessel_status') return { data: { barco_id: query.value.barco_id }, error: null };
        const ship = query.filters.barco_id ?? query.value?.barco_id;
        const id = query.filters.inventario_id ?? query.value?.inventario_id;
        if (query.action === 'upsert') links.add(`${ship}/${id}`);
        if (query.action === 'delete') links.delete(`${ship}/${id}`);
        return { data: [...links].filter(key => key.startsWith(`${ship}/`) && (!id || key === `${ship}/${id}`)).map(key => ({ inventario_id: key.split('/')[1] })), error: null };
      }).then(resolve, reject); }
    }; return builder;
  }};
}
const component = path.join(__dirname, '../src/components/SafetyInventoryLinks.tsx');
const modal = path.join(__dirname, '../src/components/SafetyModal.tsx');
const item = { id: 'kit', barco_id: 'A', categoria: 'Seguridad', nombre: 'Botiquín', cantidad_actual: 2, ubicacion: 'Cámara', fecha_caducidad: '2027-01-01' };

test('inventory scopes both reads, hides other vessels, links once and unlinks', async () => {
  const supabase = client({ inventory: [item, { ...item, id: 'foreign', barco_id: 'B', nombre: 'OTHER VESSEL' }] });
  const ui = mount(component, { supabase, shipId: 'A' });
  ui.render(); assert.match(ui.text(), /Cargando equipos/); await settle(); ui.render();
  assert.ok(supabase.calls.every(call => call.filters.barco_id === 'A'));
  ui.nodes().find(node => node.props?.['aria-expanded'] === false).props.onClick(); ui.render();
  assert.doesNotMatch(ui.text(), /OTHER VESSEL/); assert.match(ui.text(), /2027-01-01/); assert.match(ui.text(), /Cámara/);
  const button = ui.nodes().find(node => node.props?.children === 'Vincular');
  button.props.onClick(); button.props.onClick(); await settle(); ui.render();
  assert.equal(supabase.calls.filter(call => call.action === 'upsert').length, 1);
  assert.equal(supabase.links.size, 1); assert.match(ui.text(), /Pendiente de comprobación física/);
  ui.nodes().find(node => node.props?.children === 'Desvincular').props.onClick(); await settle(); ui.render();
  assert.equal(supabase.links.size, 0);
  assert.equal(supabase.calls.find(call => call.action === 'delete').filters.barco_id, 'A');
});
test('load and mutation failures remain visible and never show a confirmed link', async () => {
  for (const failLoad of [true, false]) {
    const supabase = client({ inventory: [item], failLoad, failWrite: true });
    const ui = mount(component, { supabase, shipId: 'A' }); ui.render(); await settle(); ui.render();
    if (!failLoad) { ui.nodes().find(node => node.props?.['aria-expanded'] === false).props.onClick(); ui.render();
      ui.nodes().find(node => node.props?.children === 'Vincular').props.onClick(); await settle(); ui.render(); }
    assert.ok(ui.nodes().some(node => node.props?.role === 'alert')); assert.equal(supabase.links.size, 0);
  }
});
test('late inventory response after unmount is ignored', async () => {
  const supabase = client({ inventory: [item] }); const ui = mount(component, { supabase, shipId: 'A' });
  ui.render(); ui.unmount(); await settle(); ui.render(); assert.match(ui.text(), /Cargando equipos/);
});
test('dispatch requires an active vessel and physical checks; save errors never dispatch', async () => {
  for (const failDispatch of [true, false]) {
    let dispatched = 0; let closed = 0;
    const props = { ship: { id: 'A', nombre: 'A', fuel_level: 70, water_level: 80 }, draftId: 'libre',
      supabase: client(), userProfile: { id: 'captain', name: 'Captain' }, simulatedPosition: false, prepareOnly: false,
      onClose() { closed++; }, async onDispatch() { if (failDispatch) throw new Error('denied'); dispatched++; } };
    const ui = mount(modal, props, 'DispatchForm'); ui.render(); await settle(); ui.render();
    let dispatch = ui.nodes().find(node => node.type === 'button' && node.props?.children === 'Zarpar');
    assert.equal(dispatch.props.disabled, true);
    const checks = ui.nodes().filter(node => node.type === 'input' && node.props?.type === 'checkbox' && node.props?.checked === false);
    assert.equal(checks.length, 21); checks.forEach(node => node.props.onChange({ currentTarget: { checked: true } })); ui.render();
    dispatch = ui.nodes().find(node => node.type === 'button' && node.props?.children === 'Zarpar');
    assert.equal(dispatch.props.disabled, false); await dispatch.props.onClick(); ui.render();
    assert.equal(dispatched, failDispatch ? 0 : 1);
    assert.equal(closed, failDispatch ? 0 : 1);
    if (failDispatch) assert.ok(ui.nodes().some(node => node.props?.role === 'alert'));
  }
});
test('no simulation, fleet fallback or inventory-driven checklist certification', () => {
  const source = fs.readFileSync(modal, 'utf8'); const inventory = fs.readFileSync(component, 'utf8');
  assert.doesNotMatch(source, /fleet\[0\]|handleAutoCompleteChecklist|setInterval|setTimeout|analysisProgress/);
  assert.doesNotMatch(inventory, /setSafetyChecklist|onDispatch|vessel_status/);
});
test('pending dispatch cannot close a replacement vessel form', async () => {
  let release; let closed = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const props = { ship: { id: 'A', nombre: 'A' }, draftId: 'libre', supabase: client(),
    userProfile: { id: 'captain', name: 'Captain' }, simulatedPosition: false, prepareOnly: false,
    onClose() { closed++; }, onDispatch() { return pending; } };
  const ui = mount(modal, props, 'DispatchForm'); ui.render(); await settle(); ui.render();
  ui.nodes().filter(node => node.type === 'input' && node.props?.type === 'checkbox')
    .forEach(node => node.props.onChange({ currentTarget: { checked: true } }));
  ui.render(); const saving = ui.nodes().find(node => node.type === 'button' && node.props?.children === 'Zarpar').props.onClick();
  ui.unmount(); release(); await saving;
  assert.equal(closed, 0);
});
test('local migration declares vessel integrity, uniqueness and account/ownership RLS', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261117091500_safety_inventory_links.sql'), 'utf8');
  assert.match(sql, /primary key \(barco_id, inventario_id\)/i);
  assert.match(sql, /foreign key \(inventario_id, barco_id\)\s+references public\.inventario\(id, barco_id\)\s+on update restrict\s+on delete cascade/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for all to authenticated/i);
  for (const clause of ['using', 'with check']) {
    const body = sql.slice(sql.indexOf(clause + ' ('));
    assert.match(body, /public\.is_account_active\(\)/);
    assert.match(body, /b\.id = barco_id/);
    assert.match(body, /b\.user_id = auth\.uid\(\)/);
    assert.match(body, /b\.capitan_id = auth\.uid\(\)/);
  }
  assert.match(sql, /grant select, insert, delete\s+on public\.barco_seguridad_equipos\s+to authenticated/i);
});

test('fleet safety immediately displays vessel inventory without requiring a prior link', async () => {
  const supabase = client({ inventory: [item] });
  const ui = mount(component, { supabase, shipId: 'A', initiallyExpanded: true });
  ui.render(); await settle(); ui.render();
  assert.match(ui.text(), /Botiquín/);
  assert.match(ui.text(), /Cámara/);
  assert.match(ui.text(), /2027-01-01/);
  assert.equal(supabase.calls.filter(call => call.action !== 'select').length, 0);
  assert.equal(ui.nodes().find(node => node.props?.children === 'Vincular').props.disabled, false);
});

test('missing links table keeps inventory visible and disables writes', async () => {
  const base = client({ inventory: [item] });
  const supabase = { from(table) {
    if (table !== 'barco_seguridad_equipos') return base.from(table);
    const builder = { select() { return builder; }, eq() { return builder; },
      then(resolve, reject) { return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'table unavailable' } }).then(resolve, reject); } };
    return builder;
  }};
  const ui = mount(component, { supabase, shipId: 'A', initiallyExpanded: true });
  ui.render(); await settle(); ui.render();
  assert.match(ui.text(), /Botiquín/);
  assert.match(ui.text(), /sin confirmar vinculaciones/);
  assert.ok(ui.nodes().some(node => node.props?.role === 'alert'));
  const disabled = ui.nodes().find(node => node.props?.children === 'Vinculación no disponible');
  assert.equal(disabled.props.disabled, true);
  disabled.props.onClick(); await settle();
  assert.equal(base.calls.filter(call => call.action !== 'select').length, 0);
});

test('fleet mounts the shared inventory only in Safety using the selected dossier vessel', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/traffic/components/FleetManager.tsx'), 'utf8');
  assert.match(source, /selectedBarco\?\.id === selectedShipId \? selectedBarco : null/);
  assert.match(source, /dossierTab === 'safety' && <section/);
  assert.match(source, /<SafetyInventoryLinks key=\{dossier.id\} shipId=\{dossier.id\} supabase=\{supabase\} initiallyExpanded/);
});

test('Safety excludes every other category, including previously linked items', async () => {
  const supabase = client({ inventory: [item, ...['Técnico', 'General', 'Víveres', 'Botiquín'].map((categoria, index) => ({
    ...item, id: `other-${index}`, nombre: `EXCLUDED-${index}`, categoria
  }))] });
  supabase.links.add('A/other-0');
  const ui = mount(component, { supabase, shipId: 'A', initiallyExpanded: true });
  ui.render(); await settle(); ui.render();
  assert.match(ui.text(), /Botiquín/);
  assert.doesNotMatch(ui.text(), /EXCLUDED/);
  assert.equal(supabase.calls.find(call => call.table === 'inventario').filters.categoria, 'Seguridad');
  assert.equal(supabase.calls.find(call => call.table === 'inventario').filters.barco_id, 'A');
  assert.equal(ui.nodes().filter(node => node.props?.children === 'Vincular').length, 1);
});
