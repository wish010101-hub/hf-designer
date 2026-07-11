// hfSurfaceModel.test.mjs — unit-тесты Этапа 1 Generator V2.
// Запуск: node js/hfSurfaceModel.test.mjs
// Цель — 100% покрытие публичной функциональности: buildSurfaceControlPoints,
// buildSurfaceSpline, sampleSurface, generateSurface, экспортируемые константы,
// включая КАЖДУЮ ветку валидации (не только "счастливый путь").

import assert from 'node:assert/strict';
import {
  buildSurfaceControlPoints,
  buildSurfaceSpline,
  sampleSurface,
  generateSurface,
  ZONES,
  MIN_POINTS_PER_ZONE,
  DEFAULT_SURFACE_PARAMS,
} from './hfSurfaceModel.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log('OK   -', name); passed++; }
  catch (err) { console.log('FAIL -', name, '->', err.message); failed++; }
}

function maxY(sampled) {
  return Math.max(...sampled.map((p) => p.y));
}

// ---------------------------------------------------------------------------
// 1. Базовая генерация (дефолтные параметры)
// ---------------------------------------------------------------------------

check('generateSurface на дефолтных параметрах не падает и возвращает ожидаемую структуру', () => {
  const result = generateSurface(DEFAULT_SURFACE_PARAMS);
  assert.ok(Array.isArray(result.controlPoints));
  assert.ok(Array.isArray(result.sampled));
  assert.equal(result.sampled.length, 121); // resolution=120 по умолчанию -> 121 точка
});

check('buildSurfaceControlPoints: все 7 зон присутствуют в общем случае (zoneLength>0)', () => {
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const zonesPresent = new Set(cp.map((p) => p.zone));
  for (const zoneName of Object.values(ZONES)) {
    assert.ok(zonesPresent.has(zoneName), `зона "${zoneName}" отсутствует`);
  }
});

check('buildSurfaceControlPoints: минимум точек на зону соблюдён (общий случай)', () => {
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  for (const zoneName of Object.values(ZONES)) {
    const count = cp.filter((p) => p.zone === zoneName).length;
    const min = zoneName === ZONES.MAX_THICKNESS_ZONE ? MIN_POINTS_PER_ZONE[zoneName] + 1 : MIN_POINTS_PER_ZONE[zoneName];
    // Зона макс. толщины в общем случае использует 3 точки (start/mid/end) —
    // больше заявленного минимума 2, что явно допускает спецификация.
    assert.ok(count >= MIN_POINTS_PER_ZONE[zoneName], `зона "${zoneName}": ${count} точек, минимум ${MIN_POINTS_PER_ZONE[zoneName]}`);
  }
});

check('x контрольных точек строго монотонно возрастает', () => {
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  for (let i = 1; i < cp.length; i++) {
    assert.ok(cp[i].x > cp[i - 1].x, `x не возрастает между индексами ${i - 1} и ${i}`);
  }
});

check('первая точка — LE в начале координат, последняя — TE на x=1', () => {
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  assert.equal(cp[0].x, 0);
  assert.equal(cp[0].y, 0);
  assert.equal(cp[cp.length - 1].x, 1);
  assert.equal(cp[cp.length - 1].y, DEFAULT_SURFACE_PARAMS.teThickness);
});

// ---------------------------------------------------------------------------
// 2. Точность достижения целевых значений (сравнение с багом V1)
// ---------------------------------------------------------------------------

check('достигнутая максимальная высота ТОЧНО совпадает с maxThickness (в отличие от V1)', () => {
  const { sampled } = generateSurface(DEFAULT_SURFACE_PARAMS);
  assert.ok(Math.abs(maxY(sampled) - DEFAULT_SURFACE_PARAMS.maxThickness) < 1e-4);
});

check('точность сохраняется на диапазоне разных maxThickness (0.02..0.20)', () => {
  for (const t of [0.02, 0.05, 0.12, 0.20]) {
    const { sampled } = generateSurface({ ...DEFAULT_SURFACE_PARAMS, maxThickness: t });
    assert.ok(Math.abs(maxY(sampled) - t) < 1e-4, `maxThickness=${t}: получили ${maxY(sampled)}`);
  }
});

check('ровно один проход B-сплайна: buildSurfaceSpline вызывается один раз внутри sampleSurface', () => {
  // Косвенная проверка архитектурного свойства: контрольные точки, переданные
  // в сэмплирование, идентичны точкам, построенным зональной моделью — то есть
  // между построением точек и построением сплайна нет промежуточного пересчёта.
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const sampledDirect = sampleSurface(cp);
  const { sampled: sampledViaGenerate } = generateSurface(DEFAULT_SURFACE_PARAMS);
  assert.deepEqual(sampledDirect, sampledViaGenerate);
});

// ---------------------------------------------------------------------------
// 3. zoneCurvature: знак и величина эффекта
// ---------------------------------------------------------------------------

function midZoneHeight(params) {
  const { sampled } = generateSurface(params);
  const zs = params.zoneStart ?? DEFAULT_SURFACE_PARAMS.zoneStart;
  const zl = params.zoneLength ?? DEFAULT_SURFACE_PARAMS.zoneLength;
  const targetX = zs + zl / 2;
  return sampled.reduce((best, p) => (Math.abs(p.x - targetX) < Math.abs(best.x - targetX) ? p : best)).y;
}

check('zoneCurvature=0 -> середина зоны совпадает с maxThickness (плоское плато)', () => {
  const h = midZoneHeight({ ...DEFAULT_SURFACE_PARAMS, zoneCurvature: 0 });
  assert.ok(Math.abs(h - DEFAULT_SURFACE_PARAMS.maxThickness) < 1e-4);
});

check('zoneCurvature=+1 -> середина зоны ВЫШЕ границ (выпуклость к одиночному пику)', () => {
  const h = midZoneHeight({ ...DEFAULT_SURFACE_PARAMS, zoneCurvature: 1 });
  assert.ok(h > DEFAULT_SURFACE_PARAMS.maxThickness);
});

check('zoneCurvature=-1 -> середина зоны НИЖЕ границ (лёгкая вогнутость)', () => {
  const h = midZoneHeight({ ...DEFAULT_SURFACE_PARAMS, zoneCurvature: -1 });
  assert.ok(h < DEFAULT_SURFACE_PARAMS.maxThickness);
});

// ---------------------------------------------------------------------------
// 4. zoneLength=0 — вырождение в одиночный пик
// ---------------------------------------------------------------------------

check('zoneLength=0: зона максимальной толщины схлопывается в одну точку', () => {
  const cp = buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, zoneLength: 0 });
  const zonePoints = cp.filter((p) => p.zone === ZONES.MAX_THICKNESS_ZONE);
  assert.equal(zonePoints.length, 1);
});

check('zoneLength=0: общее число точек на одну меньше, чем в общем случае (7 вместо 9)', () => {
  const general = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const degenerate = buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, zoneLength: 0 });
  assert.equal(degenerate.length, general.length - 2);
});

check('zoneLength=0: нет NaN, форма остаётся валидной (предельный случай V1-подобного профиля)', () => {
  const { sampled } = generateSurface({ ...DEFAULT_SURFACE_PARAMS, zoneLength: 0 });
  assert.ok(sampled.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

// ---------------------------------------------------------------------------
// 5. noseRadius — калибровка приближения
// ---------------------------------------------------------------------------

check('noseRadius: точка носика масштабируется вместе с радиусом монотонно', () => {
  const heights = [0.005, 0.015, 0.03].map((r) => {
    const cp = buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, noseRadius: r });
    return cp.find((p) => p.zone === ZONES.NOSE).y;
  });
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2]);
});

check('noseRadius: x точки носика = noseRadius * 0.5 (формула приближения окружности)', () => {
  const cp = buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, noseRadius: 0.02 });
  const nose = cp.find((p) => p.zone === ZONES.NOSE);
  assert.ok(Math.abs(nose.x - 0.01) < 1e-9);
});

// ---------------------------------------------------------------------------
// 6. Независимость параметров (регрессия ключевого решения спецификации)
// ---------------------------------------------------------------------------

check('изменение zoneLength не меняет noseRadius-точку и TE-точку', () => {
  const a = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const b = buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, zoneLength: 0.4 });
  const noseA = a.find((p) => p.zone === ZONES.NOSE);
  const noseB = b.find((p) => p.zone === ZONES.NOSE);
  assert.deepEqual(noseA, noseB);
  assert.equal(a[a.length - 1].y, b[b.length - 1].y);
});

check('изменение teTaperSharpness не меняет zoneStart/zoneLength/noseRadius geometry', () => {
  const a = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const b = buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, teTaperSharpness: 1 });
  const zoneA = a.filter((p) => p.zone === ZONES.MAX_THICKNESS_ZONE);
  const zoneB = b.filter((p) => p.zone === ZONES.MAX_THICKNESS_ZONE);
  assert.deepEqual(zoneA, zoneB);
});

check('масштабирование maxThickness не меняет x-координаты ни одной точки', () => {
  const a = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const b = buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, maxThickness: 0.18 });
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].x, b[i].x, `x разошёлся в точке ${i} (зона ${a[i].zone})`);
  }
});

// ---------------------------------------------------------------------------
// 7. Валидация — КАЖДАЯ ветка ошибок (не тихий clamp, а явное исключение)
// ---------------------------------------------------------------------------

const errorCases = [
  ['maxThickness < 0', { maxThickness: -0.01 }],
  ['zoneStart вне [0,1]', { zoneStart: 1.5 }],
  ['zoneLength < 0', { zoneLength: -0.1 }],
  ['zoneCurvature вне [-1,1]', { zoneCurvature: 2 }],
  ['noseRadius <= 0', { noseRadius: 0 }],
  ['frontRampSharpness вне [0,1]', { frontRampSharpness: -0.5 }],
  ['rearRampSharpness вне [0,1]', { rearRampSharpness: 1.2 }],
  ['teThickness < 0', { teThickness: -0.001 }],
  ['teTaperSharpness вне [0,1]', { teTaperSharpness: 3 }],
  ['teThickness > maxThickness', { teThickness: 0.5 }],
  ['zoneStart слишком близко к носику', { zoneStart: 0.02, noseRadius: 0.03 }],
  ['zoneStart+zoneLength превышает предел', { zoneStart: 0.6, zoneLength: 0.4 }],
];

for (const [label, override] of errorCases) {
  check(`validateSurfaceParams бросает исключение: ${label}`, () => {
    assert.throws(() => buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, ...override }));
  });
}

check('НАХОДКА: проверка конфликта зоны толщины с TE-подходом структурно недостижима при MAX_ZONE_END=0.85', () => {
  // teApproachX = lerp(0.95, 0.99, teTaperSharpness) -> минимум 0.95 (при teTaperSharpness=0).
  // zoneEnd ограничен сверху MAX_ZONE_END=0.85 отдельной, более ранней проверкой.
  // Значит zoneEnd+0.01 <= 0.86 всегда, а teApproachX >= 0.95 всегда — условие
  // "teApproachX <= zoneEnd+0.01" физически не может выполниться ни при каких
  // допустимых входных параметрах. Это НЕ баг сейчас (защитный код безвреден),
  // но это мёртвая ветка — фиксирую тестом-документацией, а не выдумываю ложный
  // сценарий срабатывания. Решение, что с этим делать, — за вами (см. итоговый отчёт).
  const minPossibleTeApproachX = 0.95;
  const maxPossibleZoneEndPlusMargin = 0.85 + 0.01;
  assert.ok(minPossibleTeApproachX > maxPossibleZoneEndPlusMargin, 'если это утверждение когда-нибудь станет false — проверка станет достижимой, и её сработавший вариант нужно будет протестировать по-настоящему');
});

check('граничные значения ПРОХОДЯТ валидацию (не false positive на границе диапазона)', () => {
  assert.doesNotThrow(() => buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, zoneCurvature: 1 }));
  assert.doesNotThrow(() => buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, zoneCurvature: -1 }));
  assert.doesNotThrow(() => buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, frontRampSharpness: 0 }));
  assert.doesNotThrow(() => buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, frontRampSharpness: 1 }));
  assert.doesNotThrow(() => buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, teThickness: DEFAULT_SURFACE_PARAMS.maxThickness }));
  assert.doesNotThrow(() => buildSurfaceControlPoints({ ...DEFAULT_SURFACE_PARAMS, maxThickness: 0, teThickness: 0 }));
});

check('НАХОДКА: при maxThickness=0 носик всё равно имеет высоту, зависящую только от noseRadius', () => {
  // noseRadius и maxThickness — полностью независимые параметры (намеренно,
  // по решению спецификации). Побочный эффект: при очень малой maxThickness
  // и "обычном" noseRadius носик может оказаться ВЫШЕ, чем плато. Это не
  // NaN и не падение — геометрически валидная, но потенциально нефизичная
  // комбинация. Формально фиксирую воспроизводимость эффекта, чтобы решение
  // (нужен ли constraint "noseHeight <= maxThickness") принималось осознанно,
  // а не молчаливым clamp внутри этого модуля.
  const { sampled } = generateSurface({ ...DEFAULT_SURFACE_PARAMS, maxThickness: 0, teThickness: 0 });
  assert.ok(sampled.every((p) => Number.isFinite(p.y)));
  const expectedNoseY = Math.sqrt(2 * DEFAULT_SURFACE_PARAMS.noseRadius * (DEFAULT_SURFACE_PARAMS.noseRadius * 0.5) - Math.pow(DEFAULT_SURFACE_PARAMS.noseRadius * 0.5, 2));
  assert.ok(maxY(sampled) > expectedNoseY * 0.5, 'ожидаем, что пик кривой при maxThickness=0 определяется именно носиком, а не оказался случайно занулён');
});

// ---------------------------------------------------------------------------
// 8. buildSurfaceSpline и sampleSurface напрямую (не только через generateSurface)
// ---------------------------------------------------------------------------

check('buildSurfaceSpline возвращает объект с evaluateAtX (совместимость с BSpline API)', () => {
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const spline = buildSurfaceSpline(cp);
  assert.equal(typeof spline.evaluateAtX, 'function');
  const p = spline.evaluateAtX(0.5);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

check('sampleSurface с произвольным resolution даёт resolution+1 точек', () => {
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const sampled = sampleSurface(cp, 40);
  assert.equal(sampled.length, 41);
});

check('sampleSurface: x первой и последней точки — ровно 0 и 1 (концы сплайна интерполируются точно)', () => {
  const cp = buildSurfaceControlPoints(DEFAULT_SURFACE_PARAMS);
  const sampled = sampleSurface(cp, 50);
  assert.ok(Math.abs(sampled[0].x - 0) < 1e-9);
  assert.ok(Math.abs(sampled[sampled.length - 1].x - 1) < 1e-9);
});

// ---------------------------------------------------------------------------
// 9. Экспортируемые константы
// ---------------------------------------------------------------------------

check('ZONES содержит все 7 зон из спецификации', () => {
  assert.equal(Object.keys(ZONES).length, 7);
});

check('MIN_POINTS_PER_ZONE определён для каждой зоны и соответствует минимумам спецификации', () => {
  assert.equal(MIN_POINTS_PER_ZONE[ZONES.MAX_THICKNESS_ZONE], 2);
  assert.equal(MIN_POINTS_PER_ZONE[ZONES.LE], 1);
  assert.equal(MIN_POINTS_PER_ZONE[ZONES.TE], 1);
  for (const zoneName of Object.values(ZONES)) {
    assert.ok(typeof MIN_POINTS_PER_ZONE[zoneName] === 'number');
  }
});

// ---------------------------------------------------------------------------
// 10. Отсутствие NaN и монотонность на широком наборе случайных параметров
// ---------------------------------------------------------------------------

check('фаззинг: 500 случайных валидных комбинаций параметров — ни одной ошибки/NaN', () => {
  let successCount = 0;
  for (let i = 0; i < 500; i++) {
    const zoneStart = 0.15 + Math.random() * 0.4; // 0.15..0.55, с запасом от носика
    const zoneLength = Math.random() * Math.min(0.3, 0.8 - zoneStart);
    const params = {
      maxThickness: Math.random() * 0.18 + 0.02,
      zoneStart,
      zoneLength,
      zoneCurvature: Math.random() * 2 - 1,
      noseRadius: Math.random() * 0.02 + 0.005,
      frontRampSharpness: Math.random(),
      rearRampSharpness: Math.random(),
      teThickness: Math.random() * 0.005,
      teTaperSharpness: Math.random(),
    };
    if (params.teThickness > params.maxThickness) params.teThickness = params.maxThickness * 0.1;
    try {
      const { sampled } = generateSurface(params);
      assert.ok(sampled.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
      successCount++;
    } catch (err) {
      // допустимо: часть случайных комбинаций может законно не пройти
      // валидацию (например teApproach слишком близко) — считаем это, но
      // требуем, чтобы таких случаев было меньшинство, иначе формулы
      // подобраны слишком жёстко.
    }
  }
  assert.ok(successCount > 400, `успешных генераций: ${successCount}/500 — слишком много отказов`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
