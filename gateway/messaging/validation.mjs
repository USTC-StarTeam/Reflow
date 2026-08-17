import { EXTERNAL_TRUST, OPTIONAL_CAPABILITIES, QUERYABLE_MODE } from './contracts.mjs';
import { messagingError } from './errors.mjs';

const DESCRIPTOR_KEYS = ['capabilities', 'id', 'mode', 'provider', 'source'];
const REF_KEYS = ['accountId', 'externalId', 'provider', 'source'];
const SUMMARY_REQUIRED_KEYS = ['hasAttachments', 'kind', 'occurredAt', 'ref', 'schemaVersion', 'trust'];
const SUMMARY_OPTIONAL_KEYS = ['actor', 'openUrl', 'preview', 'providerHints', 'threadRef', 'title'];
const DETAIL_REQUIRED_KEYS = [...SUMMARY_REQUIRED_KEYS, 'attachments', 'content'];
const ACTOR_KEYS = ['address', 'displayName'];
const CONTENT_KEYS = ['text', 'truncated'];
const PAGE_KEYS = ['items', 'nextCursor'];
const HEALTH_KEYS = ['status'];
const SENSITIVE_HINT_KEY = /(authorization|cookie|credential|password|secret|token)/i;

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function isBoundedString(value, maxLength, { allowEmpty = false } = {}) {
  return typeof value === 'string' && value.length <= maxLength && (allowEmpty || value.length > 0);
}

function isSafeIdentifier(value) {
  return isBoundedString(value, 80) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isOccurredAt(value) {
  return isBoundedString(value, 40)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isHttpUrl(value) {
  if (!isBoundedString(value, 2_048)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.username === ''
      && parsed.password === '';
  } catch {
    return false;
  }
}

function providerFailure() {
  throw messagingError('provider_error');
}

export function validateConnectorDescriptor(descriptor) {
  if (!hasExactKeys(descriptor, DESCRIPTOR_KEYS)
    || !isSafeIdentifier(descriptor.id)
    || !isSafeIdentifier(descriptor.source)
    || !isSafeIdentifier(descriptor.provider)
    || descriptor.mode !== QUERYABLE_MODE
    || !Array.isArray(descriptor.capabilities)
    || descriptor.capabilities.length > 20
    || descriptor.capabilities.some((capability) => !isSafeIdentifier(capability))
    || new Set(descriptor.capabilities).size !== descriptor.capabilities.length) {
    throw new TypeError('Invalid queryable connector descriptor.');
  }
  return Object.freeze({
    ...descriptor,
    capabilities: Object.freeze([...descriptor.capabilities]),
  });
}

export function validateProviderHintKeys(value = []) {
  if (!Array.isArray(value)
    || value.length > 20
    || value.some((key) => !isSafeIdentifier(key) || SENSITIVE_HINT_KEY.test(key))
    || new Set(value).size !== value.length) {
    throw new TypeError('Invalid provider hint allow-list.');
  }
  return Object.freeze([...value]);
}

export function validateProviderHints(value, allowedKeys) {
  if (!isRecord(value)) providerFailure();
  const allowed = new Set(allowedKeys);
  const keys = Object.keys(value);
  if (keys.length > 20) providerFailure();
  for (const key of keys) {
    if (!allowed.has(key) || SENSITIVE_HINT_KEY.test(key)) providerFailure();
    const hint = value[key];
    if (typeof hint === 'string') {
      if (!isBoundedString(hint, 256, { allowEmpty: true })) providerFailure();
      continue;
    }
    if (typeof hint === 'number') {
      if (!Number.isFinite(hint)) providerFailure();
      continue;
    }
    if (typeof hint === 'boolean') continue;
    if (Array.isArray(hint)
      && hint.length <= 20
      && hint.every((item) => isBoundedString(item, 128, { allowEmpty: true }))) continue;
    providerFailure();
  }
  return value;
}

function validateRef(ref, binding) {
  if (!hasExactKeys(ref, REF_KEYS)
    || !isBoundedString(ref.source, 80)
    || !isBoundedString(ref.provider, 80)
    || !isBoundedString(ref.accountId, 160)
    || !isBoundedString(ref.externalId, 512)
    || ref.source !== binding.source
    || ref.provider !== binding.provider
    || ref.accountId !== binding.accountId
    || (binding.externalId !== undefined && ref.externalId !== binding.externalId)) providerFailure();
}

function validateActor(actor) {
  if (!hasExactKeys(actor, [], ACTOR_KEYS) || Object.keys(actor).length === 0) providerFailure();
  if (actor.displayName !== undefined && !isBoundedString(actor.displayName, 256)) providerFailure();
  if (actor.address !== undefined && !isBoundedString(actor.address, 320)) providerFailure();
}

function validateSummaryFields(item, binding, providerHintKeys, capabilities) {
  validateRef(item.ref, binding);
  if (item.schemaVersion !== 1
    || !isBoundedString(item.kind, 80)
    || !isOccurredAt(item.occurredAt)
    || typeof item.hasAttachments !== 'boolean'
    || item.trust !== EXTERNAL_TRUST) providerFailure();
  if (item.title !== undefined && !isBoundedString(item.title, 512)) providerFailure();
  if (item.preview !== undefined && !isBoundedString(item.preview, 1_000, { allowEmpty: true })) providerFailure();
  if (item.threadRef !== undefined
    && (!capabilities.includes(OPTIONAL_CAPABILITIES.THREAD_REF) || !isBoundedString(item.threadRef, 512))) providerFailure();
  if (item.openUrl !== undefined
    && (!capabilities.includes(OPTIONAL_CAPABILITIES.DEEP_LINK) || !isHttpUrl(item.openUrl))) providerFailure();
  if (item.actor !== undefined) validateActor(item.actor);
  if (item.providerHints !== undefined) validateProviderHints(item.providerHints, providerHintKeys);
}

export function validateExternalItemSummary(item, binding, providerHintKeys = [], capabilities = []) {
  if (!hasExactKeys(item, SUMMARY_REQUIRED_KEYS, SUMMARY_OPTIONAL_KEYS)) providerFailure();
  validateSummaryFields(item, binding, providerHintKeys, capabilities);
  return item;
}

export function validateExternalItemDetail(item, binding, providerHintKeys = [], capabilities = []) {
  if (!hasExactKeys(item, DETAIL_REQUIRED_KEYS, SUMMARY_OPTIONAL_KEYS)) providerFailure();
  validateSummaryFields(item, binding, providerHintKeys, capabilities);
  if (!hasExactKeys(item.content, CONTENT_KEYS)
    || !isBoundedString(item.content.text, 1_000_000, { allowEmpty: true })
    || typeof item.content.truncated !== 'boolean'
    || !Array.isArray(item.attachments)
    || item.attachments.length > 1_000) providerFailure();
  for (const attachment of item.attachments) {
    if (!hasExactKeys(attachment, ['name'], ['contentType', 'size'])
      || !isBoundedString(attachment.name, 512)
      || (attachment.contentType !== undefined && !isBoundedString(attachment.contentType, 256))
      || (attachment.size !== undefined && (!Number.isSafeInteger(attachment.size) || attachment.size < 0))) providerFailure();
  }
  return item;
}

export function validateExternalItemPage(page, binding, providerHintKeys = [], capabilities = [], maxItems = 100) {
  if (!hasExactKeys(page, PAGE_KEYS)
    || !Array.isArray(page.items)
    || page.items.length > maxItems
    || !(page.nextCursor === null || isBoundedString(page.nextCursor, 512))
    || (page.nextCursor !== null && !capabilities.includes(OPTIONAL_CAPABILITIES.PAGINATION))) providerFailure();
  for (const item of page.items) validateExternalItemSummary(item, binding, providerHintKeys, capabilities);
  return page;
}

export function validateConnectionHealth(health) {
  if (!hasExactKeys(health, HEALTH_KEYS) || health.status !== 'ready') providerFailure();
  return health;
}
