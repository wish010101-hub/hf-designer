// spline.js — не-рациональный B-сплайн (кубический по умолчанию) с
// зажатым (clamped) равномерным вектором узлов.
//
// Это ядро для построения профилей HF: вместо аналитической формулы
// NACA, форма кривой определяется контрольными точками, как в CAD.
//
// Ограничение версии 1.0: веса контрольных точек не поддерживаются
// (обычный B-сплайн, а не полный NURBS). Добавление весов — с версии 2.0,
// когда понадобится более точный контроль формы носика.

export class BSpline {
  /**
   * @param {{x:number,y:number}[]} controlPoints
   * @param {number} degree - степень сплайна (по умолчанию 3, кубический)
   */
  constructor(controlPoints, degree = 3) {
    if (controlPoints.length < degree + 1) {
      throw new Error('Недостаточно контрольных точек для заданной степени сплайна');
    }
    this.controlPoints = controlPoints;
    this.degree = degree;
    this.knots = this._buildClampedKnotVector();
  }

  // Зажатый равномерный вектор узлов: кратность (degree+1) на концах,
  // гарантирует прохождение кривой через первую и последнюю точки.
  _buildClampedKnotVector() {
    const n = this.controlPoints.length - 1;
    const p = this.degree;
    const knots = [];
    for (let i = 0; i <= p; i++) knots.push(0);
    const innerCount = n - p;
    for (let i = 1; i <= innerCount; i++) {
      knots.push(i / (innerCount + 1));
    }
    for (let i = 0; i <= p; i++) knots.push(1);
    return knots;
  }

  get maxParam() {
    return this.knots[this.knots.length - 1];
  }

  // Алгоритм Де Бура: вычисление точки кривой при параметре t
  evaluate(t) {
    const p = this.degree;
    const knots = this.knots;
    const cp = this.controlPoints;
    const n = cp.length - 1;

    t = Math.min(Math.max(t, knots[p]), knots[knots.length - p - 1]);

    let k = p;
    while (k < n && t >= knots[k + 1]) k++;

    const d = [];
    for (let j = 0; j <= p; j++) {
      d.push({ ...cp[k - p + j] });
    }

    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = k - p + j;
        const denom = knots[i + p - r + 1] - knots[i];
        const alpha = denom === 0 ? 0 : (t - knots[i]) / denom;
        d[j] = {
          x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
          y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
        };
      }
    }
    return d[p];
  }

  // Точка при параметре x методом бисекции по x(t).
  // Работает корректно, если x(t) монотонно возрастает вдоль кривой —
  // это гарантируется тем, как profile.js строит контрольные точки.
  evaluateAtX(targetX, iterations = 40) {
    let tLo = this.knots[this.degree];
    let tHi = this.knots[this.knots.length - this.degree - 1];
    let lo = this.evaluate(tLo);
    let hi = this.evaluate(tHi);
    if (targetX <= lo.x) return lo;
    if (targetX >= hi.x) return hi;

    for (let i = 0; i < iterations; i++) {
      const tMid = (tLo + tHi) / 2;
      const pMid = this.evaluate(tMid);
      if (pMid.x < targetX) {
        tLo = tMid;
      } else {
        tHi = tMid;
      }
    }
    return this.evaluate((tLo + tHi) / 2);
  }

  sample(nPoints) {
    const out = [];
    const tMax = this.maxParam;
    for (let i = 0; i <= nPoints; i++) {
      out.push(this.evaluate((tMax * i) / nPoints));
    }
    return out;
  }
}
