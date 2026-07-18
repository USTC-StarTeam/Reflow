import type { CaptureSource, InboxCapture, PipelineFailure } from './types';

export type CaptureCreationResult =
  | { status: 'success'; capture: InboxCapture }
  | { status: 'failure'; failure: PipelineFailure };

export function createCapture(input: {
  id: string;
  rawText: string;
  source: CaptureSource;
  createdAt: string;
}): CaptureCreationResult {
  const rawText = input.rawText.trim();
  if (!rawText) {
    return {
      status: 'failure',
      failure: { code: 'empty_capture', message: '请先输入要捕捉的内容。', retryable: false },
    };
  }

  return {
    status: 'success',
    capture: {
      id: input.id,
      rawText,
      source: input.source,
      createdAt: input.createdAt,
      pipelineState: 'captured',
    },
  };
}

export function createWebTextCapture(input: Omit<Parameters<typeof createCapture>[0], 'source'>): CaptureCreationResult {
  return createCapture({ ...input, source: 'webText' });
}
