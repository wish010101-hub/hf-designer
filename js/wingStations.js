// wingStations.js — связывает wingPlanform (v1.3) с тремя профилями
// (Root/Mid/Tip) и строит для каждой станции крыла НОВЫЙ профиль —
// интерполяцией КОНТРОЛЬНЫХ ТОЧЕК B-сплайна (upperCP/lowerCP), а не
// готовых сэмплированных координат. Модуль не подключён к UI.
//
// Единственные зависимости — HFProfile и BSpline из уже существующих
// profile.js/spline.js, используются только их ПУБЛИЧНЫЕ методы
// (конструктор, rebuild(), evaluateAtX()) — сами файлы не меняются.
//
// ДОПУЩЕНИЕ (важно, т.к. не было явно оговорено в ТЗ): wingPlanform.js
// хранит washout как ОДНО число (не отдельно root/tip, см. v1.3), поэтому
// здесь крутка станции считается как washout * frac — то есть корень
// всегда 0° (угол установки корневого сечения — референс), а к законцовке
// угол линейно уходит к washout (обычно отрицательному числу — классическое
// "уменьшение угла установки к законцовке" в авиастроении/гидрофойлах).
// Если позже понадобится независимая крутка root/tip — этот модуль придётся
// расширить входным параметром, сам wingPlanform.js трогать не нужно.

import { HFProfile } from './profile.js';
import { BSpline } from './spline.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Приводит массив контрольных точек к targetCount точек. Если длина уже
// совпадает — возвращает копию как есть (без пересэмплирования, это и
// есть "интерполяция по контрольным точкам" в чистом виде). Если длины
// разных профилей отличаются (пользователь мог добавить/удалить точку
// в редакторе v1.1) — точки пересэмплируются вдоль той же B-сплайн кривой
// через evaluateAtX, чтобы интерполяция вообще была корректно определена.
function normalizeControlPoints(cp, targetCount) {
  if (cp.length === targetCount) return cp.map((p) => ({ x: p.x, y: p.y }));
  const degree = Math.min(3, cp.length - 1);
  const spline = new BSpline(cp, degree);
  const out = [];
  for (let i = 0; i < targetCount; i++) {
    const x = targetCount === 1 ? 0 : i / (targetCount - 1);
    out.push(spline.evaluateAtX(x));
  }
  return out;
}

// Линейная интерполяция двух массивов контрольных точек поточечно.
function interpolateControlPoints(cpA, cpB, factor) {
  const n = Math.max(cpA.length, cpB.length);
  const a = normalizeControlPoints(cpA, n);
  const b = normalizeControlPoints(cpB, n);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: lerp(a[i].x, b[i].x, factor), y: lerp(a[i].y, b[i].y, factor) });
  }
  return out;
}

// Кусочно-линейная интерполяция по трём опорным профилям: t=0 -> Root,
// t=0.5 -> Mid, t=1 -> Tip. Стандартная схема лофтинга крыла в две
// секции (root-to-mid, mid-to-tip), а не единая интерполяция root-to-tip,
// потому что средний профиль (Mid) обязан участвовать как самостоятельная
// опорная форма, а не просто лежать на прямой между root и tip.
export function blendControlPoints(rootProfile, midProfile, tipProfile, t) {
  if (t <= 0.5) {
    const local = t / 0.5;
    return {
      upperCP: interpolateControlPoints(rootProfile.upperCP, midProfile.upperCP, local),
      lowerCP: interpolateControlPoints(rootProfile.lowerCP, midProfile.lowerCP, local),
    };
  }
  const local = (t - 0.5) / 0.5;
  return {
    upperCP: interpolateControlPoints(midProfile.upperCP, tipProfile.upperCP, local),
    lowerCP: interpolateControlPoints(midProfile.lowerCP, tipProfile.lowerCP, local),
  };
}

// Строит полноценный рабочий HFProfile (со всеми геометрическими
// свойствами: upper/lower/camber/stats) из интерполированных контрольных
// точек. Использует только публичный API profile.js (конструктор + rebuild),
// сам класс не модифицируется.
function buildInterpolatedProfile(rootProfile, midProfile, tipProfile, t, name) {
  const { upperCP, lowerCP } = blendControlPoints(rootProfile, midProfile, tipProfile, t);
  const profile = Object.create(HFProfile.prototype);
  profile.name = name;
  profile.resolution = rootProfile.resolution || 120;
  profile.upperCP = upperCP;
  profile.lowerCP = lowerCP;
  profile.rebuild();
  return profile;
}

// Основная функция модуля: связывает планформу (wingPlanform.js) с
// профилями Root/Mid/Tip и строит массив станций.
export function generateStations(wingPlanform, rootProfile, midProfile, tipProfile) {
  const halfSpan = wingPlanform.span / 2;
  return wingPlanform.stations.map((station, i) => {
    const frac = halfSpan > 0 ? station.y / halfSpan : 0;
    const twist = (wingPlanform.washout || 0) * frac;
    const name = `station_${i}`;
    const profile = buildInterpolatedProfile(rootProfile, midProfile, tipProfile, frac, name);
    return {
      name,
      span: station.y,
      chord: station.chord,
      twist,
      profileInterpolation: frac,
      profile,
    };
  });
}

export function exportStationsCSV(stations) {
  const rows = ['Station,Y,Chord,Twist,Interpolation'];
  stations.forEach((s) => {
    rows.push(`${s.name},${s.span.toFixed(2)},${s.chord.toFixed(2)},${s.twist.toFixed(3)},${s.profileInterpolation.toFixed(4)}`);
  });
  return rows.join('\n');
}
