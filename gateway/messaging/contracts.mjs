export const MESSAGING_SCHEMA_VERSION = 1;
export const QUERYABLE_MODE = 'queryable';
export const EXTERNAL_TRUST = 'untrustedExternal';

export const OPTIONAL_CAPABILITIES = Object.freeze({
  SEARCH: 'search',
  PAGINATION: 'pagination',
  DEEP_LINK: 'deepLink',
  THREAD_REF: 'threadRef',
});

/**
 * @typedef {object} ConnectorDescriptor
 * @property {string} id
 * @property {string} source
 * @property {string} provider
 * @property {'queryable'} mode
 * @property {string[]} capabilities
 */
/**
 * @typedef {object} ExternalRef
 * @property {string} source
 * @property {string} provider
 * @property {string} accountId
 * @property {string} externalId
 */

/**
 * @typedef {object} QueryableSourceConnector
 * @property {ConnectorDescriptor} descriptor
 * @property {string[]=} providerHintKeys
 * @property {(input: {accountId: string}) => Promise<{status: 'ready'}>} probe
 * @property {(input: {accountId: string, limit: number, cursor?: string, query?: string}) => Promise<object>} listItems
 * @property {(input: {accountId: string, externalId: string}) => Promise<object>} getItem
 */
