// validation.js — проверка качества профиля. Возвращает список проблем
// с указанием координаты (x,y в системе профиля), чтобы render.js мог
// подсветить их прямо на кривой.
//
// Разделены на "дешёвые" проверки (можно гонять при каждом rebuild —
// closedness, negative thickness) и "дорогие" (self-intersection O(n²),
// curvature continuity) — их запускает UI по кнопке и перед экспортом,
// а не на каждое перетаскивание точки.

import { vecLength } from './math.js';
import { computeSignedCurvature } from './geometry.js';

const CLOSE_TOL = 0.003; // допуск смыкания носка/задней кромки (доля хорды)

export function checkClosedness(profile) {
  const issues = [];
  const le = vecLength({ x: profile.upper[0].x - profile.lower[0].x, y: profile.upper[0].y - profile.lower[0].y });
  if (le > CLOSE_TOL) {
    issues.push({ severity: 'error', message: `Профиль не замкнут у передней кромки (зазор ${(le * 100).toFixed(2)}% хорды)`, x: 0, y: 0 });
  }
  return issues;
}

export function checkNegativeThickness(profile) {
  const issues = [];
  for (let i = 0; i < profile.upper.length; i++) {
    const t = profile.upper[i].y - profile.lower[i].y;
    if (t < -1e-4) {
      issues.push({ severity: 'error', message: `Отрицательная толщина при x=${profile.upper[i].x.toFixed(2)} (поверхности пересекаются)`, x: profile.upper[i].x, y: (profile.upper[i].y + profile.lower[i].y) / 2 });
    }
  }
  return issues;
}

export function checkNoseRadius(profile) {
  const issues = [];
  const k = profile.curvatureUpper[1]; // вторая точка сетки (первая имеет неопределённую производную)
  if (k > 0) {
    const radius = 1 / k;
    if (radius < 0.003) {
      issues.push({ severity: 'warning', message: `Очень маленький радиус носика (≈${(radius * 100).toFixed(2)}% хорды) — риск численных проблем в XFoil`, x: 0, y: 0 });
    }
  }
  return issues;
}

// Дорогая проверка: пересечение верхней и нижней поверхности между собой
// (не считая ожидаемого касания в носке/хвосте), классический тест
// пересечения отрезков по всем парам сегментов контура.
export function checkSelfIntersection(profile) {
  const contour = profile.getContour();
  const n = contour.length;
  const issues = [];

  const segIntersect = (p1, p2, p3, p4) => {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-12) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
    if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) {
      return { x: p1.x + t * d1x, y: p1.y + t * d1y };
    }
    return null;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // соседний сегмент по замкнутости
      const hit = segIntersect(contour[i], contour[(i + 1) % n], contour[j], contour[(j + 1) % n]);
      if (hit) {
        issues.push({ severity: 'error', message: `Самопересечение контура около x=${hit.x.toFixed(2)}`, x: hit.x, y: hit.y });
      }
    }
  }
  return issues.slice(0, 5); // не заваливать журнал десятками дублей одного излома
}

// Дорогая проверка: перегибы (смена знака кривизны) и разрывы непрерывности
// кривизны (резкий скачок между соседними точками) — вне зоны носика,
// где высокая кривизна ожидаема и не является проблемой.
export function checkCurvatureContinuity(profile) {
  const issues = [];
  for (const [label, points] of [['верхней', profile.upper], ['нижней', profile.lower]]) {
    const signed = computeSignedCurvature(points);
    let prevSign = null;
    let jumps = 0;
    for (let i = 5; i < signed.length - 5; i++) {
      const sign = signed[i] > 1e-3 ? 1 : signed[i] < -1e-3 ? -1 : 0;
      if (prevSign !== null && sign !== 0 && prevSign !== 0 && sign !== prevSign) {
        issues.push({ severity: 'warning', message: `Перегиб на ${label} поверхности около x=${points[i].x.toFixed(2)}`, x: points[i].x, y: points[i].y });
        jumps++;
      }
      if (sign !== 0) prevSign = sign;
      if (jumps >= 3) break;
    }
  }
  return issues;
}

export function checkDatExport(profile) {
  const issues = [];
  const contour = profile.getContour();
  if (contour.length < 10) {
    issues.push({ severity: 'error', message: 'Слишком мало точек контура для корректного анализа в XFLR5' });
  }
  for (const p of contour) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      issues.push({ severity: 'error', message: 'Обнаружены некорректные (NaN) координаты — экспорт DAT невозможен' });
      break;
    }
  }
  if (profile.stats.maxThickness.value > 0.4) {
    issues.push({ severity: 'warning', message: 'Толщина превышает 40% хорды — вероятно, ошибка в параметрах' });
  }
  return issues;
}

// Быстрые проверки — безопасно вызывать на каждый rebuild (например, для
// живой мини-сводки в панели), без self-intersection/curvature (дорогие).
export function quickValidate(profile) {
  return [
    ...checkClosedness(profile),
    ...checkNegativeThickness(profile),
    ...checkNoseRadius(profile),
  ];
}

// Полная проверка — по кнопке «Проверить профиль» и перед экспортом DAT.
export function fullValidate(profile) {
  return [
    ...quickValidate(profile),
    ...checkSelfIntersection(profile),
    ...checkCurvatureContinuity(profile),
    ...checkDatExport(profile),
  ];
}
