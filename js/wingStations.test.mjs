// wingStations.test.mjs — unit-test на встроенном assert (без библиотек).
// Запуск: node js/wingStations.test.mjs

import assert from 'node:assert/strict';
import { HFProfile, DEFAULT_PARAMS } from './profile.js';
import { generateLinearWing } from './wingPlanform.js';
import { generateStations, exportStationsCSV, blendControlPoints } from './wingStations.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log('OK   -', name); passed++; }
  catch (err) { console.log('FAIL -', name, '->', err.message); failed++; }
}

const root = new HFProfile('Root');
const mid = new HFProfile('Mid');
mid.generateFromParams({ ...DEFAULT_PARAMS, thickness: 0.10, camber: 0.015 });
const tip = new HFProfile('Tip');
tip.generateFromParams({ ...DEFAULT_PARAMS, thickness: 0.08, camber: 0.01 });

const planform = generateLinearWing({ span: 860, area: 1420, rootChord: 260, tipChord: 110, sweep: 20, washout: -2, sectionCount: 9 });

check('generateStations возвращает столько же станций, сколько в planform.stations', () => {
  const stations = generateStations(planform, root, mid, tip);
  assert.equal(stations.length, planform.stations.length);
});

check('корневая станция (frac=0) даёт профиль, идентичный Root', () => {
  const stations = generateStations(planform, root, mid, tip);
  const s0 = stations[0];
  assert.equal(s0.profileInterpolation, 0);
  assert.deepEqual(s0.profile.upperCP, root.upperCP);
  assert.deepEqual(s0.profile.lowerCP, root.lowerCP);
});

check('концевая станция (frac=1) даёт профиль, идентичный Tip', () => {
  const stations = generateStations(planform, root, mid, tip);
  const last = stations[stations.length - 1];
  assert.ok(Math.abs(last.profileInterpolation - 1) < 1e-9);
  assert.deepEqual(last.profile.upperCP, tip.upperCP);
  assert.deepEqual(last.profile.lowerCP, tip.lowerCP);
});

check('станция ровно на середине (frac=0.5) даёт профиль, идентичный Mid', () => {
  // sectionCount=9 -> средняя станция (индекс 4) имеет frac=0.5 ровно
  const stations = generateStations(planform, root, mid, tip);
  const midStation = stations[4];
  assert.ok(Math.abs(midStation.profileInterpolation - 0.5) < 1e-9);
  assert.deepEqual(midStation.profile.upperCP, mid.upperCP);
});

check('промежуточные станции дают промежуточную толщину (монотонность Root->Mid->Tip)', () => {
  const stations = generateStations(planform, root, mid, tip);
  const thicknesses = stations.map((s) => s.profile.stats.maxThickness.value);
  for (let i = 1; i < thicknesses.length; i++) {
    assert.ok(thicknesses[i] <= thicknesses[i - 1] + 1e-6, 'толщина не должна возрастать root->tip для этих параметров');
  }
});

check('крутка: корень = 0°, законцовка = washout (уменьшение угла к концу)', () => {
  const stations = generateStations(planform, root, mid, tip);
  assert.ok(Math.abs(stations[0].twist - 0) < 1e-9, 'корень должен быть 0°');
  assert.ok(Math.abs(stations[stations.length - 1].twist - planform.washout) < 1e-9, 'законцовка должна быть = washout');
  const midStation = stations[4]; // frac=0.5 при sectionCount=9
  assert.ok(Math.abs(midStation.twist - planform.washout / 2) < 1e-9, 'середина должна быть washout/2');
});

check('интерполированные профили не содержат NaN и валидны (rebuild отработал)', () => {
  const stations = generateStations(planform, root, mid, tip);
  for (const s of stations) {
    for (const p of [...s.profile.upper, ...s.profile.lower]) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
    assert.ok(s.profile.stats.area > 0);
  }
});

check('устойчивость к разному числу контрольных точек (add/removeControlPoint)', () => {
  const rootWithExtraPoint = new HFProfile('RootExtra');
  rootWithExtraPoint.addControlPoint('upper', 1); // теперь upperCP длиннее, чем у mid/tip
  const stations = generateStations(planform, rootWithExtraPoint, mid, tip);
  for (const p of [...stations[0].profile.upper, ...stations[2].profile.upper]) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

check('blendControlPoints: длина результата = max(root,mid) на первом сегменте', () => {
  const rootWithExtraPoint = new HFProfile('RootExtra2');
  rootWithExtraPoint.addControlPoint('upper', 1);
  const { upperCP } = blendControlPoints(rootWithExtraPoint, mid, tip, 0.25);
  assert.equal(upperCP.length, Math.max(rootWithExtraPoint.upperCP.length, mid.upperCP.length));
});

check('exportStationsCSV: правильный заголовок и число строк', () => {
  const stations = generateStations(planform, root, mid, tip);
  const csv = exportStationsCSV(stations);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Station,Y,Chord,Twist,Interpolation');
  assert.equal(lines.length, stations.length + 1);
});

check('exportStationsCSV: значения в строках соответствуют данным станции', () => {
  const stations = generateStations(planform, root, mid, tip);
  const csv = exportStationsCSV(stations);
  const firstRow = csv.split('\n')[1].split(',');
  assert.equal(firstRow[0], stations[0].name);
  assert.equal(parseFloat(firstRow[1]), Number(stations[0].span.toFixed(2)));
});

check('модуль не изменяет исходные профили Root/Mid/Tip (иммутабельность входа)', () => {
  const rootUpperBefore = JSON.stringify(root.upperCP);
  generateStations(planform, root, mid, tip);
  assert.equal(JSON.stringify(root.upperCP), rootUpperBefore);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
