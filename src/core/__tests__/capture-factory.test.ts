import { describe, expect, it } from '@jest/globals';

import { createCapture, createWebTextCapture } from '../capture-factory';

describe('Capture Factory', () => {
  it('turns Web text into an InboxCapture pipeline input', () => {
    const result = createWebTextCapture({ id: 'capture-web', rawText: '  回复客户  ', createdAt: '2026-07-17T08:00:00.000Z' });
    expect(result).toEqual({ status: 'success', capture: { id: 'capture-web', rawText: '回复客户', source: 'webText', createdAt: '2026-07-17T08:00:00.000Z', pipelineState: 'captured' } });
  });

  it('returns a structured validation failure for blank text', () => {
    expect(createWebTextCapture({ id: 'capture-empty', rawText: ' ', createdAt: '2026-07-17T08:00:00.000Z' })).toMatchObject({ status: 'failure', failure: { code: 'empty_capture', retryable: false } });
  });

  it('represents future input sources without changing the pipeline shape', () => {
    const result = createCapture({ id: 'capture-voice', rawText: '买药', source: 'voice', createdAt: '2026-07-17T08:00:00.000Z' });
    expect(result).toMatchObject({ status: 'success', capture: { source: 'voice', pipelineState: 'captured' } });
  });

  it('uses the existing Capture shape for imported email content', () => {
    const result = createCapture({ id: 'capture-email', rawText: '邮件标题：下周组会', source: 'email', createdAt: '2026-08-27T08:00:00.000Z' });
    expect(result).toMatchObject({ status: 'success', capture: { source: 'email', pipelineState: 'captured' } });
  });
});
