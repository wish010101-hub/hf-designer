// render.js — отрисовка профиля. Ничего не знает про мышь (interaction.js)
// и про камеру как таковую (только использует viewport.toScreen для
// преобразования) — единственная задача: нарисовать текущее состояние.

import { vecNormalize, vecPerp } from './math.js';

const LAYER_DEFAULTS = {
  grid: true,
  axes: true,
  controlPolygon: true,
  controlPoints: true,
  camber: true,
  maxThickness: true,
  maxThicknessPos: true,
  curvature: false,
};

export class ProfileRenderer {
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.ctx = canvas.getContext('2d');
    this.layers = { ...LAYER_DEFAULTS };
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(profile, selected = new Set(), issues = []) {
    this._resize();
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ts = (p) => this.viewport.toScreen(p);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, w, h);

    if (this.layers.grid) this._drawGrid(ts, w, h);
    if (this.layers.axes) this._drawAxes(ts, w, h);
    if (this.layers.camber) this._drawCurve(profile.camber, '#c98500', 1, [4, 3], ts);

    this._drawFilledContour(profile, ts);
    this._drawCurve(profile.upper, '#3fa9f5', 2, [], ts);
    this._drawCurve(profile.lower, '#7fc8ff', 2, [], ts);

    if (this.layers.curvature) {
      this._drawCurvatureComb(profile.upper, profile.curvatureUpper, ts);
      this._drawCurvatureComb(profile.lower, profile.curvatureLower, ts);
    }

    if (this.layers.controlPolygon) {
      this._drawControlPolygon(profile.upperCP, '#3fa9f5', ts);
      this._drawControlPolygon(profile.lowerCP, '#7fc8ff', ts);
    }
    if (this.layers.controlPoints) {
      this._drawControlPoints(profile.upperCP, 'upper', selected, ts);
      this._drawControlPoints(profile.lowerCP, 'lower', selected, ts);
    }

    if (this.layers.maxThickness || this.layers.maxThicknessPos) {
      this._drawThicknessIndicator(profile, ts);
    }

    this._drawIssues(issues, ts);
  }

  _drawGrid(ts, w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1; x += 0.1) {
      const a = ts({ x, y: -1 }); const b = ts({ x, y: 1 });
      ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, h); ctx.stroke();
    }
    for (let y = -0.3; y <= 0.3; y += 0.05) {
      const a = ts({ x: 0, y });
      ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(w, a.y); ctx.stroke();
    }
  }

  _drawAxes(ts, w, h) {
    const ctx = this.ctx;
    const origin = ts({ x: 0, y: 0 });
    ctx.strokeStyle = '#4a4c52';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    const a = ts({ x: 0, y: 0 }); const b = ts({ x: 1, y: 0 });
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, h); ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawCurve(points, color, width, dash, ts) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = ts(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawFilledContour(profile, ts) {
    const ctx = this.ctx;
    const contour = [...profile.upper, ...profile.lower.slice().reverse()];
    ctx.beginPath();
    contour.forEach((p, i) => {
      const s = ts(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(63,169,245,0.10)';
    ctx.fill();
  }

  _drawControlPolygon(cp, color, ts) {
    const ctx = this.ctx;
    ctx.beginPath();
    cp.forEach((p, i) => {
      const s = ts(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  _drawControlPoints(cp, curveName, selected, ts) {
    const ctx = this.ctx;
    cp.forEach((p, i) => {
      const s = ts(p);
      const isSelected = selected.has(`${curveName}:${i}`);
      const isEndpoint = i === 0 || i === cp.length - 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, isSelected ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ffe08a' : isEndpoint ? '#7bd88f' : '#c9cbd1';
      ctx.fill();
      ctx.strokeStyle = '#1e1f22';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  _drawCurvatureComb(points, curvature, ts) {
    const ctx = this.ctx;
    if (!curvature) return;
    const maxK = Math.max(...curvature, 1e-6);
    ctx.strokeStyle = 'rgba(255,196,0,0.55)';
    ctx.lineWidth = 1;
    for (let i = 2; i < points.length - 2; i += 3) {
      const prev = points[i - 1];
      const next = points[i + 1];
      const tangent = vecNormalize({ x: next.x - prev.x, y: next.y - prev.y });
      const normal = vecPerp(tangent);
      const k = curvature[i] / maxK;
      const len = k * 0.05;
      const p0 = ts(points[i]);
      const p1 = ts({ x: points[i].x + normal.x * len, y: points[i].y + normal.y * len });
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  _drawThicknessIndicator(profile, ts) {
    const ctx = this.ctx;
    const atX = profile.stats.maxThickness.atX;
    if (this.layers.maxThicknessPos) {
      const a = ts({ x: atX, y: -1 }); const b = ts({ x: atX, y: 1 });
      ctx.strokeStyle = 'rgba(255,90,90,0.4)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, ts({ x: atX, y: 0.15 }).y); ctx.lineTo(a.x, ts({ x: atX, y: -0.1 }).y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.layers.maxThickness) {
      const pos = ts({ x: atX, y: 0 });
      ctx.fillStyle = '#c9cbd1';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Tmax ${(profile.stats.maxThickness.value * 100).toFixed(1)}%`, pos.x + 6, pos.y - 10);
    }
  }

  // Подсветка проблем из validation.js прямо на профиле — как просит ТЗ
  // ("ошибки должны подсвечиваться непосредственно на профиле").
  _drawIssues(issues, ts) {
    const ctx = this.ctx;
    for (const issue of issues) {
      if (issue.x === undefined) continue;
      const s = ts({ x: issue.x, y: issue.y || 0 });
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = issue.severity === 'error' ? '#ff5a5a' : '#ffb020';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Режим Compare (v1.2): два профиля на одном виде — A зелёным, B синим.
  // Переиспользует существующие приватные методы отрисовки без изменений.
  drawCompare(profileA, profileB) {
    this._resize();
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ts = (p) => this.viewport.toScreen(p);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, w, h);

    if (this.layers.grid) this._drawGrid(ts, w, h);
    if (this.layers.axes) this._drawAxes(ts, w, h);

    this._drawCurve(profileA.upper, '#4caf50', 2, [], ts);
    this._drawCurve(profileA.lower, '#4caf50', 2, [], ts);
    this._drawCurve(profileB.upper, '#3fa9f5', 2, [], ts);
    this._drawCurve(profileB.lower, '#3fa9f5', 2, [], ts);
  }
}
