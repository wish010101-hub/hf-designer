// interaction.js — вся обработка указателя (мышь/тач) для видового окна
// редактора профиля. Не рисует ничего сам — только меняет состояние
// (профиль через мутирующие методы, viewport через zoom/pan) и просит
// вызывающий код перерисовать через onChange().
//
// Разделение с render.js: render.js ничего не знает про мышь, interaction.js
// ничего не знает как рисовать — оба общаются только через Viewport2D и HFProfile.

const HIT_RADIUS_PX = 9;
const CURVES = ['upper', 'lower'];

export class ProfileInteraction {
  constructor(canvas, viewport, getProfile, onChange, log) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.getProfile = getProfile;
    this.onChange = onChange || (() => {});
    this.log = log || (() => {});

    this.selected = new Set(); // элементы вида "upper:2"
    this.dragging = false;
    this.panning = false;
    this.lastX = 0;
    this.lastY = 0;
    this.dragStartModel = null;

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    c.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  _canvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  // Возвращает {curve, index} ближайшей контрольной точки в пределах
  // HIT_RADIUS_PX, либо null.
  _hitTestPoint(sx, sy) {
    const profile = this.getProfile();
    let best = null;
    let bestDist = HIT_RADIUS_PX;
    for (const curve of CURVES) {
      const cp = curve === 'upper' ? profile.upperCP : profile.lowerCP;
      cp.forEach((pt, i) => {
        const s = this.viewport.toScreen(pt);
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d < bestDist) {
          bestDist = d;
          best = { curve, index: i };
        }
      });
    }
    return best;
  }

  // Находит ближайший сегмент (между соседними точками) любой из кривых —
  // используется для двойного клика "добавить точку здесь".
  _hitTestSegment(sx, sy) {
    const profile = this.getProfile();
    let best = null;
    let bestDist = 14;
    for (const curve of CURVES) {
      const cp = curve === 'upper' ? profile.upperCP : profile.lowerCP;
      for (let i = 0; i < cp.length - 1; i++) {
        const a = this.viewport.toScreen(cp[i]);
        const b = this.viewport.toScreen(cp[i + 1]);
        const d = this._pointSegDist(sx, sy, a, b);
        if (d < bestDist) {
          bestDist = d;
          best = { curve, index: i };
        }
      }
    }
    return best;
  }

  _pointSegDist(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-9;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  _onPointerDown(e) {
    const { sx, sy } = this._canvasPos(e);

    if (e.button === 1) { // средняя кнопка — панорамирование
      this.panning = true;
      this.lastX = sx; this.lastY = sy;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const hit = this._hitTestPoint(sx, sy);
    if (hit) {
      const key = `${hit.curve}:${hit.index}`;
      if (e.shiftKey) {
        if (this.selected.has(key)) this.selected.delete(key);
        else this.selected.add(key);
      } else if (!this.selected.has(key)) {
        this.selected.clear();
        this.selected.add(key);
      }
      this.dragging = true;
      this.dragStartModel = this.viewport.toModel(sx, sy);
    } else if (!e.shiftKey) {
      this.selected.clear();
    }
    this.onChange();
  }

  _onPointerMove(e) {
    const { sx, sy } = this._canvasPos(e);

    if (this.panning) {
      this.viewport.pan(sx - this.lastX, sy - this.lastY);
      this.lastX = sx; this.lastY = sy;
      this.onChange();
      return;
    }

    if (this.dragging && this.selected.size > 0) {
      const nowModel = this.viewport.toModel(sx, sy);
      const dx = nowModel.x - this.dragStartModel.x;
      const dy = nowModel.y - this.dragStartModel.y;
      const profile = this.getProfile();

      for (const key of this.selected) {
        const [curve, idxStr] = key.split(':');
        const idx = parseInt(idxStr, 10);
        const cp = curve === 'upper' ? profile.upperCP : profile.lowerCP;
        const base = cp[idx];
        profile.moveControlPoint(curve, idx, base.x + dx, base.y + dy);
      }
      this.dragStartModel = nowModel;
      this.onChange();
    }
  }

  _onPointerUp() {
    this.dragging = false;
    this.panning = false;
    this.dragStartModel = null;
  }

  _onWheel(e) {
    e.preventDefault();
    const { sx, sy } = this._canvasPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.viewport.zoomAt(sx, sy, factor);
    this.onChange();
  }

  _onDoubleClick(e) {
    const { sx, sy } = this._canvasPos(e);
    const seg = this._hitTestSegment(sx, sy);
    if (seg) {
      const newIndex = this.getProfile().addControlPoint(seg.curve, seg.index);
      if (newIndex !== null) {
        this.selected.clear();
        this.selected.add(`${seg.curve}:${newIndex}`);
        this.log(`Добавлена точка на кривой «${seg.curve}»`);
        this.onChange();
      }
    }
  }

  _onKeyDown(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (this.selected.size === 0) return;
    const profile = this.getProfile();
    let removed = 0;
    for (const key of [...this.selected]) {
      const [curve, idxStr] = key.split(':');
      if (profile.removeControlPoint(curve, parseInt(idxStr, 10))) removed++;
    }
    if (removed > 0) {
      this.selected.clear();
      this.log(`Удалено точек: ${removed}`);
      this.onChange();
    }
  }
}
