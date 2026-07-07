// profile.js — профиль HF. Источник истины — ДВЕ B-сплайн кривые в
// абсолютных координатах профиля: upperCP (верхняя поверхность) и
// lowerCP (нижняя поверхность), обе от x=0 (носок) до x=1 (задняя кромка).
//
// Почему не камбер+полутолщина (как в v1.0): при прямом редактировании
// мышью контрольная точка должна лежать в той же системе координат, что
// и видимая кривая — иначе перетаскивание "точки профиля" визуально не
// совпадает с тем, что реально двигается. С двумя абсолютными кривыми
// это устранено. Линия камбера теперь ПРОИЗВОДНАЯ величина (среднее
// между верхом и низом в каждом x) — только для отображения, не для
// редактирования, как и просит ТЗ (модуль 3: камбер — это слой показа).

import { BSpline } from './spline.js';
import { cosineSpacing, clamp } from './math.js';
import {
  computeCurvature,
  contourArea,
  maxThickness,
  maxCamber,
  approximateCentroid,
} from './geometry.js';

export const PARAM_DEFS = [
  { key: 'thickness', label: 'Толщина профиля', min: 0.04, max: 0.24, step: 0.001, pct: true },
  { key: 'thickPos', label: 'Положение макс. толщины', min: 0.1, max: 0.6, step: 0.01, pct: true },
  { key: 'camber', label: 'Максимальный камбер', min: 0, max: 0.08, step: 0.001, pct: true },
  { key: 'camberPos', label: 'Положение камбера', min: 0.1, max: 0.8, step: 0.01, pct: true },
  { key: 'noseRadius', label: 'Радиус носика', min: 0, max: 1, step: 0.01, pct: false },
  { key: 'upperShape', label: 'Форма верхней поверхности', min: 0.5, max: 1.5, step: 0.01, pct: false },
  { key: 'lowerShape', label: 'Форма нижней поверхности', min: 0.5, max: 1.5, step: 0.01, pct: false },
  { key: 'teThickness', label: 'Толщина задней кромки', min: 0, max: 0.02, step: 0.0005, pct: true },
  { key: 'smoothness', label: 'Плавность кривизны', min: 0, max: 1, step: 0.01, pct: false },
];

export const DEFAULT_PARAMS = {
  thickness: 0.12,
  thickPos: 0.35,
  camber: 0.02,
  camberPos: 0.4,
  noseRadius: 0.5,
  upperShape: 1.0,
  lowerShape: 1.0,
  teThickness: 0.002,
  smoothness: 0.5,
};

const MIN_CP = 4; // минимум точек для кубического сплайна (degree 3 => 4 точки)
const STATIONS_X = [0, 0.12, 0.35, 0.7, 1]; // фиксированная сетка для генерации начальной формы

// Вспомогательный генератор НАЧАЛЬНОЙ формы по скалярным параметрам —
// внутренне считает камбер+полутолщину по старой схеме только для того,
// чтобы получить стартовые (x,y) точки для upperCP/lowerCP. После этого
// параметры больше не используются — точки живут своей жизнью.
function seedSurfaceControlPoints(params) {
  const p = clamp(params.camberPos, 0.05, 0.95);
  const camberCP = [
    { x: 0, y: 0 },
    { x: p * 0.5, y: params.camber * 0.7 },
    { x: p, y: params.camber },
    { x: p + (1 - p) * 0.5, y: params.camber * 0.35 },
    { x: 1, y: 0 },
  ];
  const halfCP = (shapeFactor) => {
    const half = params.thickness / 2;
    const noseX = 0.04 + 0.06 * clamp(params.smoothness, 0, 1);
    const noseY = half * clamp(params.noseRadius, 0, 1) * 0.55;
    const tp = clamp(params.thickPos, noseX + 0.05, 0.9);
    return [
      { x: 0, y: 0 },
      { x: noseX, y: noseY },
      { x: tp, y: half * shapeFactor },
      { x: tp + (1 - tp) * 0.6, y: half * shapeFactor * 0.45 + (params.teThickness / 2) * 0.5 },
      { x: 1, y: params.teThickness / 2 },
    ];
  };

  const camberSpline = new BSpline(camberCP, 3);
  const upperHalfSpline = new BSpline(halfCP(params.upperShape), 3);
  const lowerHalfSpline = new BSpline(halfCP(params.lowerShape), 3);

  const upperCP = STATIONS_X.map((x) => ({
    x,
    y: camberSpline.evaluateAtX(x).y + Math.max(0, upperHalfSpline.evaluateAtX(x).y),
  }));
  const lowerCP = STATIONS_X.map((x) => ({
    x,
    y: camberSpline.evaluateAtX(x).y - Math.max(0, lowerHalfSpline.evaluateAtX(x).y),
  }));
  return { upperCP, lowerCP };
}

export class HFProfile {
  constructor(name = 'profile') {
    this.name = name;
    this.resolution = 120;
    this.generateFromParams(DEFAULT_PARAMS);
  }

  generateFromParams(params) {
    const { upperCP, lowerCP } = seedSurfaceControlPoints({ ...DEFAULT_PARAMS, ...params });
    this.upperCP = upperCP;
    this.lowerCP = lowerCP;
    this.rebuild();
  }

  _cpArray(curve) {
    if (curve === 'upper') return this.upperCP;
    if (curve === 'lower') return this.lowerCP;
    throw new Error(`Неизвестная кривая: ${curve} (допустимо: upper, lower)`);
  }

  // x у носка (индекс 0) и задней кромки (последний индекс) закреплены —
  // хорда всегда остаётся ровно [0,1]; двигать эти точки можно только по y.
  moveControlPoint(curve, index, x, y) {
    const cp = this._cpArray(curve);
    if (!cp[index]) return;
    const isEndpoint = index === 0 || index === cp.length - 1;
    cp[index] = { x: isEndpoint ? cp[index].x : clamp(x, 0, 1), y };
    this.rebuild();
  }

  addControlPoint(curve, afterIndex) {
    const cp = this._cpArray(curve);
    if (afterIndex < 0 || afterIndex >= cp.length - 1) return null;
    const a = cp[afterIndex];
    const b = cp[afterIndex + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    cp.splice(afterIndex + 1, 0, mid);
    this.rebuild();
    return afterIndex + 1;
  }

  removeControlPoint(curve, index) {
    const cp = this._cpArray(curve);
    if (index === 0 || index === cp.length - 1) return false;
    if (cp.length <= MIN_CP) return false;
    cp.splice(index, 1);
    this.rebuild();
    return true;
  }

  rebuild() {
    const degU = Math.min(3, this.upperCP.length - 1);
    const degL = Math.min(3, this.lowerCP.length - 1);
    const upperSpline = new BSpline(this.upperCP, degU);
    const lowerSpline = new BSpline(this.lowerCP, degL);

    const xs = cosineSpacing(this.resolution);
    this.upper = xs.map((x) => upperSpline.evaluateAtX(x));
    this.lower = xs.map((x) => lowerSpline.evaluateAtX(x));
    // Камбер — производная величина (среднее верх/низ), только для показа.
    this.camber = xs.map((x, i) => ({ x, y: (this.upper[i].y + this.lower[i].y) / 2 }));

    this._computeStats();
  }

  _computeStats() {
    const contour = [...this.upper, ...this.lower.slice().reverse()];
    this.curvatureUpper = computeCurvature(this.upper);
    this.curvatureLower = computeCurvature(this.lower);
    this.stats = {
      area: contourArea(contour),
      maxThickness: maxThickness(this.upper, this.lower),
      maxCamber: maxCamber(this.camber),
      centroid: approximateCentroid(this.upper, this.lower),
    };
  }

  getContour() {
    const upperRev = this.upper.slice().reverse();
    const lowerRest = this.lower.slice(1);
    return [...upperRev, ...lowerRest];
  }

  toJSON() {
    return {
      type: 'HFProfile',
      name: this.name,
      resolution: this.resolution,
      controlPoints: { upper: this.upperCP, lower: this.lowerCP },
    };
  }

  static fromJSON(json) {
    const profile = Object.create(HFProfile.prototype);
    profile.name = json.name || 'profile';
    profile.resolution = json.resolution || 120;
    if (json.controlPoints && json.controlPoints.upper) {
      profile.upperCP = json.controlPoints.upper;
      profile.lowerCP = json.controlPoints.lower;
      profile.rebuild();
    } else if (json.params) {
      // Совместимость со старыми проектами v1.0.
      profile.generateFromParams({ ...DEFAULT_PARAMS, ...json.params });
    } else {
      profile.generateFromParams(DEFAULT_PARAMS);
    }
    return profile;
  }
}
