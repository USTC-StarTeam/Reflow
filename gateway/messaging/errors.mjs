const ERROR_DEFINITIONS = Object.freeze({
  invalid_request: { status: 400, retryable: false, message: '请求参数无效。' },
  unsupported_capability: { status: 400, retryable: false, message: 'Connector 不支持请求的能力。' },
  unknown_connector: { status: 404, retryable: false, message: '未找到指定的 Connector。' },
  account_not_found: { status: 404, retryable: false, message: '未找到指定的外部账户。' },
  item_not_found: { status: 404, retryable: false, message: '未找到指定的外部项目。' },
  provider_auth_error: { status: 502, retryable: false, message: '外部服务认证失败。' },
  network_error: { status: 503, retryable: true, message: '暂时无法连接外部服务。' },
  provider_error: { status: 502, retryable: false, message: '外部服务返回了无效结果。' },
  messaging_unavailable: { status: 500, retryable: true, message: 'Messaging Gateway 暂时不可用。' },
});

export class MessagingError extends Error {
  constructor(code) {
    if (!ERROR_DEFINITIONS[code]) throw new Error(`Unknown messaging error code: ${code}`);
    super(code);
    this.name = 'MessagingError';
    this.code = code;
  }
}

export function messagingError(code) {
  return new MessagingError(code);
}

export function serializeMessagingError(error, fallbackCode = 'messaging_unavailable') {
  const code = error instanceof MessagingError ? error.code : fallbackCode;
  const definition = ERROR_DEFINITIONS[code] ?? ERROR_DEFINITIONS.messaging_unavailable;
  return {
    statusCode: definition.status,
    body: {
      status: 'failure',
      error: {
        code,
        message: definition.message,
        retryable: definition.retryable,
      },
    },
  };
}
