// wing-render.js — вид сверху (planform) и график крутки по размаху.
// Отдельный модуль (как render.js для профиля), чтобы не раздувать wing-ui.js.

export class WingRenderer {
  constructor(planformCanvas, washoutCanvas) {
    this.planformCanvas = planformCanvas;
    this.washoutCanvas = washoutCanvas;
  }

  _resize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  drawPlanform(wing) {
    const canvas = this.planformCanvas;
    const ctx = this._resize(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, w, h);

    const halfSpan = wing.halfSpan;
    const margin = 40;
    const scale = (w - margin * 2) / (wing.params.span);
    const originX = w / 2;
    const leOriginY = h * 0.28;

    // Ось симметрии (мачта/фюзеляж)
    ctx.strokeStyle = '#4a4c52';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(originX, 10);
    ctx.lineTo(originX, h - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    const N = 60;
    const leRight = [];
    const teRight = [];
    for (let i = 0; i <= N; i++) {
      const frac = i / N;
      const y = frac * halfSpan;
      const chord = wing.chordAt(frac);
      const screenX = originX + y * scale;
      leRight.push({ x: screenX, y: leOriginY });
      teRight.push({ x: screenX, y: leOriginY + chord * scale });
    }

    const drawSide = (mirror) => {
      const tr = (p) => ({ x: mirror ? 2 * originX - p.x : p.x, y: p.y });
      ctx.beginPath();
      leRight.forEach((p, i) => {
        const s = tr(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      for (let i = teRight.length - 1; i >= 0; i--) {
        const s = tr(teRight[i]);
        ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(63,169,245,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#3fa9f5';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    drawSide(false);
    drawSide(true);

    // Отметки сечений
    ctx.fillStyle = '#c98500';
    for (const sec of wing.getSections()) {
      const screenX = originX + sec.y * scale;
      const chordPx = sec.chord * scale;
      ctx.beginPath();
      ctx.moveTo(screenX, leOriginY);
      ctx.lineTo(screenX, leOriginY + chordPx);
      ctx.strokeStyle = 'rgba(201,133,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawWashoutGraph(wing) {
    const canvas = this.washoutCanvas;
    const ctx = this._resize(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, w, h);

    const margin = { left: 34, right: 12, top: 12, bottom: 22 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;

    const angles = [wing.params.rootTwist, wing.params.tipTwist];
    const minA = Math.min(0, ...angles) - 1;
    const maxA = Math.max(0, ...angles) + 1;

    const toX = (frac) => margin.left + frac * plotW;
    const toY = (angle) => margin.top + (1 - (angle - minA) / (maxA - minA)) * plotH;

    ctx.strokeStyle = '#3a3c42';
    ctx.beginPath();
    ctx.moveTo(margin.left, toY(0));
    ctx.lineTo(w - margin.right, toY(0));
    ctx.stroke();

    ctx.strokeStyle = '#3fa9f5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const frac = i / N;
      const angle = wing.twistAt(frac);
      const x = toX(frac);
      const y = toY(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#86888f';
    ctx.font = '10px sans-serif';
    ctx.fillText('корень', margin.left, h - 6);
    ctx.fillText('кончик', w - margin.right - 28, h - 6);
    ctx.fillText(maxA.toFixed(0) + '°', 2, margin.top + 8);
    ctx.fillText(minA.toFixed(0) + '°', 2, h - margin.bottom);
  }
}
