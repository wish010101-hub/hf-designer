// geometry.js — расчёт геометрических характеристик профиля
// по уже посчитанным точкам (верх/низ/камбер).

import { numericDerivative, vecLength } from './math.js';

// Кривизна кривой по массиву точек (конечные разности).
// κ = |x'y'' - y'x''| / (x'^2 + y'^2)^1.5
// Кривизна со знаком (без abs) — нужна для поиска перегибов (смена знака
// кривизны вдоль поверхности), которую |curvature| не может показать.
export function computeSignedCurvature(points) {
  const d1 = numericDerivative(points);
  const d2 = numericDerivative(d1);
  return points.map((_, i) => {
    const { x: xp, y: yp } = d1[i];
    const { x: xpp, y: ypp } = d2[i];
    const denom = Math.pow(xp * xp + yp * yp, 1.5);
    if (denom < 1e-9) return 0;
    return (xp * ypp - yp * xpp) / denom;
  });
}

export function computeCurvature(points) {
  const d1 = numericDerivative(points);
  const d2 = numericDerivative(d1);
  return points.map((_, i) => {
    const { x: xp, y: yp } = d1[i];
    const { x: xpp, y: ypp } = d2[i];
    const denom = Math.pow(xp * xp + yp * yp, 1.5);
    if (denom < 1e-9) return 0;
    return Math.abs(xp * ypp - yp * xpp) / denom;
  });
}

// Площадь замкнутого контура (профиль в масштабе хорды = 1) методом шнурков (shoelace).
// contour — массив точек по периметру (верх от носка к хвосту + низ от хвоста к носку).
export function contourArea(contour) {
  let sum = 0;
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Максимальная толщина и её положение по хорде (разница между верхом и низом
// на одинаковых x, приближённо — по индексам, т.к. верх/низ сэмплированы на
// одной и той же сетке x).
export function maxThickness(upper, lower) {
  let max = 0;
  let atX = 0;
  for (let i = 0; i < upper.length; i++) {
    const t = upper[i].y - lower[i].y;
    if (t > max) {
      max = t;
      atX = upper[i].x;
    }
  }
  return { value: max, atX };
}

export function maxCamber(camber) {
  let max = 0;
  let atX = 0;
  for (const p of camber) {
    if (Math.abs(p.y) > Math.abs(max)) {
      max = p.y;
      atX = p.x;
    }
  }
  return { value: max, atX };
}

// ПРИБЛИЖЁННЫЙ "центр давления": геометрический центроид площади профиля.
// Это НЕ настоящий аэродинамический центр давления (для него нужен расчёт
// распределения давления, например через XFoil/XFLR5) — здесь только
// геометрическая оценка для визуальной ориентации в редакторе.
export function approximateCentroid(upper, lower) {
  const contour = [...upper, ...lower.slice().reverse()];
  let areaSum = 0;
  let cxSum = 0;
  let cySum = 0;
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const cross = a.x * b.y - b.x * a.y;
    areaSum += cross;
    cxSum += (a.x + b.x) * cross;
    cySum += (a.y + b.y) * cross;
  }
  const area = areaSum / 2;
  if (Math.abs(area) < 1e-9) return { x: 0.25, y: 0 };
  return { x: cxSum / (6 * area), y: cySum / (6 * area) };
}

export function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += vecLength({ x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y });
  }
  return len;
}

// Сравнение двух профилей (режим Compare, v1.2). Предполагает одинаковую
// сетку x (все профили в приложении строятся с одним resolution) —
// если длины отличаются, сравнение идёт по min(длина A, длина B).
export function compareProfiles(a, b) {
  const n = Math.min(a.upper.length, b.upper.length);
  let maxThicknessDiff = 0, maxThicknessDiffX = 0;
  let maxCamberDiff = 0, maxCamberDiffX = 0;
  let maxDeviation = 0, maxDeviationX = 0;

  for (let i = 0; i < n; i++) {
    const dT = (a.upper[i].y - a.lower[i].y) - (b.upper[i].y - b.lower[i].y);
    if (Math.abs(dT) > Math.abs(maxThicknessDiff)) {
      maxThicknessDiff = dT;
      maxThicknessDiffX = a.upper[i].x;
    }
    const dC = a.camber[i].y - b.camber[i].y;
    if (Math.abs(dC) > Math.abs(maxCamberDiff)) {
      maxCamberDiff = dC;
      maxCamberDiffX = a.camber[i].x;
    }
    const dev = Math.max(Math.abs(a.upper[i].y - b.upper[i].y), Math.abs(a.lower[i].y - b.lower[i].y));
    if (dev > maxDeviation) {
      maxDeviation = dev;
      maxDeviationX = a.upper[i].x;
    }
  }

  const thicknessPercent = a.stats.maxThickness.value > 0
    ? (Math.abs(a.stats.maxThickness.value - b.stats.maxThickness.value) / a.stats.maxThickness.value) * 100
    : 0;

  return { maxThicknessDiff, maxThicknessDiffX, maxCamberDiff, maxCamberDiffX, maxDeviation, maxDeviationX, thicknessPercent };
}
