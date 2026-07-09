// wingPlanform.js — ЧИСТО МАТЕМАТИЧЕСКИЙ модуль (v1.3). Никакого DOM,
// Canvas, HTML — только вычисления геометрии планформы (вид сверху) и её
// сериализация в DXF/CSV. НЕ подключён к приложению.
//
// Единственная зависимость — BSpline из spline.js (переиспользование
// существующего кода, а не изменение его), нужен для режима "blended".
//
// ВАЖНОЕ ДОПУЩЕНИЕ (см. пояснение в чате): span/rootChord/tipChord/mode
// уже полностью определяют геометрию — параметр area в этом случае
// избыточен как ВХОДНОЙ драйвер формы. Здесь area на входе трактуется
// как справочное/целевое значение (просто сохраняется в out.targetArea),
// а out.area в результате — всегда РЕАЛЬНО ПОСЧИТАННАЯ площадь через
// calculateArea(). Если позже понадобится обратная логика (масштабировать
// хорды под заданную area) — это отдельная функция, сюда не добавлял,
// чтобы не гадать и не переусложнять v1.3.

import { BSpline } from './spline.js';

const DEFAULT_SECTION_COUNT = 21; // не было явно в ТЗ как вход — минимально
                                    // необходимое добавление, иначе неоткуда
                                    // взять дискретные stations[] для вывода.

// ---------- распределение хорды по доле полуразмаха frac (0..1) ----------

function chordLinear(frac, rootChord, tipChord) {
  return rootChord + (tipChord - rootChord) * frac;
}

function chordElliptic(frac, rootChord, tipChord) {
  // Классическая эллиптическая формула c(y) = c_root * sqrt(1 - frac^2),
  // но с tipChord как нижним порогом (не 0) — нулевая хорда на кончике
  // физически нереалистична и хрупка в производстве.
  const k = Math.sqrt(Math.max(0, 1 - frac * frac));
  return tipChord + (rootChord - tipChord) * k;
}

// "Blended": современная форма — хорда держится ближе к корневой дольше,
// затем плавно (без изломов) переходит к законцовке через B-сплайн.
// Строится B-сплайном (не ломаной), как явно требует ТЗ.
function makeBlendedSpline(rootChord, tipChord) {
  const cp = [
    { x: 0, y: rootChord },
    { x: 0.55, y: rootChord - (rootChord - tipChord) * 0.35 },
    { x: 0.85, y: tipChord + (rootChord - tipChord) * 0.18 },
    { x: 1, y: tipChord },
  ];
  return new BSpline(cp, Math.min(3, cp.length - 1));
}

function chordAt(frac, mode, rootChord, tipChord, blendedSpline) {
  if (mode === 'elliptic') return chordElliptic(frac, rootChord, tipChord);
  if (mode === 'blended') return blendedSpline.evaluateAtX(frac).y;
  return chordLinear(frac, rootChord, tipChord); // 'linear' по умолчанию
}

// Стреловидность: линейное распределение сдвига носка вдоль размаха —
// в ТЗ задан один скаляр sweep (мм на кончике), распределение по размаху
// не уточнено, поэтому взято простое линейное нарастание от 0 до sweep.
function sweepAt(frac, sweep) {
  return sweep * frac;
}

// ---------------------------- основная функция ----------------------------

export function generatePlanform(params) {
  const {
    span,
    area = null,       // целевое/справочное значение — см. пояснение выше
    rootChord,
    tipChord,
    sweep = 0,
    dihedral = 0,       // сохранено, пока не используется (как просили)
    washout = 0,        // сохранено, пока не используется (как просили)
    mode = 'linear',    // 'linear' | 'elliptic' | 'blended'
    sectionCount = DEFAULT_SECTION_COUNT,
  } = params;

  const halfSpan = span / 2;
  const blendedSpline = mode === 'blended' ? makeBlendedSpline(rootChord, tipChord) : null;

  const stations = [];
  for (let i = 0; i < sectionCount; i++) {
    const frac = sectionCount === 1 ? 0 : i / (sectionCount - 1);
    stations.push({
      y: frac * halfSpan,
      chord: chordAt(frac, mode, rootChord, tipChord, blendedSpline),
    });
  }

  // leadingEdge/trailingEdge — более мелкая сетка (для гладкого контура
  // и экспорта), не привязана к разрешению stations.
  const N = 60;
  const leadingEdge = [];
  const trailingEdge = [];
  for (let i = 0; i <= N; i++) {
    const frac = i / N;
    const y = frac * halfSpan;
    const leX = sweepAt(frac, sweep);
    const chord = chordAt(frac, mode, rootChord, tipChord, blendedSpline);
    leadingEdge.push({ y, x: leX });
    trailingEdge.push({ y, x: leX + chord });
  }

  const areaMM2 = calculateArea(stations);
  const out = {
    span,
    targetArea: area,
    area: areaMM2 / 100, // см², как в примере из ТЗ
    areaMM2,
    rootChord,
    tipChord,
    sweep,
    dihedral,
    washout,
    mode,
    aspectRatio: calculateAspectRatio(span, areaMM2),
    mac: calculateMAC(stations, areaMM2),
    stations,
    leadingEdge,
    trailingEdge,
  };
  return out;
}

export function generateLinearWing(params) {
  return generatePlanform({ ...params, mode: 'linear' });
}
export function generateEllipticWing(params) {
  return generatePlanform({ ...params, mode: 'elliptic' });
}
export function generateBlendedWing(params) {
  return generatePlanform({ ...params, mode: 'blended' });
}

// ---------------------------- расчётные функции ----------------------------

// Площадь ОДНОЙ консоли интегрированием по трапециям, ×2 — площадь всего
// крыла (мм²). stations должны быть по полуразмаху (y от 0 до span/2).
export function calculateArea(stations) {
  let halfArea = 0;
  for (let i = 1; i < stations.length; i++) {
    const dy = stations[i].y - stations[i - 1].y;
    halfArea += ((stations[i].chord + stations[i - 1].chord) / 2) * dy;
  }
  return halfArea * 2;
}

// AR = b² / S (стандартная формула удлинения крыла).
export function calculateAspectRatio(span, areaMM2) {
  return (span * span) / areaMM2;
}

// Средняя аэродинамическая хорда (MAC), точная формула:
// MAC = (2/S) * ∫(0..b/2) c(y)^2 dy  — интеграл по трапециям на station-сетке.
export function calculateMAC(stations, areaMM2) {
  let integral = 0;
  for (let i = 1; i < stations.length; i++) {
    const dy = stations[i].y - stations[i - 1].y;
    const c1sq = stations[i - 1].chord * stations[i - 1].chord;
    const c2sq = stations[i].chord * stations[i].chord;
    integral += ((c1sq + c2sq) / 2) * dy;
  }
  return (2 / areaMM2) * integral;
}

// ---------------------------- экспорт DXF / CSV ----------------------------

// Полный контур крыла (обе консоли, зеркально) — замкнутый полигон
// leadingEdge (корень->кончик) + trailingEdge в обратном порядке,
// зеркально отражённый на другую сторону. Минимальный валидный DXF R12,
// сущность POLYLINE (тот же формат, что и в export.js, но реализован
// здесь самостоятельно — модуль не должен зависеть от export.js).
export function buildPlanformDXF(planform) {
  const right = [...planform.leadingEdge, ...planform.trailingEdge.slice().reverse()];
  const left = right.map((p) => ({ x: p.x, y: -p.y })).reverse();
  const contour = [...right, ...left];

  const lines = ['0', 'SECTION', '2', 'ENTITIES', '0', 'POLYLINE', '8', '0', '66', '1', '70', '1'];
  for (const p of contour) {
    lines.push('0', 'VERTEX', '8', '0', '10', p.x.toFixed(3), '20', p.y.toFixed(3));
  }
  lines.push('0', 'SEQEND', '0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function buildPlanformCSV(planform) {
  const rows = ['station,y_mm,chord_mm'];
  planform.stations.forEach((s, i) => {
    rows.push(`${i},${s.y.toFixed(2)},${s.chord.toFixed(2)}`);
  });
  return rows.join('\n');
}
