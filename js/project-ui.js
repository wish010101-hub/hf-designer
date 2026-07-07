// project-ui.js — кнопки экспорта (DAT/CSV/SVG/DXF), импорта DAT,
// сохранения/загрузки проекта и полной проверки перед экспортом.
// Принимает готовый экземпляр HFDesignerUI и довешивает на него
// обработчики — отдельный модуль по той же причине, что render.js
// и wing-render.js: одна ответственность на файл, лимит 300 строк.

import { buildDAT, buildCSV, buildSVG, buildDXF, downloadText } from './export.js';
import { parseDAT, readFileAsText as readImportFile } from './import.js';
import { saveProject, parseProjectJSON, readFileAsText as readProjectFile } from './project.js';
import { fullValidate } from './validation.js';

export function attachProjectFeatures(ui) {
  _buildValidationPanel(ui);
  _buildTopBar(ui);
  _wireImportProject(ui);
  _buildExportBar(ui);
}

function _buildValidationPanel(ui) {
  ui.root.querySelector('#runFullCheckBtn').addEventListener('click', () => {
    const issues = fullValidate(ui.activeProfile);
    _renderFullIssues(ui, issues);
    ui.log(`Полная проверка «${ui.activeProfile.name}»: найдено проблем — ${issues.length}`);
    ui.renderer.draw(ui.activeProfile, ui.interaction.selected, issues);
  });
}

function _renderFullIssues(ui, issues) {
  const el = ui.root.querySelector('#fullIssues');
  if (issues.length === 0) {
    el.innerHTML = '<div class="issue-ok">Полная проверка: проблем не найдено — профиль готов к экспорту.</div>';
    return;
  }
  el.innerHTML = issues.map((i) => `<div class="issue ${i.severity}">${i.message}</div>`).join('');
}

function _buildTopBar(ui) {
  const nameInput = ui.root.querySelector('#projectNameInput');
  nameInput.value = ui.projectName;
  nameInput.addEventListener('input', () => { ui.projectName = nameInput.value; });

  ui.root.querySelector('#saveProjectBtn').addEventListener('click', () => {
    saveProject(ui.profiles, ui.projectName);
    ui.log(`Проект сохранён: ${ui.projectName}.json (профили: ${Object.keys(ui.profiles).join(', ')})`);
  });
}

function _wireImportProject(ui) {
  ui.root.querySelector('#loadProjectInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await readProjectFile(file);
      const { projectName, profiles } = parseProjectJSON(text);
      ui.projectName = projectName;
      ui.root.querySelector('#projectNameInput').value = projectName;
      ui.profiles = { ...ui.profiles, ...profiles };
      ui.activeKey = Object.keys(ui.profiles)[0];
      ui.refreshTabs();
      ui.viewport.fitToScreen();
      ui.refresh();
      ui.log(`Проект «${projectName}» загружен (профили: ${Object.keys(profiles).join(', ')}).`);
    } catch (err) {
      ui.log(`Ошибка загрузки проекта: ${err.message}`);
    }
  });

  ui.root.querySelector('#importDatInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await readImportFile(file);
    const { name, points } = parseDAT(text);
    ui.log(`Импортирован файл «${name}» (${points.upper.length + points.lower.length} точек) — показан оранжевым поверх текущего профиля.`);
    ui.refresh();
    _drawImportedOverlay(ui, points);
  });
}

function _drawImportedOverlay(ui, points) {
  const ctx = ui.renderer.ctx;
  const ts = (p) => ui.viewport.toScreen(p);
  ctx.strokeStyle = '#ff8a3d';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  [...points.upper, ...points.lower].forEach((p, i) => {
    const s = ts(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

function _buildExportBar(ui) {
  const chordInput = ui.root.querySelector('#chordMMInput');

  ui.root.querySelector('#exportDatBtn').addEventListener('click', () => {
    const issues = fullValidate(ui.activeProfile);
    const errors = issues.filter((i) => i.severity === 'error');
    _renderFullIssues(ui, issues);
    ui.renderer.draw(ui.activeProfile, ui.interaction.selected, issues);
    if (errors.length > 0) {
      ui.log(`Экспорт DAT остановлен: ${errors.length} критических ошибок. Исправьте и повторите (см. панель проверки).`);
      return;
    }
    downloadText(`${ui.activeProfile.name}.dat`, buildDAT(ui.activeProfile, ui.activeProfile.name));
    ui.log(`Экспортирован ${ui.activeProfile.name}.dat` + (issues.length ? ` (${issues.length} предупреждений, см. журнал)` : ' — проверка пройдена.'));
  });

  ui.root.querySelector('#exportCsvBtn').addEventListener('click', () => {
    downloadText(`${ui.activeProfile.name}.csv`, buildCSV(ui.activeProfile), 'text/csv');
    ui.log(`Экспортирован ${ui.activeProfile.name}.csv`);
  });

  ui.root.querySelector('#exportSvgBtn').addEventListener('click', () => {
    downloadText(`${ui.activeProfile.name}.svg`, buildSVG(ui.activeProfile), 'image/svg+xml');
    ui.log(`Экспортирован ${ui.activeProfile.name}.svg`);
  });

  ui.root.querySelector('#exportDxfBtn').addEventListener('click', () => {
    const chordMM = parseFloat(chordInput.value) || 300;
    downloadText(`${ui.activeProfile.name}.dxf`, buildDXF(ui.activeProfile, chordMM));
    ui.log(`Экспортирован ${ui.activeProfile.name}.dxf (хорда ${chordMM} мм)`);
  });
}
