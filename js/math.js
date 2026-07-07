// math.js — базовые векторные и числовые утилиты
// Используются spline.js и geometry.js для вычислений без внешних библиотек.

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecScale(a, s) {
  return { x: a.x * s, y: a.y * s };
}

export function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecLength(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function vecNormalize(a) {
  const len = vecLength(a);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

// Перпендикуляр к вектору (поворот на 90°, против часовой стрелки)
export function vecPerp(a) {
  return { x: -a.y, y: a.x };
}

// Косинусное распределение параметра t в [0,1] — даёт больше точек
// у передней и задней кромки профиля, где кривизна выше.
export function cosineSpacing(n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const beta = (Math.PI * i) / n;
    out.push((1 - Math.cos(beta)) / 2);
  }
  return out;
}

// Простое численное дифференцирование по массиву точек (центральные разности)
export function numericDerivative(points) {
  const d = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    d.push(dx === 0 ? { x: 0, y: 0 } : { x: dx, y: dy });
  }
  return d;
}
