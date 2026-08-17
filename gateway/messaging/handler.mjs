import { performance } from 'node:perf_hooks';

import { MESSAGING_SCHEMA_VERSION, OPTIONAL_CAPABILITIES } from './contracts.mjs';
import { MessagingError, messagingError, serializeMessagingError } from './errors.mjs';
import {
  validateConnectionHealth,
  validateExternalItemDetail,
  validateExternalItemPage,
} from './validation.mjs';

function safeJson(res, statusCode, body, origin = '') {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

function requiredParameter(searchParams, name, maxLength) {
  const values = searchParams.getAll(name);
  if (values.length !== 1 || values[0].length === 0 || values[0].length > maxLength) {
    throw messagingError('invalid_request');
  }
  return values[0];
}

function optionalParameter(searchParams, name, maxLength) {
  const values = searchParams.getAll(name);
  if (values.length > 1 || (values.length === 1 && (values[0].length === 0 || values[0].length > maxLength))) {
    throw messagingError('invalid_request');
  }
  return values[0];
}

function requireOnlyParameters(searchParams, allowed) {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw messagingError('invalid_request');
  }
}

function parseLimit(searchParams) {
  const rawLimit = optionalParameter(searchParams, 'limit', 3);
  if (rawLimit === undefined) return 20;
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw messagingError('invalid_request');
  return limit;
}

function connectorFor(registry, connectorId) {
  const connector = registry.getConnector(connectorId);
  if (!connector) throw messagingError('unknown_connector');
  return connector;
}

function requireCapability(connector, requestValue, capability) {
  if (requestValue !== undefined && !connector.descriptor.capabilities.includes(capability)) {
    throw messagingError('unsupported_capability');
  }
}

function connectorIdFromHealthPath(pathname) {
  const match = /^\/v1\/messaging\/connectors\/([^/]+)\/health$/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw messagingError('invalid_request');
  }
}

async function invokeProvider(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MessagingError) throw error;
    throw messagingError('provider_error');
  }
}

export function createMessagingHandler({ config, registry, logger = console }) {
  const allowedOrigins = new Set(config.allowedOrigins);
  return async function messagingHandler(req, res) {
    const started = performance.now();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : '';
    let resultStatus = 'unknown';
    try {
      if (origin && !allowedOrigin) {
        const failure = serializeMessagingError(messagingError('messaging_unavailable'));
        safeJson(res, 403, { ...failure.body, error: { ...failure.body.error, retryable: false } });
        resultStatus = 'origin_rejected';
        return;
      }
      if (req.method === 'OPTIONS') {
        if (allowedOrigin) {
          res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        }
        res.statusCode = 204;
        res.end();
        resultStatus = 'preflight';
        return;
      }
      if (req.method !== 'GET') throw messagingError('invalid_request');

      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/v1/messaging/connectors') {
        requireOnlyParameters(url.searchParams, new Set());
        safeJson(res, 200, {
          status: 'success',
          schemaVersion: MESSAGING_SCHEMA_VERSION,
          connectors: registry.listDescriptors(),
        }, allowedOrigin);
        resultStatus = 'connectors';
        return;
      }

      const healthConnectorId = connectorIdFromHealthPath(url.pathname);
      if (healthConnectorId !== undefined) {
        requireOnlyParameters(url.searchParams, new Set(['accountId']));
        const accountId = requiredParameter(url.searchParams, 'accountId', 160);
        const connector = connectorFor(registry, healthConnectorId);
        const health = validateConnectionHealth(await invokeProvider(() => connector.probe({ accountId })));
        safeJson(res, 200, {
          status: 'success',
          schemaVersion: MESSAGING_SCHEMA_VERSION,
          health,
        }, allowedOrigin);
        resultStatus = 'health';
        return;
      }

      if (url.pathname === '/v1/messaging/items') {
        requireOnlyParameters(url.searchParams, new Set(['connectorId', 'accountId', 'limit', 'cursor', 'query']));
        const connectorId = requiredParameter(url.searchParams, 'connectorId', 80);
        const accountId = requiredParameter(url.searchParams, 'accountId', 160);
        const cursor = optionalParameter(url.searchParams, 'cursor', 512);
        const query = optionalParameter(url.searchParams, 'query', 512);
        const limit = parseLimit(url.searchParams);
        const connector = connectorFor(registry, connectorId);
        requireCapability(connector, query, OPTIONAL_CAPABILITIES.SEARCH);
        requireCapability(connector, cursor, OPTIONAL_CAPABILITIES.PAGINATION);
        const page = validateExternalItemPage(
          await invokeProvider(() => connector.listItems({ accountId, limit, cursor, query })),
          { source: connector.descriptor.source, provider: connector.descriptor.provider, accountId },
          connector.providerHintKeys,
          limit,
        );
        safeJson(res, 200, {
          status: 'success',
          schemaVersion: MESSAGING_SCHEMA_VERSION,
          items: page.items,
          nextCursor: page.nextCursor,
        }, allowedOrigin);
        resultStatus = 'items';
        return;
      }

      if (url.pathname === '/v1/messaging/items/detail') {
        requireOnlyParameters(url.searchParams, new Set(['connectorId', 'accountId', 'externalId']));
        const connectorId = requiredParameter(url.searchParams, 'connectorId', 80);
        const accountId = requiredParameter(url.searchParams, 'accountId', 160);
        const externalId = requiredParameter(url.searchParams, 'externalId', 512);
        const connector = connectorFor(registry, connectorId);
        const item = validateExternalItemDetail(
          await invokeProvider(() => connector.getItem({ accountId, externalId })),
          { source: connector.descriptor.source, provider: connector.descriptor.provider, accountId, externalId },
          connector.providerHintKeys,
        );
        safeJson(res, 200, {
          status: 'success',
          schemaVersion: MESSAGING_SCHEMA_VERSION,
          item,
        }, allowedOrigin);
        resultStatus = 'detail';
        return;
      }

      const missing = serializeMessagingError(messagingError('invalid_request'));
      safeJson(res, missing.statusCode, missing.body, allowedOrigin);
      resultStatus = 'not_found';
    } catch (error) {
      const failure = serializeMessagingError(error);
      if (!res.headersSent) safeJson(res, failure.statusCode, failure.body, allowedOrigin);
      else res.end();
      resultStatus = error instanceof MessagingError ? error.code : 'messaging_unavailable';
    } finally {
      logger.info?.({
        event: 'messaging_request',
        status: resultStatus,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  };
}
