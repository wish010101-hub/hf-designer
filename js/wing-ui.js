// wing-ui.js — переиспользуемый компонент интерфейса для крыла: используется
// и для переднего крыла, и для стабилизатора (два независимых экземпляра).

import { WingRenderer } from './wing-render.js';
import { PARAM_DEFS } from './profile.js';
import { downloadText, buildDAT, buildWingSectionsCSV } from './export.js';

const WING_FIELD_DEFS = [
  { key: 'span', label: 'Размах, мм', min: 200, max: 2000, step: 5 },
  { key: 'rootChord', label: 'Корневая хорда, мм', min: 50, max: 500, step: 1 },
  { key: 'tipChord', label: 'Концевая хорда, мм', min: 20, max: 400, step: 1 },
  { key: 'sectionCount', label: 'Число сечений (полуразмах)', min: 5, max: 25, step: 1 },
  { key: 'rootTwist', label: 'Крутка у корня, °', min: -10, max: 10, step: 0.1 },
  { key: 'tipTwist', label: 'Крутка у кончика, °', min: -10, max: 10, step: 0.1 },
];

export class WingUI {
  constructor(wing, ids, log) {
    this.wing = wing;
    this.ids = ids;
    this.log = log || (() => {});

    this.renderer = new WingRenderer(
      document.querySelector(ids.planformCanvas),
      document.querySelector(ids.washoutCanvas)
    );

    this._buildMainParams();
    this._buildTaperTypeSelect();
    this._buildCustomTaperEditor();
    this._buildProfileOverride('rootProfile', ids.rootProfilePanel);
    this._buildProfileOverride('tipProfile', ids.tipProfilePanel);
    this._buildExportButtons();

    this.refresh();
    window.addEventListener('resize', () => this.refresh());
  }

  refresh() {
    this.renderer.drawPlanform(this.wing);
    this.renderer.drawWashoutGraph(this.wing);
    this._renderStats();
    this._renderSectionsTable();
  }

  _buildMainParams() {
    const panel = document.querySelector(this.ids.paramsPanel);
    panel.innerHTML = '';
    for (const def of WING_FIELD_DEFS) {
      const row = document.createElement('div');
      row.className = 'field';
      const label = document.createElement('label');
      const valueSpan = document.createElement('span');
      valueSpan.className = 'val';
      label.textContent = def.label + ' ';
      label.appendChild(valueSpan);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.value = this.wing.params[def.key];

      const update = () => { valueSpan.textContent = parseFloat(input.value).toFixed(def.step < 1 ? 1 : 0); };
      update();

      input.addEventListener('input', () => {
        update();
        this.wing.setParam(def.key, parseFloat(input.value));
        this.refresh();
      });
      input.addEventListener('change', () => this.log(`Крыло: «${def.label}» → ${input.value}`));

      row.appendChild(label);
      row.appendChild(input);
      panel.appendChild(row);
    }
  }

  _buildTaperTypeSelect() {
    const select = document.querySelector(this.ids.taperTypeSelect);
    select.innerHTML = `
      <option value="linear">Линейное сужение</option>
      <option value="elliptical">Эллиптическое сужение</option>
      <option value="custom">Пользовательское (по точкам)</option>
    `;
    select.value = this.wing.params.taperType;
    select.addEventListener('change', () => {
      this.wing.setParam('taperType', select.value);
      document.querySelector(this.ids.customTaperContainer).style.display =
        select.value === 'custom' ? 'block' : 'none';
      this.refresh();
      this.log(`Крыло: тип сужения → ${select.value}`);
    });
    document.querySelector(this.ids.customTaperContainer).style.display =
      select.value === 'custom' ? 'block' : 'none';
  }

  _buildCustomTaperEditor() {
    const container = document.querySelector(this.ids.customTaperContainer);
    const render = () => {
      container.innerHTML = '<div class="taper-hint">Точки: доля полуразмаха (0..1) → доля корневой хорды (0..1)</div>';
      this.wing.params.customTaper.forEach((pt, i) => {
        const row = document.createElement('div');
        row.className = 'taper-row';

        const tInput = document.createElement('input');
        tInput.type = 'number'; tInput.step = '0.01'; tInput.min = '0'; tInput.max = '1'; tInput.value = pt.t;
        const cInput = document.createElement('input');
        cInput.type = 'number'; cInput.step = '0.01'; cInput.min = '0'; cInput.max = '1.2'; cInput.value = pt.c;

        const apply = () => {
          pt.t = parseFloat(tInput.value) || 0;
          pt.c = parseFloat(cInput.value) || 0;
          this.wing.setParam('customTaper', this.wing.params.customTaper);
          this.refresh();
        };
        tInput.addEventListener('input', apply);
        cInput.addEventListener('input', apply);

        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => {
          this.wing.params.customTaper.splice(i, 1);
          this.wing.setParam('customTaper', this.wing.params.customTaper);
          render();
          this.refresh();
        });

        row.appendChild(tInput);
        row.appendChild(cInput);
        row.appendChild(delBtn);
        container.appendChild(row);
      });

      const addBtn = document.createElement('button');
      addBtn.textContent = '+ точка';
      addBtn.addEventListener('click', () => {
        this.wing.params.customTaper.push({ t: 0.5, c: 0.6 });
        this.wing.setParam('customTaper', this.wing.params.customTaper);
        render();
        this.refresh();
      });
      container.appendChild(addBtn);
    };
    render();
  }

  _buildProfileOverride(which, selector) {
    const panel = document.querySelector(selector);
    panel.innerHTML = '';
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
      input.value = this.wing.params[which][def.key];

      const update = () => {
        const v = parseFloat(input.value);
        valueSpan.textContent = def.pct ? (v * 100).toFixed(2) + '%' : v.toFixed(2);
      };
      update();

      input.addEventListener('input', () => {
        update();
        this.wing.setProfileParam(which, def.key, parseFloat(input.value));
        this.refresh();
      });

      row.appendChild(label);
      row.appendChild(input);
      panel.appendChild(row);
    }
  }

  _renderStats() {
    const panel = document.querySelector(this.ids.statsPanel);
    const s = this.wing.computeStats();
    panel.innerHTML = `
      <div class="stat-row"><span>Площадь (обе консоли)</span><b>${s.areaCM2.toFixed(0)} см²</b></div>
      <div class="stat-row"><span>Удлинение (AR)</span><b>${s.aspectRatio.toFixed(2)}</b></div>
      <div class="stat-row"><span>Средняя хорда</span><b>${s.meanChordMM.toFixed(0)} мм</b></div>
      <div class="stat-row"><span>Корень / кончик</span><b>${s.rootChord.toFixed(0)} / ${s.tipChord.toFixed(0)} мм</b></div>
    `;
  }

  _renderSectionsTable() {
    const el = document.querySelector(this.ids.sectionsTable);
    const sections = this.wing.getSections();
    let html = '<table class="sec-table"><tr><th>#</th><th>Y, мм</th><th>Хорда, мм</th><th>Крутка,°</th></tr>';
    sections.forEach((s) => {
      html += `<tr><td>${s.index}</td><td>${s.y.toFixed(0)}</td><td>${s.chord.toFixed(0)}</td><td>${s.twist.toFixed(1)}</td></tr>`;
    });
    html += '</table>';
    el.innerHTML = html;
  }

  _buildExportButtons() {
    document.querySelector(this.ids.exportCsvBtn).addEventListener('click', () => {
      downloadText('wing_sections.csv', buildWingSectionsCSV(this.wing), 'text/csv');
      this.log('Экспортирована таблица сечений wing_sections.csv');
    });
    document.querySelector(this.ids.exportRootDatBtn).addEventListener('click', () => {
      const sections = this.wing.getSections();
      downloadText('root_profile.dat', buildDAT(sections[0].profile, 'ROOT'));
      this.log('Экспортирован профиль корня root_profile.dat');
    });
    document.querySelector(this.ids.exportTipDatBtn).addEventListener('click', () => {
      const sections = this.wing.getSections();
      downloadText('tip_profile.dat', buildDAT(sections[sections.length - 1].profile, 'TIP'));
      this.log('Экспортирован профиль кончика tip_profile.dat');
    });
  }
}
