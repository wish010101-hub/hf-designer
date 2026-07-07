// ui.js — ядро интерфейса версии 1.1: вкладки профилей (Root/Mid/Tip),
// слои отображения, навигация видового окна, быстрая генерация,
// панель характеристик. Экспорт/импорт/проект/проверка вынесены в
// project-ui.js — иначе файл переваливает за лимит 300 строк.

import { ProfileRenderer } from './render.js';
import { Viewport2D } from './viewport.js';
import { ProfileInteraction } from './interaction.js';
import { HFProfile, PARAM_DEFS, DEFAULT_PARAMS } from './profile.js';
import { quickValidate } from './validation.js';
import { attachProjectFeatures } from './project-ui.js';

const LAYER_TOGGLES = [
  { key: 'controlPoints', label: 'Контрольные точки' },
  { key: 'controlPolygon', label: 'Контрольный полигон' },
  { key: 'camber', label: 'Линия камбера' },
  { key: 'maxThickness', label: 'Макс. толщина' },
  { key: 'maxThicknessPos', label: 'Положение макс. толщины' },
  { key: 'curvature', label: 'Кривизна (гребень)' },
  { key: 'grid', label: 'Координатная сетка' },
  { key: 'axes', label: 'Оси координат' },
];

export class HFDesignerUI {
  constructor(root) {
    this.root = root;
    this.projectName = 'HF-1450';
    this.profiles = {
      root: new HFProfile('Root'),
      mid: new HFProfile('Mid'),
      tip: new HFProfile('Tip'),
    };
    this.activeKey = 'root';

    this.canvas = root.querySelector('#viewport');
    this.viewport = new Viewport2D(this.canvas);
    this.renderer = new ProfileRenderer(this.canvas, this.viewport);
    this.interaction = new ProfileInteraction(
      this.canvas, this.viewport,
      () => this.activeProfile,
      () => this.refresh(),
      (msg) => this.log(msg)
    );

    this._buildProfileTabs();
    this._buildLayerToggles();
    this._buildQuickGenerate();
    this._buildNavButtons();
    attachProjectFeatures(this);

    this.viewport.fitToScreen();
    this.log('Проект инициализирован: три независимых профиля (Root/Mid/Tip).');
    this.refresh();
    window.addEventListener('resize', () => this.refresh());
  }

  get activeProfile() {
    return this.profiles[this.activeKey];
  }

  refresh() {
    const issues = quickValidate(this.activeProfile);
    this._lastIssues = issues;
    this.renderer.draw(this.activeProfile, this.interaction.selected, issues);
    this._renderStats();
    this._renderQuickIssues(issues);
  }

  log(message) {
    const el = this.root.querySelector('#logPanel');
    const time = new Date().toLocaleTimeString('ru-RU');
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = `[${time}] ${message}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  _buildProfileTabs() {
    const container = this.root.querySelector('#profileTabs');
    container.innerHTML = '';
    for (const key of Object.keys(this.profiles)) {
      const btn = document.createElement('button');
      btn.className = 'tab' + (key === this.activeKey ? ' active' : '');
      btn.textContent = this.profiles[key].name;
      btn.addEventListener('click', () => {
        this.activeKey = key;
        this.interaction.selected.clear();
        container.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.viewport.fitToScreen();
        this.refresh();
        this.log(`Активный профиль: ${this.profiles[key].name}`);
      });
      container.appendChild(btn);
    }
  }

  refreshTabs() {
    this._buildProfileTabs();
  }

  _buildLayerToggles() {
    const panel = this.root.querySelector('#layersPanel');
    panel.innerHTML = '';
    for (const def of LAYER_TOGGLES) {
      const row = document.createElement('label');
      row.className = 'layer-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.renderer.layers[def.key];
      cb.addEventListener('change', () => {
        this.renderer.layers[def.key] = cb.checked;
        this.refresh();
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(' ' + def.label));
      panel.appendChild(row);
    }
  }

  _buildQuickGenerate() {
    const panel = this.root.querySelector('#quickGenPanel');
    panel.innerHTML = '';
    const state = { ...DEFAULT_PARAMS };

    for (const def of PARAM_DEFS) {
      const row = document.createElement('div');
      row.className = 'field';
      const label = document.createElement('label');
      const valueSpan = document.createElement('span');
      valueSpan.className = 'val';
      label.textContent = def.label + ' ';
      label.appendChild(valueSpan);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = def.min; input.max = def.max; input.step = def.step;
      input.value = state[def.key];

      const update = () => {
        const v = parseFloat(input.value);
        valueSpan.textContent = def.pct ? (v * 100).toFixed(2) + '%' : v.toFixed(2);
      };
      update();
      input.addEventListener('input', () => { update(); state[def.key] = parseFloat(input.value); });

      row.appendChild(label);
      row.appendChild(input);
      panel.appendChild(row);
    }

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Пересоздать контрольные точки из параметров';
    applyBtn.addEventListener('click', () => {
      this.activeProfile.generateFromParams(state);
      this.interaction.selected.clear();
      this.refresh();
      this.log(`Профиль «${this.activeProfile.name}» пересоздан из параметров (ручные правки сброшены).`);
    });
    panel.appendChild(applyBtn);
  }

  _buildNavButtons() {
    this.root.querySelector('#navFit').addEventListener('click', () => {
      this.viewport.fitToScreen();
      this.refresh();
    });
    this.root.querySelector('#navCenter').addEventListener('click', () => {
      this.viewport.center();
      this.refresh();
    });
    this.root.querySelector('#navZoomIn').addEventListener('click', () => {
      this.viewport.zoomAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2, 1.2);
      this.refresh();
    });
    this.root.querySelector('#navZoomOut').addEventListener('click', () => {
      this.viewport.zoomAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2, 1 / 1.2);
      this.refresh();
    });
  }

  _renderQuickIssues(issues) {
    const el = this.root.querySelector('#quickIssues');
    if (issues.length === 0) {
      el.innerHTML = '<div class="issue-ok">Быстрая проверка: проблем не найдено</div>';
      return;
    }
    el.innerHTML = issues.map((i) => `<div class="issue ${i.severity}">${i.message}</div>`).join('');
  }

  _renderStats() {
    const panel = this.root.querySelector('#statsPanel');
    const s = this.activeProfile.stats;
    panel.innerHTML = `
      <div class="stat-row"><span>Площадь сечения</span><b>${s.area.toFixed(4)}</b></div>
      <div class="stat-row"><span>Макс. толщина</span><b>${(s.maxThickness.value * 100).toFixed(2)}% @ ${(s.maxThickness.atX * 100).toFixed(0)}%</b></div>
      <div class="stat-row"><span>Макс. камбер</span><b>${(s.maxCamber.value * 100).toFixed(2)}% @ ${(s.maxCamber.atX * 100).toFixed(0)}%</b></div>
      <div class="stat-row"><span>Центроид (≈ центр давления)</span><b>x=${s.centroid.x.toFixed(3)}, y=${s.centroid.y.toFixed(3)}</b></div>
    `;
  }

  loadPreset(params, presetName) {
    this.activeProfile.generateFromParams(params);
    this.interaction.selected.clear();
    this.refresh();
    this.log(`Профиль «${this.activeProfile.name}»: применён пресет «${presetName}»`);
  }
}
