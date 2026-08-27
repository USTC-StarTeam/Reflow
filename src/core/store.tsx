import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { createCapture } from './capture-factory';
import { createEmptyData, createSeedData } from './demo-data';
import { runtimeId, toZonedISOString } from './date-utils';
import { MockProposalService } from './mock-proposal-service';
import { loadStoredDataWithRecovery, parseBackup, PERSISTENCE_KEY, RECOVERY_KEY, serializeBackup } from './persistence';
import { runProposalPipeline } from './proposal-pipeline';
import { createProposalService } from './proposal-service-config';
import { reduceDomain, type DomainAction } from './reducer';
import { selectLatestUndoableDecision } from './selectors';
import type { CaptureSource, DomainData, ExecutionTimeDecision, LocalDate, PipelineFailure, ProposalService, ProposalServiceKind, UserDecisionInput, WorkflowBucket } from './types';

export type StoreCommandResult = { status: 'success' } | { status: 'failure'; failure: PipelineFailure };

interface StoreState {
  data: DomainData;
  hydrated: boolean;
  recoveryFailure: boolean;
  persistenceFailure: boolean;
  capturing: boolean;
  lastActionFailure: PipelineFailure | null;
}

type StoreAction =
  | { type: 'hydrate'; data: DomainData; recoveryFailure: boolean }
  | { type: 'setCapturing'; value: boolean }
  | { type: 'setPersistenceFailure'; value: boolean }
  | { type: 'domain'; action: DomainAction }
  | { type: 'reset'; data: DomainData };

export interface ReflowStoreValue {
  data: DomainData;
  hydrated: boolean;
  recoveryFailure: boolean;
  persistenceFailure: boolean;
  capturing: boolean;
  proposalServiceKind: ProposalServiceKind;
  lastActionFailure: PipelineFailure | null;
  capture(text: string, source?: CaptureSource): Promise<StoreCommandResult>;
  retryCapture(captureId: string): Promise<StoreCommandResult>;
  retryCaptureWithLocalRules(captureId: string): Promise<StoreCommandResult>;
  submitUserDecision(decision: UserDecisionInput): void;
  undoLastDecision(): void;
  startTask(taskId: string, previousTimeDecision?: ExecutionTimeDecision): void;
  pauseTask(taskId: string, timeDecision?: ExecutionTimeDecision): void;
  completeTask(taskId: string, timeDecision?: ExecutionTimeDecision): void;
  restoreTask(taskId: string): void;
  updateTaskDetails(taskId: string, details: { title: string; estimatedMinutes: number; nextAction: string }): void;
  moveTask(taskId: string, bucket: WorkflowBucket): void;
  updateWaitingFollowUp(taskId: string, followUpDate: LocalDate): void;
  recordTime(taskId: string, minutes: number): void;
  correctTimeEntry(timeEntryId: string, actualMinutes: number): void;
  recordProgress(taskId: string, text: string): void;
  recordInterruption(taskId: string, text: string): void;
  planTaskForDate(taskId: string, date: LocalDate): void;
  scheduleTask(taskId: string, startAt: string, endAt: string, options?: { allowConflict?: boolean }): void;
  unscheduleTask(taskId: string): void;
  deferTask(taskId: string, destination: { date: LocalDate } | { bucket: 'someday' }): void;
  deleteTask(taskId: string): void;
  reorderTasks(taskIds: string[]): void;
  exportBackup(): string;
  retryPersistence(): Promise<void>;
  importBackup(raw: string): Promise<{ status: 'success'; counts: Record<string, number> } | { status: 'failure'; failure: PipelineFailure }>;
  startEmpty(): void;
  resetDemo(): Promise<StoreCommandResult>;
}

const defaultProposalService = createProposalService();
const localProposalService = new MockProposalService();
const ReflowContext = createContext<ReflowStoreValue | null>(null);

function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, data: action.data, hydrated: true, recoveryFailure: action.recoveryFailure };
    case 'setCapturing':
      return { ...state, capturing: action.value };
    case 'setPersistenceFailure':
      return state.persistenceFailure === action.value ? state : { ...state, persistenceFailure: action.value };
    case 'domain': {
      // 水合完成前忽略所有领域动作，否则持久化数据加载后会整体覆盖 state，
      // 导致用户在水合期间触发的捕捉/建议被静默丢弃，并产生找不到 capture 的失败。
      if (!state.hydrated) return state;
      const transition = reduceDomain(state.data, action.action);
      return {
        ...state,
        data: transition.data,
        lastActionFailure: transition.status === 'failure' ? transition.failure : null,
      };
    }
    case 'reset':
      return { data: action.data, hydrated: true, recoveryFailure: false, persistenceFailure: state.persistenceFailure, capturing: false, lastActionFailure: null };
    default:
      return state;
  }
}

const initialState: StoreState = {
  data: createEmptyData(),
  hydrated: false,
  recoveryFailure: false,
  persistenceFailure: false,
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
  const latestPersistenceSnapshot = useRef<string | null>(null);
  const persistenceFailure = useRef(false);
  const skipNextPersistence = useRef(false);
  const dataRef = useRef(initialState.data);
  const hydratedRef = useRef(false);
  const proposalQueue = useRef(Promise.resolve());
  const queuedCaptureIds = useRef(new Set<string>());

  const setPersistenceFailure = useCallback((value: boolean) => {
    if (persistenceFailure.current === value) return;
    persistenceFailure.current = value;
    dispatch({ type: 'setPersistenceFailure', value });
  }, []);

  const enqueuePersistence = useCallback((snapshot: string): Promise<boolean> => {
    latestPersistenceSnapshot.current = snapshot;
    const attempt = persistenceQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (lastPersistedSnapshot.current && lastPersistedSnapshot.current !== snapshot) {
          await AsyncStorage.setItem(RECOVERY_KEY, lastPersistedSnapshot.current);
        }
        await AsyncStorage.setItem(PERSISTENCE_KEY, snapshot);
        lastPersistedSnapshot.current = snapshot;
    });
    const result = attempt.then(
      () => {
        if (latestPersistenceSnapshot.current === snapshot) setPersistenceFailure(false);
        return true;
      },
      () => {
        if (latestPersistenceSnapshot.current === snapshot) setPersistenceFailure(true);
        return false;
      },
    );
    persistenceQueue.current = result.then(() => undefined);
    return result;
  }, [setPersistenceFailure]);

  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(PERSISTENCE_KEY), AsyncStorage.getItem(RECOVERY_KEY)])
      .then(([primary, recovery]) => {
        if (active) {
          const result = loadStoredDataWithRecovery(primary, recovery);
          const recoveryFailure = result.status === 'failure';
          const data = result.status === 'success' ? result.data : createEmptyData();
          lastPersistedSnapshot.current = recoveryFailure ? null : JSON.stringify(data);
          dataRef.current = data;
          hydratedRef.current = true;
          dispatch({ type: 'hydrate', data, recoveryFailure });
        }
      })
      .catch(() => {
        if (active) {
          const data = createEmptyData();
          dataRef.current = data;
          hydratedRef.current = true;
          dispatch({ type: 'hydrate', data, recoveryFailure: true });
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!state.hydrated || state.recoveryFailure) return;
    const snapshot = JSON.stringify(state.data);
    if (latestPersistenceSnapshot.current === snapshot) return;
    if (skipNextPersistence.current) {
      skipNextPersistence.current = false;
      lastPersistedSnapshot.current = snapshot;
      return;
    }
    void enqueuePersistence(snapshot);
  }, [enqueuePersistence, state.data, state.hydrated, state.recoveryFailure]);

  useEffect(() => {
    dataRef.current = state.data;
    hydratedRef.current = state.hydrated;
  }, [state.data, state.hydrated]);

  const value = useMemo<ReflowStoreValue>(() => {
    const now = () => toZonedISOString(new Date());
    const perform = (action: DomainAction) => {
      if (!hydratedRef.current) return undefined;
      const transition = reduceDomain(dataRef.current, action);
      dataRef.current = transition.data;
      dispatch({ type: 'domain', action });
      return transition;
    };

    async function requestProposals(captureId: string, service = proposalService): Promise<StoreCommandResult> {
      const capture = dataRef.current.captures.find((item) => item.id === captureId);
      if (!capture) return { status: 'failure', failure: { code: 'invalid_proposal', message: '找不到需要整理的捕捉。', retryable: false } };
      const result = await runProposalPipeline({
        capture: { ...capture, pipelineState: 'proposing' },
        existingTasks: dataRef.current.tasks.filter((task) => !task.deletedAt),
        proposalService: service,
      });
      if (result.status === 'success') {
        perform({ type: 'proposalReceived', captureId, proposals: result.proposals });
        return { status: 'success' };
      }
      perform({ type: 'proposalFailed', captureId, failure: result.failure });
      return { status: 'failure', failure: result.failure };
    }

    function enqueueProposal(captureId: string, service = proposalService) {
      if (queuedCaptureIds.current.has(captureId)) return;
      queuedCaptureIds.current.add(captureId);
      const job = proposalQueue.current
        .catch(() => undefined)
        .then(async () => {
          const capture = dataRef.current.captures.find((item) => item.id === captureId);
          if (!capture || (capture.pipelineState !== 'captured' && capture.pipelineState !== 'proposalFailed')) return;
          const requested = perform({ type: 'proposalRequested', captureId });
          if (!requested || requested.status === 'failure') return;
          dispatch({ type: 'setCapturing', value: true });
          await requestProposals(captureId, service);
        })
        .finally(() => {
          queuedCaptureIds.current.delete(captureId);
          dispatch({ type: 'setCapturing', value: false });
        });
      proposalQueue.current = job.then(() => undefined, () => undefined);
    }

    function enqueueCapturedProposals() {
      dataRef.current.captures
        .filter((capture) => capture.pipelineState === 'captured')
        .forEach((capture) => enqueueProposal(capture.id));
    }

    return {
      data: state.data,
      hydrated: state.hydrated,
      recoveryFailure: state.recoveryFailure,
      persistenceFailure: state.persistenceFailure,
      capturing: state.capturing,
      proposalServiceKind: proposalService.kind ?? 'mock',
      lastActionFailure: state.lastActionFailure,
      async capture(text, source = 'webText') {
        const createdAt = now();
        const created = createCapture({ id: runtimeId('capture'), rawText: text, source, createdAt });
        if (created.status === 'failure') return created;
        const transition = perform({ type: 'captureCreated', capture: created.capture });
        if (!transition || transition.status === 'failure') {
          return transition?.status === 'failure'
            ? { status: 'failure', failure: transition.failure }
            : { status: 'failure', failure: { code: 'proposal_unavailable', message: '本地数据尚未载入完成。', retryable: true } };
        }
        const persisted = await enqueuePersistence(JSON.stringify(transition.data));
        if (!persisted) return { status: 'failure', failure: { code: 'proposal_unavailable', message: '本地保存失败，输入仍保留在当前页面，请先重试保存。', retryable: true } };
        enqueueProposal(created.capture.id);
        return { status: 'success' };
      },
      async retryCapture(captureId) {
        const capture = dataRef.current.captures.find((item) => item.id === captureId);
        if (!capture || capture.pipelineState !== 'proposalFailed') {
          return { status: 'failure', failure: { code: 'invalid_proposal', message: '这条捕捉当前不能重试。', retryable: false } };
        }
        enqueueProposal(captureId);
        return { status: 'success' };
      },
      async retryCaptureWithLocalRules(captureId) {
        const capture = dataRef.current.captures.find((item) => item.id === captureId);
        if (!capture || capture.pipelineState !== 'proposalFailed') {
          return { status: 'failure', failure: { code: 'invalid_proposal', message: '这条捕捉当前不能使用本地规则重试。', retryable: false } };
        }
        enqueueProposal(captureId, localProposalService);
        return { status: 'success' };
      },
      submitUserDecision(decision) {
        perform({ type: 'submitUserDecision', decisionId: runtimeId('decision'), decision, at: now() });
      },
      undoLastDecision() {
        const decision = selectLatestUndoableDecision(state.data);
        if (decision) perform({ type: 'undoUserDecision', decisionId: decision.id, at: now() });
      },
      startTask(taskId, previousTimeDecision) { perform({ type: 'startTask', taskId, at: now(), previousTimeDecision }); },
      pauseTask(taskId, timeDecision) { perform({ type: 'pauseTask', taskId, at: now(), timeDecision }); },
      completeTask(taskId, timeDecision) { perform({ type: 'completeTask', taskId, at: now(), timeDecision }); },
      restoreTask(taskId) { perform({ type: 'restoreTask', taskId }); },
      updateTaskDetails(taskId, details) { perform({ type: 'updateTaskDetails', taskId, ...details }); },
      moveTask(taskId, bucket) { perform({ type: 'moveTask', taskId, bucket, at: now() }); },
      updateWaitingFollowUp(taskId, followUpDate) { perform({ type: 'updateWaitingFollowUp', taskId, followUpDate }); },
      recordTime(taskId, minutes) { perform({ type: 'recordTime', taskId, minutes, at: now() }); },
      correctTimeEntry(timeEntryId, actualMinutes) { perform({ type: 'correctTimeEntry', timeEntryId, actualMinutes, at: now() }); },
      recordProgress(taskId, text) { perform({ type: 'recordProgress', taskId, text, kind: 'progress', at: now() }); },
      recordInterruption(taskId, text) { perform({ type: 'recordInterruption', taskId, text: text.trim() || '突发事项打断当前任务', at: now() }); },
      planTaskForDate(taskId, date) { perform({ type: 'planTaskForDate', taskId, date, at: now() }); },
      scheduleTask(taskId, startAt, endAt, options) { perform({ type: 'scheduleTask', taskId, startAt, endAt, allowConflict: options?.allowConflict, at: now() }); },
      unscheduleTask(taskId) { perform({ type: 'unscheduleTask', taskId, at: now() }); },
      deferTask(taskId, destination) { perform({ type: 'deferTask', taskId, destination, at: now() }); },
      deleteTask(taskId) { perform({ type: 'deleteTask', taskId, at: now() }); },
      reorderTasks(taskIds) { perform({ type: 'reorderTasks', taskIds }); },
      exportBackup() { return serializeBackup(state.data); },
      async retryPersistence() {
        const persisted = await enqueuePersistence(JSON.stringify(dataRef.current));
        if (persisted) enqueueCapturedProposals();
      },
      async importBackup(raw) {
        const parsed = parseBackup(raw);
        if (parsed.status === 'failure') return { status: 'failure', failure: { code: 'invalid_backup', message: parsed.message, retryable: false } };
        const current = JSON.stringify(dataRef.current);
        const incoming = JSON.stringify(parsed.data);
        try {
          await AsyncStorage.setItem(RECOVERY_KEY, current);
          await AsyncStorage.setItem(PERSISTENCE_KEY, incoming);
          lastPersistedSnapshot.current = incoming;
          setPersistenceFailure(false);
          skipNextPersistence.current = true;
          dataRef.current = parsed.data;
          dispatch({ type: 'reset', data: parsed.data });
          return { status: 'success', counts: parsed.counts };
        } catch {
          return { status: 'failure', failure: { code: 'invalid_backup', message: '写入备份失败，现有数据保持不变。', retryable: true } };
        }
      },
      startEmpty() {
        const data = createEmptyData();
        dataRef.current = data;
        dispatch({ type: 'reset', data });
      },
      async resetDemo() {
        const current = JSON.stringify(dataRef.current);
        const data = createSeedData();
        const incoming = JSON.stringify(data);
        latestPersistenceSnapshot.current = incoming;
        const replacement = persistenceQueue.current
          .catch(() => undefined)
          .then(async () => {
            await AsyncStorage.setItem(RECOVERY_KEY, current);
            await AsyncStorage.setItem(PERSISTENCE_KEY, incoming);
          });
        persistenceQueue.current = replacement.then(() => undefined, () => undefined);
        try {
          await replacement;
          lastPersistedSnapshot.current = incoming;
          setPersistenceFailure(false);
          dataRef.current = data;
          dispatch({ type: 'reset', data });
          return { status: 'success' };
        } catch {
          latestPersistenceSnapshot.current = current;
          setPersistenceFailure(true);
          return { status: 'failure', failure: { code: 'invalid_backup', message: '加载演示数据失败，个人数据保持不变。', retryable: true } };
        }
      },
    };
  }, [enqueuePersistence, proposalService, setPersistenceFailure, state]);

  return <ReflowContext.Provider value={value}>{children}</ReflowContext.Provider>;
}

export function useReflowStore(): ReflowStoreValue {
  const value = useContext(ReflowContext);
  if (!value) throw new Error('useReflowStore must be used inside ReflowProvider');
  return value;
}
