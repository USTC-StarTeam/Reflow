import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { createWebTextCapture } from './capture-factory';
import { createSeedData } from './demo-data';
import { runtimeId, toZonedISOString } from './date-utils';
import { MockProposalService } from './mock-proposal-service';
import { parseBackup, parseStoredDataWithRecovery, PERSISTENCE_KEY, RECOVERY_KEY, serializeBackup } from './persistence';
import { runProposalPipeline } from './proposal-pipeline';
import { createProposalService } from './proposal-service-config';
import { reduceDomain, type DomainAction } from './reducer';
import { selectLatestUndoableDecision } from './selectors';
import type { CaptureSource, DomainData, LocalDate, PipelineFailure, ProposalService, ProposalServiceKind, UserDecisionInput, WorkflowBucket } from './types';

export type StoreCommandResult = { status: 'success' } | { status: 'failure'; failure: PipelineFailure };

interface StoreState {
  data: DomainData;
  hydrated: boolean;
  capturing: boolean;
  lastActionFailure: PipelineFailure | null;
}

type StoreAction =
  | { type: 'hydrate'; data: DomainData }
  | { type: 'setCapturing'; value: boolean }
  | { type: 'domain'; action: DomainAction }
  | { type: 'reset'; data: DomainData };

export interface ReflowStoreValue {
  data: DomainData;
  hydrated: boolean;
  capturing: boolean;
  proposalServiceKind: ProposalServiceKind;
  lastActionFailure: PipelineFailure | null;
  capture(text: string): Promise<StoreCommandResult>;
  retryCapture(captureId: string): Promise<StoreCommandResult>;
  retryCaptureWithLocalRules(captureId: string): Promise<StoreCommandResult>;
  submitUserDecision(decision: UserDecisionInput): void;
  undoLastDecision(): void;
  startTask(taskId: string): void;
  pauseTask(taskId: string): void;
  completeTask(taskId: string): void;
  moveTask(taskId: string, bucket: WorkflowBucket): void;
  recordTime(taskId: string, minutes: number): void;
  recordProgress(taskId: string, text: string): void;
  recordInterruption(taskId: string, text: string): void;
  planTaskForDate(taskId: string, date: LocalDate): void;
  scheduleTask(taskId: string, startAt: string, endAt: string, options?: { allowConflict?: boolean }): void;
  unscheduleTask(taskId: string): void;
  deferTask(taskId: string, destination: { date: LocalDate } | { bucket: 'someday' }): void;
  deleteTask(taskId: string): void;
  reorderTasks(taskIds: string[]): void;
  exportBackup(): string;
  importBackup(raw: string): Promise<{ status: 'success'; counts: Record<string, number> } | { status: 'failure'; failure: PipelineFailure }>;
  resetDemo(): void;
}

const defaultProposalService = createProposalService();
const localProposalService = new MockProposalService();
const ReflowContext = createContext<ReflowStoreValue | null>(null);

function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, data: action.data, hydrated: true };
    case 'setCapturing':
      return { ...state, capturing: action.value };
    case 'domain': {
      const transition = reduceDomain(state.data, action.action);
      return {
        ...state,
        data: transition.data,
        lastActionFailure: transition.status === 'failure' ? transition.failure : null,
      };
    }
    case 'reset':
      return { data: action.data, hydrated: true, capturing: false, lastActionFailure: null };
    default:
      return state;
  }
}

const initialState: StoreState = {
  data: createSeedData(),
  hydrated: false,
  capturing: false,
  lastActionFailure: null,
};

interface ReflowProviderProps extends PropsWithChildren {
  proposalService?: ProposalService;
}

export function ReflowProvider({ children, proposalService = defaultProposalService }: ReflowProviderProps) {
  const [state, dispatch] = useReducer(storeReducer, initialState);
  const persistenceQueue = useRef(Promise.resolve());
  const lastPersistedSnapshot = useRef<string | null>(null);
  const skipNextPersistence = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(PERSISTENCE_KEY), AsyncStorage.getItem(RECOVERY_KEY)])
      .then(([primary, recovery]) => {
        if (active) {
          const data = parseStoredDataWithRecovery(primary, recovery);
          lastPersistedSnapshot.current = JSON.stringify(data);
          dispatch({ type: 'hydrate', data });
        }
      })
      .catch(() => {
        if (active) dispatch({ type: 'hydrate', data: createSeedData() });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const snapshot = JSON.stringify(state.data);
    if (skipNextPersistence.current) {
      skipNextPersistence.current = false;
      lastPersistedSnapshot.current = snapshot;
      return;
    }
    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (lastPersistedSnapshot.current && lastPersistedSnapshot.current !== snapshot) {
          await AsyncStorage.setItem(RECOVERY_KEY, lastPersistedSnapshot.current);
        }
        await AsyncStorage.setItem(PERSISTENCE_KEY, snapshot);
        lastPersistedSnapshot.current = snapshot;
      })
      .catch(() => undefined);
  }, [state.data, state.hydrated]);

  const value = useMemo<ReflowStoreValue>(() => {
    const now = () => toZonedISOString(new Date());
    const perform = (action: DomainAction) => dispatch({ type: 'domain', action });

    async function requestProposals(captureId: string, captureText: string, source: CaptureSource, createdAt: string, existingTasks: DomainData['tasks'], service = proposalService): Promise<StoreCommandResult> {
      const result = await runProposalPipeline({
        capture: { id: captureId, rawText: captureText, source, createdAt, pipelineState: 'proposing' },
        existingTasks,
        proposalService: service,
      });
      if (result.status === 'success') {
        perform({ type: 'proposalReceived', captureId, proposals: result.proposals });
        return { status: 'success' };
      }
      perform({ type: 'proposalFailed', captureId, failure: result.failure });
      return { status: 'failure', failure: result.failure };
    }

    return {
      data: state.data,
      hydrated: state.hydrated,
      capturing: state.capturing,
      proposalServiceKind: proposalService.kind ?? 'mock',
      lastActionFailure: state.lastActionFailure,
      async capture(text) {
        if (state.capturing) return { status: 'failure', failure: { code: 'proposal_unavailable', message: '正在生成上一条建议，请稍候。', retryable: true } };
        const createdAt = now();
        const created = createWebTextCapture({ id: runtimeId('capture'), rawText: text, createdAt });
        if (created.status === 'failure') return created;
        perform({ type: 'captureCreated', capture: created.capture });
        dispatch({ type: 'setCapturing', value: true });
        try {
          return await requestProposals(created.capture.id, created.capture.rawText, created.capture.source, created.capture.createdAt, state.data.tasks.filter((task) => !task.deletedAt));
        } finally {
          dispatch({ type: 'setCapturing', value: false });
        }
      },
      async retryCapture(captureId) {
        const capture = state.data.captures.find((item) => item.id === captureId);
        if (!capture || capture.pipelineState !== 'proposalFailed') {
          return { status: 'failure', failure: { code: 'invalid_proposal', message: '这条捕捉当前不能重试。', retryable: false } };
        }
        if (state.capturing) return { status: 'failure', failure: { code: 'proposal_unavailable', message: '正在生成另一条建议，请稍候。', retryable: true } };
        perform({ type: 'proposalRequested', captureId });
        dispatch({ type: 'setCapturing', value: true });
        try {
          return await requestProposals(capture.id, capture.rawText, capture.source, capture.createdAt, state.data.tasks.filter((task) => !task.deletedAt));
        } finally {
          dispatch({ type: 'setCapturing', value: false });
        }
      },
      async retryCaptureWithLocalRules(captureId) {
        const capture = state.data.captures.find((item) => item.id === captureId);
        if (!capture || capture.pipelineState !== 'proposalFailed') {
          return { status: 'failure', failure: { code: 'invalid_proposal', message: '这条捕捉当前不能使用本地规则重试。', retryable: false } };
        }
        if (state.capturing) return { status: 'failure', failure: { code: 'proposal_unavailable', message: '正在生成另一条建议，请稍候。', retryable: true } };
        perform({ type: 'proposalRequested', captureId });
        dispatch({ type: 'setCapturing', value: true });
        try {
          return await requestProposals(capture.id, capture.rawText, capture.source, capture.createdAt, state.data.tasks.filter((task) => !task.deletedAt), localProposalService);
        } finally {
          dispatch({ type: 'setCapturing', value: false });
        }
      },
      submitUserDecision(decision) {
        perform({ type: 'submitUserDecision', decisionId: runtimeId('decision'), decision, at: now() });
      },
      undoLastDecision() {
        const decision = selectLatestUndoableDecision(state.data);
        if (decision) perform({ type: 'undoUserDecision', decisionId: decision.id, at: now() });
      },
      startTask(taskId) { perform({ type: 'startTask', taskId, at: now() }); },
      pauseTask(taskId) { perform({ type: 'pauseTask', taskId, at: now() }); },
      completeTask(taskId) { perform({ type: 'completeTask', taskId, at: now() }); },
      moveTask(taskId, bucket) { perform({ type: 'moveTask', taskId, bucket, at: now() }); },
      recordTime(taskId, minutes) { perform({ type: 'recordTime', taskId, minutes, at: now() }); },
      recordProgress(taskId, text) { perform({ type: 'recordProgress', taskId, text, kind: 'progress', at: now() }); },
      recordInterruption(taskId, text) { perform({ type: 'recordInterruption', taskId, text: text.trim() || '突发事项打断当前任务', at: now() }); },
      planTaskForDate(taskId, date) { perform({ type: 'planTaskForDate', taskId, date, at: now() }); },
      scheduleTask(taskId, startAt, endAt, options) { perform({ type: 'scheduleTask', taskId, startAt, endAt, allowConflict: options?.allowConflict, at: now() }); },
      unscheduleTask(taskId) { perform({ type: 'unscheduleTask', taskId, at: now() }); },
      deferTask(taskId, destination) { perform({ type: 'deferTask', taskId, destination, at: now() }); },
      deleteTask(taskId) { perform({ type: 'deleteTask', taskId, at: now() }); },
      reorderTasks(taskIds) { perform({ type: 'reorderTasks', taskIds }); },
      exportBackup() { return serializeBackup(state.data); },
      async importBackup(raw) {
        const parsed = parseBackup(raw);
        if (parsed.status === 'failure') return { status: 'failure', failure: { code: 'invalid_backup', message: parsed.message, retryable: false } };
        const current = JSON.stringify(state.data);
        const incoming = JSON.stringify(parsed.data);
        try {
          await AsyncStorage.setItem(RECOVERY_KEY, current);
          await AsyncStorage.setItem(PERSISTENCE_KEY, incoming);
          lastPersistedSnapshot.current = incoming;
          skipNextPersistence.current = true;
          dispatch({ type: 'domain', action: { type: 'restoreBackup', data: parsed.data } });
          return { status: 'success', counts: parsed.counts };
        } catch {
          return { status: 'failure', failure: { code: 'invalid_backup', message: '写入备份失败，现有数据保持不变。', retryable: true } };
        }
      },
      resetDemo() {
        const data = createSeedData();
        dispatch({ type: 'reset', data });
      },
    };
  }, [proposalService, state]);

  return <ReflowContext.Provider value={value}>{children}</ReflowContext.Provider>;
}

export function useReflowStore(): ReflowStoreValue {
  const value = useContext(ReflowContext);
  if (!value) throw new Error('useReflowStore must be used inside ReflowProvider');
  return value;
}
