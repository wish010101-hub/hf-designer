// export.js — сериализация профиля в файловые форматы и скачивание в браузере.
// Без серверной части: используется Blob + временная ссылка <a download>.

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Формат Selig (.dat): имя профиля в первой строке, далее координаты
// от задней кромки по верхней поверхности к носку, затем по нижней
// поверхности обратно к задней кромке. Хорда нормализована к 1 —
// это стандарт, который принимают XFoil, XFLR5, airfoiltools.com.
export function buildDAT(profile, name) {
  const contour = profile.getContour();
  const lines = [name];
  for (const p of contour) {
    lines.push(`  ${p.x.toFixed(6)}  ${p.y.toFixed(6)}`);
  }
  return lines.join('\n');
}

export function buildCSV(profile) {
  const rows = ['surface,x,y'];
  profile.upper.forEach((p) => rows.push(`upper,${p.x.toFixed(6)},${p.y.toFixed(6)}`));
  profile.lower.forEach((p) => rows.push(`lower,${p.x.toFixed(6)},${p.y.toFixed(6)}`));
  profile.camber.forEach((p) => rows.push(`camber,${p.x.toFixed(6)},${p.y.toFixed(6)}`));
  return rows.join('\n');
}

// SVG-превью контура (координата y инвертируется, т.к. в SVG ось Y направлена вниз).
export function buildSVG(profile, width = 1000) {
  const height = width * 0.4;
  const scale = width * 0.9;
  const offsetX = width * 0.05;
  const offsetY = height / 2;

  const toSvg = (p) => `${(offsetX + p.x * scale).toFixed(2)},${(offsetY - p.y * scale).toFixed(2)}`;

  const contour = profile.getContour();
  const pathD = contour.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvg(p)}`).join(' ') + ' Z';
  const camberD = profile.camber.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvg(p)}`).join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <path d="${pathD}" fill="#dbe7f5" stroke="#0c447c" stroke-width="1.5"/>
  <path d="${camberD}" fill="none" stroke="#c98500" stroke-width="1" stroke-dasharray="4,3"/>
</svg>`;
}

// Таблица сечений крыла — станция/координата по размаху/хорда/крутка.
// Готова для ручного переноса в таблицу Wing Design в XFLR5 (модуль 15 ТЗ):
// там всё равно нужно вручную указывать Y/Chord/Twist на каждой станции,
// готовые dat с масштабом хорды для этого не нужны — профиль в XFLR5 всегда
// нормализован к хорде 1, а масштаб/крутку задаёт сама таблица станций.
export function buildWingSectionsCSV(wing) {
  const rows = ['station,y_mm,chord_mm,twist_deg'];
  wing.getSections().forEach((s) => {
    rows.push(`${s.index},${s.y.toFixed(1)},${s.chord.toFixed(1)},${s.twist.toFixed(2)}`);
  });
  return rows.join('\n');
}

// Минимальный валидный DXF (R12, ASCII), сущность POLYLINE + VERTEX.
// chordMM — реальная длина хорды в мм, к которой масштабируется профиль
// (в .dat хорда всегда нормализована к 1, а в DXF нужен реальный размер для CAD/резки).
export function buildDXF(profile, chordMM = 300) {
  const contour = profile.getContour();
  const lines = ['0', 'SECTION', '2', 'ENTITIES', '0', 'POLYLINE', '8', '0', '66', '1', '70', '1'];
  for (const p of contour) {
    lines.push('0', 'VERTEX', '8', '0', '10', (p.x * chordMM).toFixed(4), '20', (p.y * chordMM).toFixed(4));
  }
  lines.push('0', 'SEQEND', '0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}
