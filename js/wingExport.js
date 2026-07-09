// wingExport.js — собирает полный комплект файлов для построения крыла
// в Fusion 360: Stations.csv, BuildNotes.txt, Root/Sxx/Tip.dat (профили,
// нормализованные 0..1) и Root/Sxx/Tip.dxf (контуры, масштабированные
// в мм по хорде своей станции). ЧИСТАЯ ФУНКЦИЯ — не пишет на диск, не
// трогает DOM, не использует ZIP: возвращает объект {folderName, files}
// с именами файлов и их текстовым содержимым. Как физически сохранить
// эти файлы (по одному через downloadText, через File System Access API
// и т.д.) — решается позже, на уровне UI, не здесь.
//
// Не импортирует export.js/wingPlanform.js/wingStations.js реализации
// DAT/DXF/CSV — билдеры переписаны самостоятельно внутри модуля, чтобы
// wingExport.js оставался независимым (та же логика независимости, что
// уже применялась в wingPlanform.js).

// ---------------------------- имена файлов станций ----------------------------

// Root / S01 / S02 ... / Tip — первая и последняя станция всегда Root/Tip,
// промежуточные нумеруются с шириной, достаточной для их количества
// (обычно 2 цифры, но расширяется, если станций очень много).
export function stationFileName(index, total) {
  if (index === 0) return 'Root';
  if (index === total - 1) return 'Tip';
  const middleCount = total - 2;
  const width = Math.max(2, String(middleCount).length);
  return `S${String(index).padStart(width, '0')}`;
}

// ---------------------------- DAT (профиль, нормализован 0..1) ----------------------------

export function buildProfileDAT(profile, name) {
  const contour = profile.getContour();
  const lines = [name];
  for (const p of contour) {
    lines.push(`  ${p.x.toFixed(6)}  ${p.y.toFixed(6)}`);
  }
  return lines.join('\n');
}

// ---------------------------- DXF (профиль, масштабирован по хорде, мм) ----------------------------

export function buildProfileDXF(profile, chordMM) {
  const contour = profile.getContour();
  const lines = ['0', 'SECTION', '2', 'ENTITIES', '0', 'POLYLINE', '8', '0', '66', '1', '70', '1'];
  for (const p of contour) {
    lines.push('0', 'VERTEX', '8', '0', '10', (p.x * chordMM).toFixed(4), '20', (p.y * chordMM).toFixed(4));
  }
  lines.push('0', 'SEQEND', '0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

// ---------------------------- Stations.csv ----------------------------

export function buildStationsCSV(stations) {
  const rows = ['Station,Y,Chord,Twist,ProfileInterpolation'];
  stations.forEach((s, i, arr) => {
    const name = stationFileName(i, arr.length);
    rows.push(`${name},${s.span.toFixed(2)},${s.chord.toFixed(2)},${s.twist.toFixed(3)},${s.profileInterpolation.toFixed(4)}`);
  });
  return rows.join('\n');
}

// ---------------------------- BuildNotes.txt ----------------------------

export function buildBuildNotes(wingPlanform, stations) {
  const lines = [
    'HF Designer — комплект для построения крыла в Fusion 360',
    '',
    `Размах (span): ${wingPlanform.span} мм`,
    `Площадь (area): ${wingPlanform.area.toFixed(1)} см²`,
    `MAC: ${wingPlanform.mac.toFixed(1)} мм`,
    `Удлинение (AR): ${wingPlanform.aspectRatio.toFixed(2)}`,
    `Количество станций: ${stations.length}`,
    `Washout: ${wingPlanform.washout}°`,
    `Sweep: ${wingPlanform.sweep} мм`,
    '',
    'Профили (.dat) нормализованы к хорде 1 — масштабировать в CAD по',
    'значению Chord соответствующей станции из Stations.csv.',
    'Контуры (.dxf) уже масштабированы в мм по хорде своей станции —',
    'готовы для прямой вставки эскизом в Fusion 360.',
  ];
  return lines.join('\n');
}

// ---------------------------- основная сборка пакета ----------------------------

export function buildWingExportPackage(wingPlanform, stations) {
  if (!stations || stations.length < 2) {
    throw new Error('Нужно минимум 2 станции (Root и Tip) для сборки экспорта крыла.');
  }

  const files = {};
  files['Stations.csv'] = buildStationsCSV(stations);
  files['BuildNotes.txt'] = buildBuildNotes(wingPlanform, stations);

  stations.forEach((s, i, arr) => {
    const name = stationFileName(i, arr.length);
    files[`${name}.dat`] = buildProfileDAT(s.profile, name);
    files[`${name}.dxf`] = buildProfileDXF(s.profile, s.chord);
  });

  return { folderName: 'WingExport', files };
}

// Вспомогательная функция (не была явно в ТЗ, но удобна для будущего
// подключения к UI): плоский список {path, content} вместо вложенного
// объекта files — под циклическое сохранение файлов по одному, раз ZIP
// использовать нельзя.
export function listExportFiles(pkg) {
  return Object.keys(pkg.files).map((name) => ({
    path: `${pkg.folderName}/${name}`,
    content: pkg.files[name],
  }));
}
