import { createSeedData } from './demo-data';
import { DEMO_DATA_VERSION, type DomainData } from './types';

export const PERSISTENCE_KEY = 'reflow.demo.v1';

export function isDomainData(value: unknown): value is DomainData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<DomainData>;
  return data.version === DEMO_DATA_VERSION
    && Array.isArray(data.tasks)
    && Array.isArray(data.captures)
    && Array.isArray(data.proposals)
    && Array.isArray(data.timeEntries)
    && Array.isArray(data.progressLogs)
    && Array.isArray(data.knowledgeCards);
}

export function parseStoredData(raw: string | null, fallback = createSeedData()): DomainData {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as unknown;
    return isDomainData(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
