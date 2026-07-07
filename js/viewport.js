// viewport.js — камера 2D-вьюпорта: зум колесом мыши, панорамирование,
// центрирование, fit-to-screen. Отдельный модуль, не зависящий от того,
// что именно рисуется (render.js) — просто преобразование координат.

export class Viewport2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.scale = 700;      // px на единицу хорды (1.0 = вся хорда)
    this.offsetX = 0.12;   // модельные координаты, соответствующие левому краю
    this.offsetY = 0;      // модельная координата, соответствующая центру по Y
    this.minScale = 80;
    this.maxScale = 8000;
  }

  // Модельные координаты (профиль: x∈[0,1], y — доля хорды) → экранные пиксели.
  toScreen(p) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: (p.x - this.offsetX) * this.scale + w * 0.12,
      y: h / 2 - (p.y - this.offsetY) * this.scale,
    };
  }

  toModel(sx, sy) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: (sx - w * 0.12) / this.scale + this.offsetX,
      y: -(sy - h / 2) / this.scale + this.offsetY,
    };
  }

  zoomAt(sx, sy, factor) {
    const before = this.toModel(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const after = this.toModel(sx, sy);
    // Компенсация смещения, чтобы точка под курсором осталась на месте.
    this.offsetX += before.x - after.x;
    this.offsetY += before.y - after.y;
  }

  pan(dxPx, dyPx) {
    this.offsetX -= dxPx / this.scale;
    this.offsetY += dyPx / this.scale;
  }

  center() {
    this.offsetY = 0;
    this.offsetX = 0.12;
  }

  fitToScreen() {
    const w = this.canvas.clientWidth;
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, w * 0.8));
    this.center();
  }
}
