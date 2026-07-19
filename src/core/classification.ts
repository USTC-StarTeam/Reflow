import type { AIProposal, ProposalEdit, SuggestedBucket, TaskCategory, VisibleClassification } from './types';

export function isTaskCategory(value: VisibleClassification): value is TaskCategory {
  return value === 'work'
    || value === 'communication'
    || value === 'learning'
    || value === 'life'
    || value === 'health'
    || value === 'unknown';
}

export function resolveProposalVisibleClassification(proposal: AIProposal, edit?: ProposalEdit): VisibleClassification {
  if (edit?.visibleClassification) return edit.visibleClassification;
  if (proposal.outcome === 'knowledge') return 'knowledge';
  if (proposal.suggestedBucket === 'waiting') return 'waiting';
  if (proposal.suggestedBucket === 'someday') return 'someday';
  return proposal.category;
}

export function categoryForVisibleClassification(classification: VisibleClassification, fallback: TaskCategory): TaskCategory {
  return isTaskCategory(classification) ? classification : fallback;
}

export function defaultSuggestedBucket(classification: VisibleClassification): SuggestedBucket {
  if (classification === 'waiting') return 'waiting';
  if (classification === 'someday') return 'someday';
  return 'today';
}
