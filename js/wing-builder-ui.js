// wing-builder-ui.js — интерфейс вкладки "Wing Builder". Никакой новой
// математики здесь нет: только сбор параметров формы, вызов уже
// существующих чистых модулей в правильном порядке и показ результата.
// wingPlanform.js / wingStations.js / wingExport.js используются как
// чёрный ящик — их код не меняется и не дублируется.

import { generatePlanform } from './wingPlanform.js';
import { generateStations } from './wingStations.js';
import { buildWingExportPackage } from './wingExport.js';
import { downloadText } from './export.js';

const PARAM_FIELDS = [
  { key: 'span', label: 'Размах, мм', value: 860 },
  { key: 'area', label: 'Площадь, см² (справочно)', value: 1420 },
  { key: 'rootChord', label: 'Корневая хорда, мм', value: 260 },
  { key: 'tipChord', label: 'Концевая хорда, мм', value: 110 },
  { key: 'sweep', label: 'Sweep, мм', value: 20 },
  { key: 'washout', label: 'Washout, °', value: -2 },
  { key: 'sectionCount', label: 'Количество станций', value: 9 },
];

const PROFILE_ROLES = [
  { key: 'root', label: 'Root профиль', fallback: 'root' },
  { key: 'mid', label: 'Mid профиль', fallback: 'mid' },
  { key: 'tip', label: 'Tip профиль', fallback: 'tip' },
];

export class WingBuilderUI {
  // mainUI — уже существующий HFDesignerUI: используем его profiles
  // (Root/Mid/Tip профили редактора) и log(), ничего в нём не меняя.
  constructor(root, mainUI) {
    this.root = root;
    this.mainUI = mainUI;
    this.inputs = {};
    this.profileSelects = {};

    this._buildParamsForm();
    this._buildProfileSelectors();
    this._wireGenerateButton();
  }

  _buildParamsForm() {
    const panel = this.root.querySelector('#wbParams');
    panel.innerHTML = '';

    for (const f of PARAM_FIELDS) {
      const row = document.createElement('div');
      row.className = 'field';
      const label = document.createElement('label');
      label.textContent = f.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.value = f.value;
      this.inputs[f.key] = input;
      row.appendChild(label);
      row.appendChild(input);
      panel.appendChild(row);
    }

    const modeRow = document.createElement('div');
    modeRow.className = 'field';
    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Тип планформы';
    this.modeSelect = document.createElement('select');
    this.modeSelect.innerHTML = `
      <option value="linear">Linear</option>
      <option value="elliptic">Elliptic</option>
      <option value="blended">Blended</option>
    `;
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(this.modeSelect);
    panel.appendChild(modeRow);
  }

  _buildProfileSelectors() {
    const panel = this.root.querySelector('#wbProfileSelect');
    panel.innerHTML = '';

    for (const role of PROFILE_ROLES) {
      const row = document.createElement('div');
      row.className = 'field';
      const label = document.createElement('label');
      label.textContent = role.label;
      const select = document.createElement('select');
      for (const key of Object.keys(this.mainUI.profiles)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = this.mainUI.profiles[key].name;
        if (key === role.fallback) opt.selected = true;
        select.appendChild(opt);
      }
      this.profileSelects[role.key] = select;
      row.appendChild(label);
      row.appendChild(select);
      panel.appendChild(row);
    }
  }

  _readParams() {
    const params = {};
    for (const key of Object.keys(this.inputs)) {
      params[key] = parseFloat(this.inputs[key].value);
    }
    params.mode = this.modeSelect.value;
    return params;
  }

  _wireGenerateButton() {
    this.root.querySelector('#wbGenerateBtn').addEventListener('click', () => this._generate());
  }

  // Единый рабочий процесс, как просит ТЗ: planform -> stations -> export.
  _generate() {
    const params = this._readParams();
    const rootProfile = this.mainUI.profiles[this.profileSelects.root.value];
    const midProfile = this.mainUI.profiles[this.profileSelects.mid.value];
    const tipProfile = this.mainUI.profiles[this.profileSelects.tip.value];

    let planform, stations, pkg;
    try {
      planform = generatePlanform(params);                                   // 1. wingPlanform.js
      stations = generateStations(planform, rootProfile, midProfile, tipProfile); // 2. wingStations.js
      pkg = buildWingExportPackage(planform, stations);                      // 3. wingExport.js
    } catch (err) {
      this.root.querySelector('#wbResults').innerHTML = `<div class="issue error">${err.message}</div>`;
      this.mainUI.log(`Wing Builder: ошибка генерации — ${err.message}`);
      return;
    }

    this._renderResults(planform, stations);
    this._renderFiles(pkg);
    this.mainUI.log(`Wing Builder: сгенерировано (${params.mode}), станций: ${stations.length}, площадь: ${planform.area.toFixed(0)} см²`);
  }

  _renderResults(planform, stations) {
    const el = this.root.querySelector('#wbResults');
    el.innerHTML = `
      <div class="stat-row"><span>Площадь</span><b>${planform.area.toFixed(1)} см²</b></div>
      <div class="stat-row"><span>Удлинение (AR)</span><b>${planform.aspectRatio.toFixed(2)}</b></div>
      <div class="stat-row"><span>MAC</span><b>${planform.mac.toFixed(1)} мм</b></div>
      <div class="stat-row"><span>Количество станций</span><b>${stations.length}</b></div>
    `;
  }

  _renderFiles(pkg) {
    const el = this.root.querySelector('#wbFilesList');
    el.innerHTML = '';
    for (const name of Object.keys(pkg.files)) {
      const row = document.createElement('div');
      row.className = 'wb-file-row';
      const label = document.createElement('span');
      label.textContent = `${pkg.folderName}/${name}`;
      const btn = document.createElement('button');
      btn.textContent = 'Скачать';
      btn.addEventListener('click', () => downloadText(name, pkg.files[name]));
      row.appendChild(label);
      row.appendChild(btn);
      el.appendChild(row);
    }
  }
}
