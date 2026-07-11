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

// HF-U12 — универсальный стартовый профиль для eFoil-крыльев.
// Раньше здесь были условные "стартовые" значения без физического
// обоснования — это и приводило к профилям-"ножам" (номинал 12% толщины
// на деле давал ~6.6% реальной толщины, см. обсуждение калибровки ниже).
// Теперь это осознанно выбранный универсальный профиль:
// 12% толщины, пик на 36.5% хорды, 1.8% камбера, увеличенный радиус
// носика, тонкая, но не нулевая задняя кромка.
export const DEFAULT_PARAMS = {
  thickness: 0.12,     // 12% — стандарт для универсального eFoil-крыла
  thickPos: 0.365,      // 36.5% хорды (середина рекомендованных 35–38%)
  camber: 0.018,        // 1.8% (середина рекомендованных 1.5–2%)
  camberPos: 0.4,
  noseRadius: 0.85,     // увеличенный радиус носика (было 0.5)
  upperShape: 1.0,
  lowerShape: 1.0,
  // ~0.4мм в реальном масштабе при референсной хорде ~300мм (0.0013×300≈0.4мм) —
  // тонкая, но не идеально острая кромка, как и просили.
  teThickness: 0.0013,
  smoothness: 0.5,
};

const MIN_CP = 4; // минимум точек для кубического сплайна (degree 3 => 4 точки)
const STATIONS_X = [0, 0.12, 0.35, 0.7, 1]; // фиксированная сетка для генерации начальной формы

// ГЛАВНОЕ ИСПРАВЛЕНИЕ (после отчёта пользователя "толщина 6.6% вместо 12%"):
// здесь ДВА слоя B-сплайн-аппроксимации, оба занижают пик:
//   слой 1 — камбер/полутолщина строятся как B-сплайн по 5 контрольным
//            точкам (внутри этой функции);
//   слой 2 — результат слоя 1 сэмплируется всего в 5 точках (STATIONS_X)
//            и превращается в НОВЫЙ B-сплайн внутри HFProfile.rebuild().
// Калибровка только слоя 1 (как было в первой попытке) не спасает —
// слой 2 просаживает пик ещё раз. Поэтому ниже калибровка идёт по
// РЕАЛЬНОМУ результату двух слоёв сразу (строим upperCP/lowerCP так же,
// как это в итоге сделает rebuild(), и меряем то же самое, что окажется
// в profile.stats). Толщина и камбер калибруются независимо: в разнице
// upper−lower камбер сокращается математически точно, так что порядок
// калибровки (сначала камбер, потом толщина) не влияет на результат.

function buildCamberCP(params, scale) {
  const p = clamp(params.camberPos, 0.05, 0.95);
  return [
    { x: 0, y: 0 },
    { x: p * 0.5, y: params.camber * 0.7 * scale },
    { x: p, y: params.camber * scale },
    { x: p + (1 - p) * 0.5, y: params.camber * 0.35 * scale },
    { x: 1, y: 0 },
  ];
}

function buildHalfCP(params, shapeFactor, scale) {
  const half = params.thickness / 2;
  const noseX = 0.04 + 0.06 * clamp(params.smoothness, 0, 1);
  const tp = clamp(params.thickPos, noseX + 0.05, 0.9);
  const teHalf = params.teThickness / 2;
  return [
    { x: 0, y: 0 },
    { x: noseX, y: half * clamp(params.noseRadius, 0, 1) * 0.55 * scale },
    { x: tp, y: half * shapeFactor * scale },
    { x: tp + (1 - tp) * 0.6, y: (half * shapeFactor * 0.45 + teHalf * 0.5) * scale },
    { x: 1, y: teHalf }, // задняя кромка — фиксированное граничное условие, не масштабируется
  ];
}

// Строит upperCP/lowerCP ТОЧНО так же, как основной код ниже — нужно для
// калибровки "вслепую" (прогнать оба слоя и посмотреть, что получится).
function buildLayeredCP(params, camberScale, thicknessScale) {
  const camberSpline = new BSpline(buildCamberCP(params, camberScale), 3);
  const upperHalfSpline = new BSpline(buildHalfCP(params, params.upperShape, thicknessScale), 3);
  const lowerHalfSpline = new BSpline(buildHalfCP(params, params.lowerShape, thicknessScale), 3);

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

// Измеряет итоговую (после слоя 2, т.е. ровно как в profile.stats) толщину
// и камбер — строит те же B-сплайны, что и HFProfile.rebuild().
function measureLayered(upperCP, lowerCP) {
  const upperSpline = new BSpline(upperCP, Math.min(3, upperCP.length - 1));
  const lowerSpline = new BSpline(lowerCP, Math.min(3, lowerCP.length - 1));
  let maxThicknessVal = -Infinity;
  let maxCamberAbs = 0;
  let maxCamberVal = 0;
  for (let i = 0; i <= 200; i++) {
    const x = i / 200;
    const u = upperSpline.evaluateAtX(x).y;
    const l = lowerSpline.evaluateAtX(x).y;
    const t = u - l;
    if (t > maxThicknessVal) maxThicknessVal = t;
    const c = (u + l) / 2;
    if (Math.abs(c) > maxCamberAbs) { maxCamberAbs = Math.abs(c); maxCamberVal = c; }
  }
  return { thickness: maxThicknessVal, camber: maxCamberVal };
}

function seedSurfaceControlPoints(params) {
  let camberScale = 1;
  for (let i = 0; i < 3; i++) {
    const { upperCP, lowerCP } = buildLayeredCP(params, camberScale, 1);
    const achieved = measureLayered(upperCP, lowerCP).camber;
    if (Math.abs(achieved) < 1e-9) break;
    camberScale *= params.camber / achieved;
  }

  let thicknessScale = 1;
  for (let i = 0; i < 3; i++) {
    const { upperCP, lowerCP } = buildLayeredCP(params, camberScale, thicknessScale);
    const achieved = measureLayered(upperCP, lowerCP).thickness;
    if (Math.abs(achieved) < 1e-9) break;
    thicknessScale *= params.thickness / achieved;
  }

  return buildLayeredCP(params, camberScale, thicknessScale);
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

  // Для пресетов "Fixed Profile" (готовые контрольные точки вместо
  // параметрического генератора). Копирует точки (не берёт ссылку на
  // массив пресета), чтобы дальнейшее редактирование мышью не мутировало
  // сам объект пресета при повторном выборе. Дальше профиль работает
  // абсолютно так же, как сгенерированный из параметров — редактирование,
  // экспорт, сохранение проекта не отличают, откуда взялись точки.
  loadControlPoints(upperCP, lowerCP) {
    if (upperCP.length < MIN_CP || lowerCP.length < MIN_CP) {
      throw new Error(`Fixed Profile должен содержать минимум ${MIN_CP} точек на кривую`);
    }
    this.upperCP = upperCP.map((p) => ({ x: p.x, y: p.y }));
    this.lowerCP = lowerCP.map((p) => ({ x: p.x, y: p.y }));
    this.rebuild();
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
