// project.js — сохранение/загрузка проекта. Модуль 9 ТЗ: архитектура
// должна поддерживать НЕСКОЛЬКО профилей одновременно (Root/Mid/Tip),
// поэтому profiles — это именованный набор, а не один "current" профиль,
// как было в v1.0. Сохраняются контрольные точки (через profile.toJSON()),
// а не готовые координаты — координаты всегда пересчитываются при загрузке.

import { downloadText } from './export.js';
import { HFProfile } from './profile.js';

export function buildProjectJSON(profiles, projectName = 'HF-Project') {
  const serialized = {};
  for (const key of Object.keys(profiles)) {
    serialized[key] = profiles[key].toJSON();
  }
  const project = {
    project: projectName,
    frontWing: {},
    rearWing: {},
    mast: {},
    profiles: serialized,
    version: 2, // v2: profiles — именованный набор (v1: был единственный "current")
  };
  return JSON.stringify(project, null, 2);
}

export function saveProject(profiles, projectName) {
  const json = buildProjectJSON(profiles, projectName);
  const safeName = (projectName || 'HFProject').replace(/[^a-z0-9_\-]/gi, '_');
  downloadText(`${safeName}.json`, json, 'application/json');
}

export function parseProjectJSON(text) {
  const data = JSON.parse(text);
  if (!data.profiles) {
    throw new Error('Файл проекта повреждён или не содержит профилей.');
  }
  const profiles = {};
  // Совместимость с v1: там был единственный profiles.current
  if (data.profiles.current && !data.profiles.root) {
    profiles.root = HFProfile.fromJSON(data.profiles.current);
  } else {
    for (const key of Object.keys(data.profiles)) {
      profiles[key] = HFProfile.fromJSON(data.profiles[key]);
    }
  }
  return { projectName: data.project || 'HF-Project', profiles };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
