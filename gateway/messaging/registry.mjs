import { validateConnectorDescriptor, validateProviderHintKeys } from './validation.mjs';

function validateConnector(connector) {
  if (!connector || typeof connector !== 'object'
    || typeof connector.probe !== 'function'
    || typeof connector.listItems !== 'function'
    || typeof connector.getItem !== 'function') {
    throw new TypeError('Invalid queryable connector.');
  }
  return Object.freeze({
    descriptor: validateConnectorDescriptor(connector.descriptor),
    providerHintKeys: validateProviderHintKeys(connector.providerHintKeys),
    probe: connector.probe.bind(connector),
    listItems: connector.listItems.bind(connector),
    getItem: connector.getItem.bind(connector),
  });
}

export function createConnectorRegistry(connectors) {
  if (!Array.isArray(connectors)) throw new TypeError('Connectors must be an array.');
  const connectorMap = new Map();
  for (const candidate of connectors) {
    const connector = validateConnector(candidate);
    if (connectorMap.has(connector.descriptor.id)) {
      throw new TypeError(`Duplicate connector id: ${connector.descriptor.id}`);
    }
    connectorMap.set(connector.descriptor.id, connector);
  }
  const descriptors = Object.freeze([...connectorMap.values()].map((connector) => connector.descriptor));
  return Object.freeze({
    getConnector(id) {
      return connectorMap.get(id);
    },
    listDescriptors() {
      return descriptors;
    },
  });
}
