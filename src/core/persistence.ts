import { createSeedData } from './demo-data';
import { DEMO_DATA_VERSION, type CapturePipelineState, type CaptureSource, type DomainData } from './types';

export const PERSISTENCE_KEY = 'reflow.demo.v1';

type LegacyV1Data = Omit<DomainData, 'version' | 'captures' | 'decisions' | 'knowledgeCards'> & {
  version: 1;
  captures: { id: string; rawText: string; source: string; createdAt: string; parseStatus: 'organizing' | 'organized' | 'resolved' }[];
  knowledgeCards: { id: string; title: string; summary: string; source: string; createdAt?: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function hasCollections(data: Record<string, unknown>): boolean {
  return ['tasks', 'captures', 'proposals', 'timeEntries', 'progressLogs', 'knowledgeCards'].every((key) => Array.isArray(data[key]));
}

export function isDomainData(value: unknown): value is DomainData {
  if (!isRecord(value)) return false;
  return value.version === DEMO_DATA_VERSION && hasCollections(value) && Array.isArray(value.decisions);
}

function isLegacyV1Data(value: unknown): value is LegacyV1Data {
  return isRecord(value) && value.version === 1 && hasCollections(value);
}

function migrateSource(source: string): CaptureSource {
  if (source === '语音') return 'voice';
  if (source === '邮件') return 'email';
  if (source === '飞书') return 'feishu';
  if (source === '日历') return 'calendar';
  if (source === '分享扩展') return 'shareExtension';
  if (source === '移动端快捷入口') return 'mobileShortcut';
  return 'webText';
}

function migratePipelineState(status: LegacyV1Data['captures'][number]['parseStatus']): CapturePipelineState {
  if (status === 'organizing') return 'proposing';
  if (status === 'organized') return 'proposed';
  return 'resolved';
}

export function migrateV1Data(data: LegacyV1Data): DomainData {
  const fallbackCreatedAt = data.captures[0]?.createdAt ?? '1970-01-01T00:00:00.000Z';
  return {
    ...data,
    version: DEMO_DATA_VERSION,
    captures: data.captures.map((capture) => ({
      id: capture.id,
      rawText: capture.rawText,
      source: migrateSource(capture.source),
      createdAt: capture.createdAt,
      pipelineState: migratePipelineState(capture.parseStatus),
    })),
    decisions: [],
    knowledgeCards: data.knowledgeCards.map((card) => ({ ...card, createdAt: card.createdAt ?? fallbackCreatedAt })),
  };
}

export function parseStoredData(raw: string | null, fallback = createSeedData()): DomainData {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as unknown;
    if (isDomainData(value)) return value;
    if (isLegacyV1Data(value)) return migrateV1Data(value);
    return fallback;
  } catch {
    return fallback;
  }
}
