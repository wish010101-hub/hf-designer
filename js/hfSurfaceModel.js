// hfSurfaceModel.js — Generator V2, Этап 1.
//
// ЧИСТО МАТЕМАТИЧЕСКИЙ модуль одной поверхности гидрофойла. Не знает,
// верхняя это поверхность или нижняя (это решает вызывающий код на
// Этапе 2 — знаком высоты). Не знает про камбер, про вторую поверхность,
// про UI, про редактор. Единственная зависимость — BSpline из spline.js
// (используется как есть, без изменений — тот же паттерн переиспользования,
// что уже применён в wingPlanform.js).
//
// ГЛАВНОЕ АРХИТЕКТУРНОЕ ПРАВИЛО ЭТОГО МОДУЛЯ: ровно один проход
// построения B-сплайна. Контрольные точки строятся один раз по зональным
// формулам (buildSurfaceControlPoints) и НИКОГДА не пересэмплируются в
// новый набор точек для повторной подгонки — именно эта повторная
// подгонка была причиной бага "12% номинал -> 6.6% факт" в V1.
// sampleSurface() лишь ЧИТАЕТ уже построенную кривую в много точек для
// показа/тестов — это не второй проход, а просто чтение результата первого.

import { BSpline } from './spline.js';

// Локальные хелперы — модуль намеренно не импортирует math.js, чтобы
// оставаться полностью независимым (тот же принцип, что и в wingPlanform.js,
// где тоже есть собственный локальный lerp вместо общего импорта).
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export const ZONES = {
  LE: 'LE',
  NOSE: 'Nose',
  FRONT_SHOULDER: 'Front Shoulder',
  MAX_THICKNESS_ZONE: 'Maximum Thickness Zone',
  REAR_SHOULDER: 'Rear Shoulder',
  TE_APPROACH: 'TE Approach',
  TE: 'TE',
};

// Минимум точек на зону в ОБЩЕМ случае (zoneLength > 0). Специальный
// случай zoneLength = 0 — см. комментарий в buildSurfaceControlPoints.
export const MIN_POINTS_PER_ZONE = {
  [ZONES.LE]: 1,
  [ZONES.NOSE]: 1,
  [ZONES.FRONT_SHOULDER]: 1,
  [ZONES.MAX_THICKNESS_ZONE]: 2,
  [ZONES.REAR_SHOULDER]: 1,
  [ZONES.TE_APPROACH]: 1,
  [ZONES.TE]: 1,
};

export const DEFAULT_SURFACE_PARAMS = {
  maxThickness: 0.06,
  zoneStart: 0.30,
  zoneLength: 0.15,
  zoneCurvature: 0,
  noseRadius: 0.015,
  frontRampSharpness: 0.5,
  rearRampSharpness: 0.5,
  teThickness: 0.0008,
  teTaperSharpness: 0.5,
};

// Максимальная доля хорды, которую разрешено занимать зоне максимальной
// толщины (zoneStart + zoneLength) — оставляет обязательный запас под
// заднее плечо, подход к кромке и саму кромку. Нарушение — явная ошибка,
// не молчаливый clamp (см. требование 7 в задании на Generator V2).
const MAX_ZONE_END = 0.85;

function validateSurfaceParams(p) {
  const errors = [];

  if (!(p.maxThickness >= 0)) errors.push('maxThickness должен быть >= 0');
  if (!(p.zoneStart >= 0 && p.zoneStart <= 1)) errors.push('zoneStart должен быть в диапазоне [0, 1]');
  if (!(p.zoneLength >= 0)) errors.push('zoneLength должен быть >= 0');
  if (!(p.zoneCurvature >= -1 && p.zoneCurvature <= 1)) errors.push('zoneCurvature должен быть в диапазоне [-1, 1]');
  if (!(p.noseRadius > 0)) errors.push('noseRadius должен быть > 0');
  if (!(p.frontRampSharpness >= 0 && p.frontRampSharpness <= 1)) errors.push('frontRampSharpness должен быть в диапазоне [0, 1]');
  if (!(p.rearRampSharpness >= 0 && p.rearRampSharpness <= 1)) errors.push('rearRampSharpness должен быть в диапазоне [0, 1]');
  if (!(p.teThickness >= 0)) errors.push('teThickness должен быть >= 0');
  if (!(p.teTaperSharpness >= 0 && p.teTaperSharpness <= 1)) errors.push('teTaperSharpness должен быть в диапазоне [0, 1]');

  if (errors.length > 0) {
    throw new Error(`hfSurfaceModel: некорректные параметры: ${errors.join('; ')}`);
  }

  if (p.teThickness > p.maxThickness) {
    throw new Error(`hfSurfaceModel: teThickness (${p.teThickness}) не может превышать maxThickness (${p.maxThickness})`);
  }

  const noseX = p.noseRadius * 0.5;
  if (p.zoneStart <= noseX + 0.02) {
    throw new Error(`hfSurfaceModel: zoneStart (${p.zoneStart}) слишком близко к носику (носик занимает до x=${(noseX).toFixed(4)}) — увеличьте zoneStart или уменьшите noseRadius`);
  }

  const zoneEnd = p.zoneStart + p.zoneLength;
  if (zoneEnd > MAX_ZONE_END) {
    throw new Error(`hfSurfaceModel: zoneStart + zoneLength = ${zoneEnd.toFixed(3)} превышает допустимый предел ${MAX_ZONE_END} — не остаётся места под заднее плечо, подход к кромке и саму кромку. Уменьшите zoneStart и/или zoneLength.`);
  }
}

// Приближение радиуса кривизны носика: точка на параболе, касательной
// к окружности радиуса noseRadius в начале координат (стандартное для
// CAD приближение окружности вблизи точки касания: y ~= sqrt(2*r*x - x^2)
// при малых x). Это калиброванное приближение, а не условный множитель,
// как было в V1.
function noseControlPoint(noseRadius) {
  const noseX = noseRadius * 0.5;
  const noseY = Math.sqrt(Math.max(0, 2 * noseRadius * noseX - noseX * noseX));
  return { x: noseX, y: noseY, zone: ZONES.NOSE };
}

// Строит контрольные точки ОДНОЙ поверхности по зональной модели.
// Возвращает точки с меткой зоны-источника (см. раздел 2 спецификации).
// Ровно один набор точек, без какой-либо промежуточной подгонки сплайна
// внутри этой функции — сам сплайн строится отдельно, в buildSurfaceSpline.
export function buildSurfaceControlPoints(params) {
  const p = { ...DEFAULT_SURFACE_PARAMS, ...params };
  validateSurfaceParams(p);

  const points = [];
  points.push({ x: 0, y: 0, zone: ZONES.LE });

  const nose = noseControlPoint(p.noseRadius);
  points.push(nose);

  const zoneEnd = p.zoneStart + p.zoneLength;

  // Переднее плечо: скорость набора толщины от носика до начала зоны.
  // sharpness=0 -> точка на полпути и на трети высоты (плавный набор);
  // sharpness=1 -> точка близко к zoneStart и почти на полной высоте
  // (резкий набор).
  const frontShoulderX = lerp(nose.x, p.zoneStart, lerp(0.5, 0.9, p.frontRampSharpness));
  const frontShoulderY = p.maxThickness * lerp(0.35, 0.85, p.frontRampSharpness);
  points.push({ x: frontShoulderX, y: frontShoulderY, zone: ZONES.FRONT_SHOULDER });

  // Зона максимальной толщины. Особый случай zoneLength=0 (или очень
  // близко к нему) — вырождается в ОДНУ точку (классический одиночный
  // пик, предельный случай старой модели V1). В общем случае — три точки
  // (начало/середина/конец): середина нужна, чтобы характер зоны
  // (zoneCurvature) был независим от её длины и положения — двух точек
  // для этого недостаточно, они могут задать только сам отрезок, но не
  // его "выпуклость/вогнутость". Согласно спецификации это осознанное
  // расширение минимума (2 точки), а не нарушение — "количество внутренних
  // точек в зоне не ограничено".
  const DEGENERATE_EPS = 1e-6;
  if (p.zoneLength < DEGENERATE_EPS) {
    points.push({ x: p.zoneStart, y: p.maxThickness, zone: ZONES.MAX_THICKNESS_ZONE });
  } else {
    const midX = p.zoneStart + p.zoneLength / 2;
    // curvature > 0 -> середина ВЫШЕ границ зоны (профиль зоны выпуклый,
    //   стремится к одиночному пику при curvature -> 1);
    // curvature = 0 -> середина ТОЧНО на высоте границ (плоское плато);
    // curvature < 0 -> середина НИЖЕ границ (лёгкая вогнутость).
    const midY = p.maxThickness * (1 + p.zoneCurvature * 0.12);
    points.push({ x: p.zoneStart, y: p.maxThickness, zone: ZONES.MAX_THICKNESS_ZONE });
    points.push({ x: midX, y: midY, zone: ZONES.MAX_THICKNESS_ZONE });
    points.push({ x: zoneEnd, y: p.maxThickness, zone: ZONES.MAX_THICKNESS_ZONE });
  }

  // Заднее плечо и подход к задней кромке — фиксированный диапазон
  // положения относительно задней кромки (не относительно zoneEnd),
  // чтобы длина/положение зоны толщины не влияли скрыто на форму TE-зоны.
  const teApproachX = lerp(0.95, 0.99, p.teTaperSharpness);
  if (teApproachX <= zoneEnd + 0.01) {
    throw new Error(`hfSurfaceModel: зона максимальной толщины заканчивается на x=${zoneEnd.toFixed(3)}, слишком близко к зоне подхода к кромке (x=${teApproachX.toFixed(3)}) — уменьшите zoneStart/zoneLength.`);
  }

  const rearShoulderX = zoneEnd + (teApproachX - zoneEnd) * lerp(0.5, 0.1, p.rearRampSharpness);
  const rearShoulderY = p.maxThickness * lerp(0.35, 0.85, p.rearRampSharpness);
  points.push({ x: rearShoulderX, y: rearShoulderY, zone: ZONES.REAR_SHOULDER });

  const teApproachY = lerp(p.teThickness * 3, p.teThickness * 1.1, p.teTaperSharpness);
  points.push({ x: teApproachX, y: Math.max(teApproachY, p.teThickness), zone: ZONES.TE_APPROACH });

  points.push({ x: 1, y: p.teThickness, zone: ZONES.TE });

  for (let i = 1; i < points.length; i++) {
    if (points[i].x <= points[i - 1].x) {
      throw new Error(`hfSurfaceModel: нарушена монотонность x контрольных точек между зонами "${points[i - 1].zone}" (x=${points[i - 1].x.toFixed(4)}) и "${points[i].zone}" (x=${points[i].x.toFixed(4)}) при данных параметрах.`);
    }
  }

  return points;
}

// Строит B-сплайн по уже готовым контрольным точкам. ЭТО и есть тот
// единственный проход построения B-сплайна, который допускает архитектура
// Generator V2 для одной поверхности.
export function buildSurfaceSpline(controlPoints) {
  const degree = Math.min(3, controlPoints.length - 1);
  return new BSpline(controlPoints, degree);
}

// Сэмплирует уже построенный (buildSurfaceSpline) сплайн в resolution+1
// точках с косинусным распределением (больше точек у носика и кромки,
// где кривизна выше). Это ЧТЕНИЕ результата одного прохода, а не
// повторная подгonka — новых контрольных точек здесь не создаётся.
export function sampleSurface(controlPoints, resolution = 120) {
  const spline = buildSurfaceSpline(controlPoints);
  const out = [];
  for (let i = 0; i <= resolution; i++) {
    const beta = (Math.PI * i) / resolution;
    const x = (1 - Math.cos(beta)) / 2;
    out.push(spline.evaluateAtX(x));
  }
  return out;
}

// Основная точка входа для одной поверхности: параметры -> контрольные
// точки -> (по требованию) сэмплированная кривая. Соответствует схеме
// "параметры -> контрольные точки -> B-spline -> готовая поверхность"
// без каких-либо дополнительных проходов между шагами.
export function generateSurface(params, resolution = 120) {
  const controlPoints = buildSurfaceControlPoints(params);
  const sampled = sampleSurface(controlPoints, resolution);
  return { controlPoints, sampled };
}
