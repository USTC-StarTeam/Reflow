import { readFile } from 'node:fs/promises';

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} 必须是正整数。`);
  return parsed;
}

export async function loadDevVars(path = new URL('./.dev.vars', import.meta.url)) {
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
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function readGatewayConfig(env = process.env) {
  const baseUrl = String(env.OPENAI_BASE_URL ?? env.OPENAI_API_BASE ?? 'https://api.chatanywhere.tech/v1').replace(/\/+$/, '');
  const allowedOrigins = String(env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:8081,http://localhost:8081,http://127.0.0.1:8082,http://localhost:8082')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    enabled: parseBoolean(env.AI_ENABLED, true),
    apiKey: String(env.OPENAI_API_KEY ?? ''),
    responsesUrl: String(env.OPENAI_RESPONSES_URL ?? `${baseUrl}/responses`),
    model: String(env.OPENAI_MODEL ?? 'gpt-5.6-terra'),
    reasoningEffort: String(env.OPENAI_REASONING_EFFORT ?? 'high'),
    upstreamTimeoutMs: parsePositiveInteger(env.GATEWAY_UPSTREAM_TIMEOUT_MS, 15_000, 'GATEWAY_UPSTREAM_TIMEOUT_MS'),
    maxOutputTokens: parsePositiveInteger(env.GATEWAY_MAX_OUTPUT_TOKENS, 4_096, 'GATEWAY_MAX_OUTPUT_TOKENS'),
    maxBodyBytes: parsePositiveInteger(env.GATEWAY_MAX_BODY_BYTES, 8_192, 'GATEWAY_MAX_BODY_BYTES'),
    port: parsePositiveInteger(env.PORT, 8_787, 'PORT'),
    host: String(env.HOST ?? '127.0.0.1'),
    allowedOrigins,
  };
}
