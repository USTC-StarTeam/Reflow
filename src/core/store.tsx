import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useReducer } from 'react';

import { createSeedData } from './demo-data';
import { runtimeId } from './date-utils';
import { MockProposalService } from './mock-proposal-service';
import { parseStoredData, PERSISTENCE_KEY } from './persistence';
import { domainReducer, type DomainAction, type EditedProposal } from './reducer';
import type { DomainData, InboxCapture, ProgressKind, WorkflowBucket } from './types';

interface StoreState {
  data: DomainData;
  history: DomainData | null;
  lastDecisionLabel: string | null;
  hydrated: boolean;
  capturing: boolean;
}

type StoreAction =
  | { type: 'hydrate'; data: DomainData }
  | { type: 'setCapturing'; value: boolean }
  | { type: 'domain'; action: DomainAction; label?: string; remember?: boolean }
  | { type: 'undo' }
  | { type: 'reset'; data: DomainData };

export interface ReflowStoreValue {
  data: DomainData;
  hydrated: boolean;
  capturing: boolean;
  lastDecisionLabel: string | null;
  capture(text: string): Promise<void>;
  acceptProposal(id: string, edited: EditedProposal, bucket: WorkflowBucket): void;
  rejectProposal(id: string): void;
  undoLastDecision(): void;
  startTask(taskId: string): void;
  pauseTask(taskId: string): void;
  completeTask(taskId: string): void;
  moveTask(taskId: string, bucket: WorkflowBucket): void;
  recordTime(taskId: string, minutes: number): void;
  recordProgress(taskId: string, text: string): void;
  recordInterruption(taskId: string, text: string): void;
  scheduleTask(taskId: string, startAt: string, endAt: string): void;
  deleteTask(taskId: string): void;
  reorderTasks(taskIds: string[]): void;
  resetDemo(): void;
}

const proposalService = new MockProposalService();
const ReflowContext = createContext<ReflowStoreValue | null>(null);

function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, data: action.data, hydrated: true };
    case 'setCapturing':
      return { ...state, capturing: action.value };
    case 'domain':
      return {
        ...state,
        data: domainReducer(state.data, action.action),
        history: action.remember ? state.data : state.history,
        lastDecisionLabel: action.remember ? action.label ?? '上一步操作' : state.lastDecisionLabel,
      };
    case 'undo':
      return state.history
        ? { ...state, data: state.history, history: null, lastDecisionLabel: null }
        : state;
    case 'reset':
      return { ...state, data: action.data, history: null, lastDecisionLabel: null, hydrated: true, capturing: false };
    default:
      return state;
  }
}

const initialState: StoreState = {
  data: createSeedData(),
  history: null,
  lastDecisionLabel: null,
  hydrated: false,
  capturing: false,
};

export function ReflowProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(storeReducer, initialState);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PERSISTENCE_KEY)
      .then((raw) => {
        if (active) dispatch({ type: 'hydrate', data: parseStoredData(raw) });
      })
      .catch(() => {
        if (active) dispatch({ type: 'hydrate', data: createSeedData() });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    AsyncStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state.data)).catch(() => undefined);
  }, [state.data, state.hydrated]);

  const value = useMemo<ReflowStoreValue>(() => {
    const now = () => new Date().toISOString();
    const perform = (action: DomainAction, label?: string, remember = false) =>
      dispatch({ type: 'domain', action, label, remember });

    return {
      data: state.data,
      hydrated: state.hydrated,
      capturing: state.capturing,
      lastDecisionLabel: state.lastDecisionLabel,
      async capture(text: string) {
        const normalized = text.trim();
        if (!normalized || state.capturing) return;
        dispatch({ type: 'setCapturing', value: true });
        const capture: InboxCapture = {
          id: runtimeId('capture'),
          rawText: normalized,
          source: '手动输入',
          createdAt: now(),
          parseStatus: 'organizing',
        };
        try {
          const proposals = await proposalService.propose(capture, state.data.tasks);
          perform({ type: 'captureOrganized', capture, proposals });
        } finally {
          dispatch({ type: 'setCapturing', value: false });
        }
      },
      acceptProposal(id, edited, bucket) {
        perform({ type: 'acceptProposal', proposalId: id, edited, bucket, at: now() }, `已接受到“${bucket === 'today' ? '今天' : bucket === 'waiting' ? '等待他人' : '稍后处理'}”`, true);
      },
      rejectProposal(id) {
        perform({ type: 'rejectProposal', proposalId: id }, '已忽略一条建议', true);
      },
      undoLastDecision() { dispatch({ type: 'undo' }); },
      startTask(taskId) { perform({ type: 'startTask', taskId, at: now() }); },
      pauseTask(taskId) { perform({ type: 'pauseTask', taskId, at: now() }); },
      completeTask(taskId) { perform({ type: 'completeTask', taskId, at: now() }); },
      moveTask(taskId, bucket) { perform({ type: 'moveTask', taskId, bucket }); },
      recordTime(taskId, minutes) { perform({ type: 'recordTime', taskId, minutes, at: now() }); },
      recordProgress(taskId, text) {
        const normalized = text.trim();
        if (normalized) perform({ type: 'recordProgress', taskId, text: normalized, kind: 'progress' as ProgressKind, at: now() });
      },
      recordInterruption(taskId, text) {
        const normalized = text.trim() || '突发事项打断当前任务';
        perform({ type: 'recordInterruption', taskId, text: normalized, at: now() });
      },
      scheduleTask(taskId, startAt, endAt) { perform({ type: 'scheduleTask', taskId, startAt, endAt }); },
      deleteTask(taskId) { perform({ type: 'deleteTask', taskId }); },
      reorderTasks(taskIds) { perform({ type: 'reorderTasks', taskIds }); },
      resetDemo() {
        const data = createSeedData();
        dispatch({ type: 'reset', data });
        AsyncStorage.setItem(PERSISTENCE_KEY, JSON.stringify(data)).catch(() => undefined);
      },
    };
  }, [state]);

  return <ReflowContext.Provider value={value}>{children}</ReflowContext.Provider>;
}

export function useReflowStore(): ReflowStoreValue {
  const value = useContext(ReflowContext);
  if (!value) throw new Error('useReflowStore must be used inside ReflowProvider');
  return value;
}
