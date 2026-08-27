const DEFINITIONS = Object.freeze({
  credentials_missing: { status: 503, retryable: false, message: '学校邮箱尚未配置。' },
  authentication_failed: { status: 401, retryable: false, message: '学校邮箱认证失败，请检查客户端专用密码。' },
  network_failed: { status: 503, retryable: true, message: '暂时无法连接学校邮箱。' },
  mailbox_failed: { status: 502, retryable: true, message: '暂时无法以只读方式打开学校邮箱。' },
  list_failed: { status: 502, retryable: true, message: '最近邮件读取失败。' },
  detail_failed: { status: 502, retryable: true, message: '邮件正文读取失败。' },
  message_not_found: { status: 404, retryable: false, message: '未找到这封邮件。' },
  email_unavailable: { status: 500, retryable: true, message: '学校邮箱服务暂时不可用。' },
});

export class UstcEmailError extends Error {
  constructor(code) {
    if (!DEFINITIONS[code]) throw new Error(`Unknown USTC email error code: ${code}`);
    super(code);
    this.name = 'UstcEmailError';
    this.code = code;
  }
}

export function emailError(code) {
  return new UstcEmailError(code);
}

export function serializeEmailError(error) {
  const code = error instanceof UstcEmailError ? error.code : 'email_unavailable';
  const definition = DEFINITIONS[code] ?? DEFINITIONS.email_unavailable;
  return {
    statusCode: definition.status,
    body: {
      status: 'failure',
      error: { code, message: definition.message, retryable: definition.retryable },
    },
  };
}
