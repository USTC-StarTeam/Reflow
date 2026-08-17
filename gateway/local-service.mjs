import { createGatewayHandler } from './app.mjs';
import { createFakeQueryableConnector } from './messaging/connectors/fake.mjs';
import { createMessagingHandler } from './messaging/handler.mjs';
import { createConnectorRegistry } from './messaging/registry.mjs';

export function createLocalServiceHandler({ config, fetchImpl = fetch, logger = console, connectorRegistry } = {}) {
  const registry = connectorRegistry ?? createConnectorRegistry([createFakeQueryableConnector()]);
  const aiHandler = createGatewayHandler({ config, fetchImpl, logger });
  const messagingHandler = createMessagingHandler({ config, registry, logger });
  return function localServiceHandler(req, res) {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/v1/messaging' || pathname.startsWith('/v1/messaging/')) {
      return messagingHandler(req, res);
    }
    return aiHandler(req, res);
  };
}
