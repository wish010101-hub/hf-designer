// app.js — точка входа. Инициализирует профиль по умолчанию, UI,
// и подключает библиотеку пресетов (модуль 11 ТЗ, минимальная версия).

import { DEFAULT_PARAMS } from './profile.js';
import { HFDesignerUI } from './ui.js';
import { WingBuilderUI } from './wing-builder-ui.js';

const FALLBACK_PRESETS = {
  'HF-U12': DEFAULT_PARAMS,
  'HF-Speed': { thickness: 0.09, thickPos: 0.3, camber: 0.012, camberPos: 0.45, noseRadius: 0.35, upperShape: 0.9, lowerShape: 1.0, teThickness: 0.0015, smoothness: 0.6 },
  'HF-Lift': { thickness: 0.13, thickPos: 0.4, camber: 0.035, camberPos: 0.38, noseRadius: 0.7, upperShape: 1.2, lowerShape: 0.9, teThickness: 0.002, smoothness: 0.5 },
  'HF-SUP': { thickness: 0.14, thickPos: 0.38, camber: 0.03, camberPos: 0.4, noseRadius: 0.8, upperShape: 1.1, lowerShape: 1.0, teThickness: 0.0025, smoothness: 0.55 },
};

async function loadPresets() {
  try {
    const res = await fetch('./data/presets.json');
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  } catch (err) {
    return FALLBACK_PRESETS;
  }
}

function wirePresetSelect(ui, presets) {
  const select = document.querySelector('#presetSelect');
  select.innerHTML = '<option value="">— выбрать пресет —</option>';
  for (const name of Object.keys(presets)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    if (!select.value) return;
    ui.loadPreset(presets[select.value], select.value);
  });
}

function wireAppTabs() {
  const buttons = document.querySelectorAll('#appTabs .app-tab');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.app-view').forEach((view) => {
        view.hidden = view.id !== btn.dataset.view;
      });
    });
  });
}

async function main() {
  const ui = new HFDesignerUI(document);
  new WingBuilderUI(document, ui); // Wing Builder: связывает planform -> stations -> export
  wireAppTabs();

  const presets = await loadPresets();
  wirePresetSelect(ui, presets);

  if (presets === FALLBACK_PRESETS) {
    ui.log('data/presets.json не загрузился (вероятно, страница открыта как file://) — использована встроенная библиотека пресетов. Запустите через локальный сервер (например: python -m http.server) для полной поддержки.');
  } else {
    ui.log('Библиотека пресетов загружена из data/presets.json');
  }
}

main();
