// import.js — загрузка готовых координат профиля (DAT/CSV) для просмотра.
//
// Важное отличие от profile.js: импортированный профиль — это набор
// "сырых" точек, а не параметрическая B-сплайн модель. Его можно
// посмотреть, посчитать характеристики и экспортировать обратно,
// но параметры (толщина/камбер/носик и т.д.) для него не редактируются —
// это ожидаемое ограничение версии 1.0.

export function parseDAT(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let name = 'imported';
  let start = 0;

  // Первая строка — имя профиля, если она не начинается с числа.
  const firstTokens = lines[0].split(/\s+/);
  if (firstTokens.length < 2 || isNaN(parseFloat(firstTokens[0]))) {
    name = lines[0];
    start = 1;
  }

  const points = [];
  for (let i = start; i < lines.length; i++) {
    const tokens = lines[i].split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length < 2) continue;
    const x = parseFloat(tokens[0]);
    const y = parseFloat(tokens[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  return { name, points: splitUpperLower(points) };
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const upper = [];
  const lower = [];
  const camber = [];

  for (let i = 1; i < lines.length; i++) {
    const [surface, xs, ys] = lines[i].split(',');
    const x = parseFloat(xs);
    const y = parseFloat(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (surface === 'upper') upper.push({ x, y });
    else if (surface === 'lower') lower.push({ x, y });
    else if (surface === 'camber') camber.push({ x, y });
  }

  return { name: 'imported', points: { upper, lower, camber } };
}

// Разбивает контур в формате Selig (верх ТЕ->LE, затем низ LE->ТЕ)
// на отдельные массивы upper/lower по минимуму x (носку).
function splitUpperLower(contour) {
  let minIdx = 0;
  for (let i = 1; i < contour.length; i++) {
    if (contour[i].x < contour[minIdx].x) minIdx = i;
  }
  const upper = contour.slice(0, minIdx + 1).reverse();
  const lower = contour.slice(minIdx);
  return { upper, lower, camber: [] };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
