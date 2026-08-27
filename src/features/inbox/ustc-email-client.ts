export interface UstcEmailSender {
  name: string;
  address: string;
}

export interface UstcEmailSummary {
  id: string;
  uid: number;
  messageId: string | null;
  subject: string;
  from: UstcEmailSender;
  receivedAt: string | null;
  seen: boolean;
}

export interface UstcEmailDetail extends UstcEmailSummary {
  body: string;
}

export interface UstcEmailClient {
  listRecent(): Promise<UstcEmailSummary[]>;
  getDetail(uid: number): Promise<UstcEmailDetail>;
}

type EmailFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface EmailFailureEnvelope {
  status: 'failure';
  error: { code: string; message: string; retryable: boolean };
}

export class UstcEmailClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UstcEmailClientError';
  }
}

function gatewayUrl(): string {
  return (process.env.EXPO_PUBLIC_EMAIL_GATEWAY_URL?.trim()
    || process.env.EXPO_PUBLIC_AI_GATEWAY_URL?.trim()
    || 'http://127.0.0.1:8787').replace(/\/+$/, '');
}

function isFailureEnvelope(value: unknown): value is EmailFailureEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EmailFailureEnvelope>;
  return envelope.status === 'failure'
    && typeof envelope.error?.message === 'string'
    && typeof envelope.error.code === 'string'
    && typeof envelope.error.retryable === 'boolean';
}

function isSender(value: unknown): value is UstcEmailSender {
  return !!value && typeof value === 'object'
    && typeof (value as UstcEmailSender).name === 'string'
    && typeof (value as UstcEmailSender).address === 'string';
}

function isSummary(value: unknown): value is UstcEmailSummary {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<UstcEmailSummary>;
  return typeof message.id === 'string'
    && Number.isSafeInteger(message.uid)
    && (message.messageId === null || typeof message.messageId === 'string')
    && typeof message.subject === 'string'
    && isSender(message.from)
    && (message.receivedAt === null || typeof message.receivedAt === 'string')
    && typeof message.seen === 'boolean';
}

export function createUstcEmailClient({ baseUrl = gatewayUrl(), fetchImpl = globalThis.fetch }: { baseUrl?: string; fetchImpl?: EmailFetch } = {}): UstcEmailClient {
  const root = baseUrl.trim().replace(/\/+$/, '');

  async function request(path: string): Promise<unknown> {
    try {
      const response = await fetchImpl(`${root}${path}`, { method: 'GET' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (isFailureEnvelope(body)) throw new UstcEmailClientError(body.error.message);
        throw new UstcEmailClientError('学校邮箱服务暂时不可用。');
      }
      return body;
    } catch (error) {
      if (error instanceof UstcEmailClientError) throw error;
      throw new UstcEmailClientError('无法连接本地 Gateway，请确认服务已经启动。');
    }
  }

  return Object.freeze({
    async listRecent() {
      const body = await request('/messages') as { status?: unknown; messages?: unknown };
      if (body?.status !== 'success' || !Array.isArray(body.messages) || !body.messages.every(isSummary)) {
        throw new UstcEmailClientError('最近邮件返回格式无效。');
      }
      return body.messages;
    },
    async getDetail(uid: number) {
      const body = await request(`/messages/${encodeURIComponent(String(uid))}`) as { status?: unknown; message?: unknown };
      if (body?.status !== 'success' || !isSummary(body.message) || typeof (body.message as UstcEmailDetail).body !== 'string') {
        throw new UstcEmailClientError('邮件详情返回格式无效。');
      }
      return body.message as UstcEmailDetail;
    },
  });
}
