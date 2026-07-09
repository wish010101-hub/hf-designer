// wingPlanform.test.mjs — простой unit-test на встроенном assert (без
// сторонних библиотек). Запуск: node js/wingPlanform.test.mjs

import assert from 'node:assert/strict';
import {
  generatePlanform,
  generateLinearWing,
  generateEllipticWing,
  generateBlendedWing,
  calculateArea,
  calculateAspectRatio,
  calculateMAC,
  buildPlanformDXF,
  buildPlanformCSV,
} from './wingPlanform.js';

const BASE = { span: 860, area: 1420, rootChord: 260, tipChord: 110, sweep: 30, sectionCount: 9 };
const TOL = 0.5; // мм, допуск на погрешность сплайна/эллипса на концах

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('OK   -', name);
    passed++;
  } catch (err) {
    console.log('FAIL -', name, '->', err.message);
    failed++;
  }
}

check('linear: хорда у корня и кончика совпадает с параметрами', () => {
  const w = generateLinearWing(BASE);
  assert.ok(Math.abs(w.stations[0].chord - BASE.rootChord) < TOL);
  assert.ok(Math.abs(w.stations.at(-1).chord - BASE.tipChord) < TOL);
});

check('elliptic: хорда у корня и кончика совпадает с параметрами', () => {
  const w = generateEllipticWing(BASE);
  assert.ok(Math.abs(w.stations[0].chord - BASE.rootChord) < TOL);
  assert.ok(Math.abs(w.stations.at(-1).chord - BASE.tipChord) < TOL);
});

check('blended: хорда у корня и кончика совпадает с параметрами', () => {
  const w = generateBlendedWing(BASE);
  assert.ok(Math.abs(w.stations[0].chord - BASE.rootChord) < TOL);
  assert.ok(Math.abs(w.stations.at(-1).chord - BASE.tipChord) < TOL);
});

check('число станций соответствует sectionCount', () => {
  const w = generateLinearWing(BASE);
  assert.equal(w.stations.length, BASE.sectionCount);
});

check('leadingEdge/trailingEdge не пустые и без NaN', () => {
  const w = generateBlendedWing(BASE);
  assert.ok(w.leadingEdge.length > 0 && w.trailingEdge.length > 0);
  for (const p of [...w.leadingEdge, ...w.trailingEdge]) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

check('эллиптическая площадь больше линейной при равных root/tip/span', () => {
  const lin = generateLinearWing(BASE);
  const ell = generateEllipticWing(BASE);
  assert.ok(ell.area > lin.area, `elliptic ${ell.area} должна быть > linear ${lin.area}`);
});

check('calculateArea/AspectRatio/MAC дают согласованные положительные значения', () => {
  const w = generateLinearWing(BASE);
  const areaMM2 = calculateArea(w.stations);
  const ar = calculateAspectRatio(BASE.span, areaMM2);
  const mac = calculateMAC(w.stations, areaMM2);
  assert.ok(areaMM2 > 0);
  assert.ok(ar > 0 && ar < 20, `AR=${ar} вне разумного диапазона`);
  assert.ok(mac > BASE.tipChord && mac < BASE.rootChord, `MAC=${mac} должна быть между tip и root хордой`);
});

check('area на выходе соответствует calculateArea (согласованность)', () => {
  const w = generateLinearWing(BASE);
  const recomputed = calculateArea(w.stations) / 100;
  assert.ok(Math.abs(recomputed - w.area) < 0.01);
});

check('targetArea сохраняет входное значение area как есть (не используется для масштаба)', () => {
  const w = generateLinearWing(BASE);
  assert.equal(w.targetArea, BASE.area);
});

check('dihedral/washout сохраняются, но не влияют на геометрию (пока не используются)', () => {
  const a = generatePlanform({ ...BASE, mode: 'linear', dihedral: 0, washout: 0 });
  const b = generatePlanform({ ...BASE, mode: 'linear', dihedral: 12, washout: 5 });
  assert.equal(a.stations[3].chord, b.stations[3].chord);
  assert.equal(a.leadingEdge[10].x, b.leadingEdge[10].x);
  assert.equal(b.dihedral, 12);
  assert.equal(b.washout, 5);
});

check('DXF: валидная минимальная структура', () => {
  const w = generateLinearWing(BASE);
  const dxf = buildPlanformDXF(w);
  assert.ok(dxf.startsWith('0\nSECTION'));
  assert.ok(dxf.trim().endsWith('EOF'));
  assert.ok(dxf.includes('POLYLINE'));
});

check('CSV: заголовок и число строк соответствует числу станций', () => {
  const w = generateLinearWing(BASE);
  const csv = buildPlanformCSV(w);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'station,y_mm,chord_mm');
  assert.equal(lines.length, BASE.sectionCount + 1);
});

check('модуль не трогает DOM/window (нет обращений в исходнике)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('./wingPlanform.js', import.meta.url), 'utf-8');
  assert.ok(!/document\.|window\.|canvas|Canvas/.test(src));
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
