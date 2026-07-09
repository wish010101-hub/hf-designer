// wingExport.test.mjs — unit-test на встроенном assert (без библиотек).
// Запуск: node js/wingExport.test.mjs

import assert from 'node:assert/strict';
import { HFProfile } from './profile.js';
import { generateLinearWing } from './wingPlanform.js';
import { generateStations } from './wingStations.js';
import {
  buildWingExportPackage,
  buildStationsCSV,
  buildBuildNotes,
  buildProfileDAT,
  buildProfileDXF,
  stationFileName,
  listExportFiles,
} from './wingExport.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log('OK   -', name); passed++; }
  catch (err) { console.log('FAIL -', name, '->', err.message); failed++; }
}

const root = new HFProfile('Root');
const mid = new HFProfile('Mid');
const tip = new HFProfile('Tip');
const planform = generateLinearWing({ span: 860, area: 1420, rootChord: 260, tipChord: 110, sweep: 20, washout: -2, sectionCount: 7 });
const stations = generateStations(planform, root, mid, tip);
const pkg = buildWingExportPackage(planform, stations);

check('имена файлов станций: Root/Sxx/Tip корректны', () => {
  assert.equal(stationFileName(0, 7), 'Root');
  assert.equal(stationFileName(6, 7), 'Tip');
  assert.equal(stationFileName(1, 7), 'S01');
  assert.equal(stationFileName(5, 7), 'S05');
});

check('пакет содержит Stations.csv и BuildNotes.txt', () => {
  assert.ok('Stations.csv' in pkg.files);
  assert.ok('BuildNotes.txt' in pkg.files);
});

check('пакет содержит .dat и .dxf для каждой станции (Root, S01..S05, Tip)', () => {
  const expectedNames = ['Root', 'S01', 'S02', 'S03', 'S04', 'S05', 'Tip'];
  for (const name of expectedNames) {
    assert.ok(`${name}.dat` in pkg.files, `нет ${name}.dat`);
    assert.ok(`${name}.dxf` in pkg.files, `нет ${name}.dxf`);
  }
  // ровно 2 (csv+notes) + 7*2 (dat+dxf) файлов, ничего лишнего
  assert.equal(Object.keys(pkg.files).length, 2 + stations.length * 2);
});

check('DAT нормализован (координаты в разумном диапазоне 0..1 по хорде)', () => {
  const dat = pkg.files['Root.dat'];
  const lines = dat.split('\n').slice(1);
  for (const line of lines) {
    const [x, y] = line.trim().split(/\s+/).map(Number);
    assert.ok(x >= -0.05 && x <= 1.05, `x=${x} вне диапазона хорды`);
    assert.ok(Math.abs(y) < 0.5, `y=${y} подозрительно велик для нормализованного профиля`);
  }
});

check('DXF масштабирован в мм по хорде своей станции', () => {
  const rootStation = stations[0];
  const dxf = pkg.files['Root.dxf'];
  const xs = [...dxf.matchAll(/\n10\n([\-0-9.]+)\n/g)].map((m) => parseFloat(m[1]));
  const width = Math.max(...xs) - Math.min(...xs);
  // ширина контура по x должна быть близка к хорде станции в мм (допуск на TE/LE)
  assert.ok(Math.abs(width - rootStation.chord) < rootStation.chord * 0.05, `width=${width} ожидали ~${rootStation.chord}`);
});

check('DXF разных станций масштабирован по-разному (Root шире Tip)', () => {
  const rootDxf = pkg.files['Root.dxf'];
  const tipDxf = pkg.files['Tip.dxf'];
  const widthOf = (dxf) => {
    const xs = [...dxf.matchAll(/\n10\n([\-0-9.]+)\n/g)].map((m) => parseFloat(m[1]));
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(widthOf(rootDxf) > widthOf(tipDxf), 'корневая хорда должна быть шире концевой в мм');
});

check('Stations.csv: заголовок и число строк', () => {
  const csv = pkg.files['Stations.csv'];
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Station,Y,Chord,Twist,ProfileInterpolation');
  assert.equal(lines.length, stations.length + 1);
});

check('Stations.csv: имена станций в CSV совпадают с именами файлов', () => {
  const csv = pkg.files['Stations.csv'];
  const rows = csv.split('\n').slice(1);
  stations.forEach((s, i) => {
    const name = rows[i].split(',')[0];
    assert.equal(name, stationFileName(i, stations.length));
  });
});

check('BuildNotes.txt содержит все требуемые данные', () => {
  const notes = pkg.files['BuildNotes.txt'];
  assert.ok(notes.includes(String(planform.span)));
  assert.ok(notes.includes(planform.area.toFixed(1)));
  assert.ok(notes.includes(planform.mac.toFixed(1)));
  assert.ok(notes.includes(planform.aspectRatio.toFixed(2)));
  assert.ok(notes.includes(String(stations.length)));
  assert.ok(notes.includes(String(planform.washout)));
  assert.ok(notes.includes(String(planform.sweep)));
});

check('все файлы пакета — строки (не бинарные, не ZIP)', () => {
  for (const content of Object.values(pkg.files)) {
    assert.equal(typeof content, 'string');
  }
});

check('buildWingExportPackage требует минимум 2 станции', () => {
  assert.throws(() => buildWingExportPackage(planform, [stations[0]]));
});

check('listExportFiles даёт плоский список с полными путями', () => {
  const list = listExportFiles(pkg);
  assert.equal(list.length, Object.keys(pkg.files).length);
  assert.ok(list.every((f) => f.path.startsWith('WingExport/')));
});

check('модуль не трогает DOM/window/ZIP-библиотеки', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('./wingExport.js', import.meta.url), 'utf-8');
  assert.ok(!/document\.|window\.|canvas|Canvas|JSZip|zip\(/i.test(src));
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
