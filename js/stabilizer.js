// stabilizer.js — стабилизатор использует тот же класс Wing (геометрия
// крыла одинакова что для переднего крыла, что для стабилизатора), но
// это ПОЛНОСТЬЮ независимый экземпляр со своими параметрами по умолчанию —
// как и требует модуль 10 ТЗ ("параметры независимы от переднего крыла").

import { Wing } from './wing.js';
import { DEFAULT_PARAMS } from './profile.js';

export const DEFAULT_STABILIZER_PARAMS = {
  span: 500,
  rootChord: 130,
  tipChord: 70,
  taperType: 'linear',
  customTaper: [
    { t: 0, c: 1.0 },
    { t: 0.5, c: 0.7 },
    { t: 1, c: 0.54 },
  ],
  sectionCount: 7,
  rootTwist: 0,
  tipTwist: 0,
  // Стабилизатор обычно симметричный или почти симметричный профиль
  // (низкий камбер) — в отличие от несущего переднего крыла.
  rootProfile: { ...DEFAULT_PARAMS, camber: 0, thickness: 0.09 },
  tipProfile: { ...DEFAULT_PARAMS, camber: 0, thickness: 0.08 },
};

export function createStabilizer(overrides = {}) {
  return new Wing({ ...DEFAULT_STABILIZER_PARAMS, ...overrides });
}
