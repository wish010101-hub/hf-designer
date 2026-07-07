// wing.js — генератор крыла: распределение хорды по размаху (сужение),
// крутка (washout), и построение сечений с профилем в каждом сечении.
// Используется и для переднего крыла, и для стабилизатора (модуль 10) —
// оба являются независимыми экземплярами одного класса Wing.

import { BSpline } from './spline.js';
import { HFProfile, DEFAULT_PARAMS } from './profile.js';
import { lerp, clamp } from './math.js';

export const DEFAULT_WING_PARAMS = {
  span: 1200,          // полный размах, мм
  rootChord: 260,       // хорда у корня, мм
  tipChord: 110,        // хорда у кончика, мм
  taperType: 'linear',  // 'linear' | 'elliptical' | 'custom'
  customTaper: [        // для taperType='custom': доля хорды (0..1 от rootChord) по доле полуразмаха (0..1)
    { t: 0, c: 1.0 },
    { t: 0.5, c: 0.65 },
    { t: 1, c: 0.42 },
  ],
  sectionCount: 9,       // число сечений на полуразмахе (5..25)
  rootTwist: 4,          // крутка у корня, градусы (module 7)
  tipTwist: 0,           // крутка у кончика, градусы
  rootProfile: { ...DEFAULT_PARAMS },
  tipProfile: { ...DEFAULT_PARAMS, thickness: 0.09, camber: 0.012 },
};

export class Wing {
  constructor(params = {}) {
    this.params = JSON.parse(JSON.stringify({ ...DEFAULT_WING_PARAMS, ...params }));
    this._customSpline = null;
  }

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'customTaper') this._customSpline = null;
  }

  setParams(patch) {
    this.params = { ...this.params, ...patch };
    this._customSpline = null;
  }

  setProfileParam(which, key, value) {
    // which: 'rootProfile' | 'tipProfile'
    this.params[which][key] = value;
  }

  get halfSpan() {
    return this.params.span / 2;
  }

  _getCustomSpline() {
    if (!this._customSpline) {
      const pts = this.params.customTaper.map((p) => ({ x: p.t, y: p.c }));
      this._customSpline = new BSpline(pts, Math.min(3, pts.length - 1));
    }
    return this._customSpline;
  }

  // Хорда (в мм) на доле полуразмаха frac (0 = корень, 1 = кончик)
  chordAt(frac) {
    const { rootChord, tipChord, taperType } = this.params;
    frac = clamp(frac, 0, 1);
    if (taperType === 'elliptical') {
      const k = Math.sqrt(Math.max(0, 1 - frac * frac));
      return tipChord + (rootChord - tipChord) * k;
    }
    if (taperType === 'custom') {
      const cFrac = this._getCustomSpline().evaluateAtX(frac).y;
      return rootChord * clamp(cFrac, 0, 1.2);
    }
    return lerp(rootChord, tipChord, frac);
  }

  twistAt(frac) {
    return lerp(this.params.rootTwist, this.params.tipTwist, clamp(frac, 0, 1));
  }

  profileParamsAt(frac) {
    frac = clamp(frac, 0, 1);
    const root = this.params.rootProfile;
    const tip = this.params.tipProfile;
    const out = {};
    for (const key of Object.keys(DEFAULT_PARAMS)) {
      out[key] = lerp(root[key], tip[key], frac);
    }
    return out;
  }

  getSections() {
    const n = this.params.sectionCount;
    const sections = [];
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? 0 : i / (n - 1);
      const chord = this.chordAt(frac);
      const twist = this.twistAt(frac);
      const profile = new HFProfile(`section_${i}`);
      profile.generateFromParams(this.profileParamsAt(frac));
      sections.push({
        index: i,
        frac,
        y: frac * this.halfSpan,
        chord,
        twist,
        profile,
      });
    }
    return sections;
  }

  // Численное интегрирование площади (трапеции) по мелкой сетке —
  // площадь ОДНОЙ консоли (половины крыла), результат ×2 в getStats().
  computeStats() {
    const N = 200;
    let halfArea = 0;
    let prevChord = this.chordAt(0);
    const dy = this.halfSpan / N;
    for (let i = 1; i <= N; i++) {
      const frac = i / N;
      const chord = this.chordAt(frac);
      halfArea += ((prevChord + chord) / 2) * dy;
      prevChord = chord;
    }
    const areaMM2 = halfArea * 2;
    const areaCM2 = areaMM2 / 100;
    const aspectRatio = (this.params.span * this.params.span) / areaMM2;
    const meanChord = areaMM2 / this.params.span;

    return {
      areaMM2,
      areaCM2,
      aspectRatio,
      meanChordMM: meanChord,
      rootChord: this.params.rootChord,
      tipChord: this.params.tipChord,
      span: this.params.span,
    };
  }

  toJSON() {
    return { type: 'Wing', params: this.params };
  }

  static fromJSON(json) {
    return new Wing(json.params || {});
  }
}
