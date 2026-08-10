import { readFile } from 'node:fs/promises';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEFAULT_DEEPSEEK_REASONING_EFFORT = 'high';
export const DEFAULT_LEGACY_OPENAI_BASE_URL = 'https://api.chatanywhere.tech/v1';
export const DEFAULT_LEGACY_OPENAI_MODEL = 'gpt-5.6-terra';
export const DEFAULT_LEGACY_OPENAI_REASONING_EFFORT = 'high';

const deepSeekKeys = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_RESPONSES_URL',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_REASONING_EFFORT',
];
const legacyOpenAIKeys = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_RESPONSES_URL',
  'OPENAI_MODEL',
  'OPENAI_REASONING_EFFORT',
];

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

function parseDiagnosticsEnabled(value) {
  return ['true', '1', 'on', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} 必须是正整数。`);
  return parsed;
}

export async function loadDevVars(path = new URL('./.dev.vars', import.meta.url), env = process.env) {
  try {
    const content = await readFile(path, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (env[key] === undefined) env[key] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function readResponsesProviderConfig(env = process.env) {
  const deepSeekConfigured = deepSeekKeys.some((key) => env[key] !== undefined);
  const legacyOpenAIConfigured = legacyOpenAIKeys.some((key) => env[key] !== undefined);
  const useDeepSeek = deepSeekConfigured || !legacyOpenAIConfigured;
  const namespace = useDeepSeek
    ? {
        apiKey: env.DEEPSEEK_API_KEY,
        baseUrl: env.DEEPSEEK_BASE_URL,
        responsesUrl: env.DEEPSEEK_RESPONSES_URL,
        model: env.DEEPSEEK_MODEL,
        reasoningEffort: env.DEEPSEEK_REASONING_EFFORT,
      }
    : {
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL ?? env.OPENAI_API_BASE,
        responsesUrl: env.OPENAI_RESPONSES_URL,
        model: env.OPENAI_MODEL,
        reasoningEffort: env.OPENAI_REASONING_EFFORT,
      };
  const defaults = useDeepSeek
    ? {
        baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
        model: DEFAULT_DEEPSEEK_MODEL,
        reasoningEffort: DEFAULT_DEEPSEEK_REASONING_EFFORT,
      }
    : {
        baseUrl: DEFAULT_LEGACY_OPENAI_BASE_URL,
        model: DEFAULT_LEGACY_OPENAI_MODEL,
        reasoningEffort: DEFAULT_LEGACY_OPENAI_REASONING_EFFORT,
      };
  const baseUrl = String(namespace.baseUrl ?? defaults.baseUrl).replace(/\/+$/, '');
  return {
    provider: useDeepSeek ? 'deepseek' : 'openai-compatible',
    apiKey: String(namespace.apiKey ?? ''),
    baseUrl,
    responsesUrl: String(namespace.responsesUrl ?? `${baseUrl}/responses`),
    model: String(namespace.model ?? defaults.model),
    reasoningEffort: String(namespace.reasoningEffort ?? defaults.reasoningEffort),
  };
}

export function readGatewayConfig(env = process.env) {
  const provider = readResponsesProviderConfig(env);
  const allowedOrigins = String(env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:8081,http://localhost:8081,http://127.0.0.1:8082,http://localhost:8082')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    enabled: parseBoolean(env.AI_ENABLED, true),
    diagnosticsEnabled: parseDiagnosticsEnabled(env.GATEWAY_DIAGNOSTICS_ENABLED),
    apiKey: provider.apiKey,
    responsesUrl: provider.responsesUrl,
    model: provider.model,
    reasoningEffort: provider.reasoningEffort,
    upstreamTimeoutMs: parsePositiveInteger(env.GATEWAY_UPSTREAM_TIMEOUT_MS, 15_000, 'GATEWAY_UPSTREAM_TIMEOUT_MS'),
    maxOutputTokens: parsePositiveInteger(env.GATEWAY_MAX_OUTPUT_TOKENS, 4_096, 'GATEWAY_MAX_OUTPUT_TOKENS'),
    maxBodyBytes: parsePositiveInteger(env.GATEWAY_MAX_BODY_BYTES, 8_192, 'GATEWAY_MAX_BODY_BYTES'),
    port: parsePositiveInteger(env.PORT, 8_787, 'PORT'),
    host: String(env.HOST ?? '127.0.0.1'),
    allowedOrigins,
  };
}
