import { createSeedData } from './demo-data';
import { resolveProposalVisibleClassification } from './classification';
import { DEMO_DATA_VERSION, type CapturePipelineState, type CaptureSource, type DomainData, type VisibleClassification } from './types';

export const PERSISTENCE_KEY = 'reflow.demo.v1';

type LegacyV1Data = Omit<DomainData, 'version' | 'captures' | 'decisions' | 'knowledgeCards'> & {
  version: 1;
  captures: { id: string; rawText: string; source: string; createdAt: string; parseStatus: 'organizing' | 'organized' | 'resolved' }[];
  knowledgeCards: { id: string; title: string; summary: string; source: string; createdAt?: string }[];
};

type LegacyV2Data = Omit<DomainData, 'version'> & { version: 2 };

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

function isLegacyV2Data(value: unknown): value is LegacyV2Data {
  return isRecord(value) && value.version === 2 && hasCollections(value) && Array.isArray(value.decisions);
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

export function migrateV1Data(data: LegacyV1Data): LegacyV2Data {
  const fallbackCreatedAt = data.captures[0]?.createdAt ?? '1970-01-01T00:00:00.000Z';
  return {
    ...data,
    version: 2,
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

function inferDecisionClassification(data: LegacyV2Data, decision: LegacyV2Data['decisions'][number]): VisibleClassification | undefined {
  if (decision.edited?.visibleClassification) return decision.edited.visibleClassification;
  if (decision.outcome === 'knowledge') return 'knowledge';
  if (decision.bucket === 'waiting') return 'waiting';
  if (decision.bucket === 'someday') return 'someday';
  const proposal = data.proposals.find((item) => item.id === decision.proposalId);
  return proposal ? resolveProposalVisibleClassification(proposal) : undefined;
}

export function migrateV2Data(data: LegacyV2Data): DomainData {
  return {
    ...data,
    version: DEMO_DATA_VERSION,
    proposals: data.proposals.map((proposal) => ({
      ...proposal,
      suggestedBucket: proposal.suggestedBucket ?? (proposal.outcome === 'task' ? 'today' : undefined),
    })),
    decisions: data.decisions.map((decision) => {
      const visibleClassification = inferDecisionClassification(data, decision);
      return {
        ...decision,
        edited: decision.edited
          ? { ...decision.edited, visibleClassification }
          : decision.edited,
      };
    }),
  };
}

export function parseStoredData(raw: string | null, fallback = createSeedData()): DomainData {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as unknown;
    if (isDomainData(value)) return value;
    if (isLegacyV2Data(value)) return migrateV2Data(value);
    if (isLegacyV1Data(value)) return migrateV2Data(migrateV1Data(value));
    return fallback;
  } catch {
    return fallback;
  }
}
