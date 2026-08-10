import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { readEvaluationProviderConfig } from '../../tools/proposal-eval/config.mjs';
import { schemaForOpenAI } from '../../tools/proposal-eval/lib.mjs';
import { loadDevVars, readGatewayConfig } from '../config.mjs';

describe('gateway config', () => {
  it('enables local diagnostics only for explicit strict opt-in values', () => {
    for (const [value, expected] of [
      ['true', true],
      ['1', true],
      ['on', true],
      ['yes', true],
      [' YES ', true],
      ['false', false],
      ['0', false],
      ['off', false],
      ['no', false],
      [undefined, false],
      ['', false],
      ['flase', false],
      ['enabled', false],
    ]) {
      assert.equal(
        readGatewayConfig({ GATEWAY_DIAGNOSTICS_ENABLED: value }).diagnosticsEnabled,
        expected,
        `expected ${String(value)} to be ${expected}`,
      );
    }
  });

  it('uses DeepSeek Responses defaults when no provider variables are configured', () => {
    const config = readGatewayConfig({});
    assert.equal(config.apiKey, '');
    assert.equal(config.responsesUrl, 'https://api.deepseek.com/responses');
    assert.equal(config.model, 'deepseek-v4-flash');
    assert.equal(config.reasoningEffort, 'high');
    assert.equal(readEvaluationProviderConfig({ env: {} }).provider, 'deepseek');
  });

  it('keeps DeepSeek configuration isolated from stale OPENAI variables', () => {
    const config = readGatewayConfig({
      DEEPSEEK_API_KEY: 'deepseek-test-key',
      OPENAI_API_KEY: 'legacy-test-key',
      OPENAI_BASE_URL: 'https://legacy.invalid/v1',
      OPENAI_RESPONSES_URL: 'https://legacy.invalid/v1/responses',
      OPENAI_MODEL: 'legacy-model',
      OPENAI_REASONING_EFFORT: 'high',
    });
    assert.equal(config.apiKey, 'deepseek-test-key');
    assert.equal(config.responsesUrl, 'https://api.deepseek.com/responses');
    assert.equal(config.model, 'deepseek-v4-flash');
    assert.equal(config.reasoningEffort, 'high');
  });

  it('uses provider-specific defaults so legacy keys are never sent to DeepSeek', () => {
    const legacy = readGatewayConfig({ OPENAI_API_KEY: 'legacy-test-key' });
    assert.equal(legacy.apiKey, 'legacy-test-key');
    assert.equal(legacy.responsesUrl, 'https://api.chatanywhere.tech/v1/responses');
    assert.equal(legacy.model, 'gpt-5.6-terra');
    assert.equal(legacy.reasoningEffort, 'high');
    assert.equal(legacy.responsesUrl.includes('api.deepseek.com'), false);

    const deepSeek = readGatewayConfig({ DEEPSEEK_API_KEY: 'deepseek-test-key' });
    assert.equal(deepSeek.apiKey, 'deepseek-test-key');
    assert.equal(deepSeek.responsesUrl, 'https://api.deepseek.com/responses');
    assert.equal(deepSeek.model, 'deepseek-v4-flash');
    assert.equal(deepSeek.reasoningEffort, 'high');
  });

  it('prefers complete DeepSeek overrides over legacy OPENAI compatibility variables', () => {
    const config = readGatewayConfig({
      DEEPSEEK_API_KEY: 'deepseek-test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek-proxy.invalid/v1/',
      DEEPSEEK_RESPONSES_URL: 'https://deepseek-direct.invalid/responses',
      DEEPSEEK_MODEL: 'deepseek-test-model',
      DEEPSEEK_REASONING_EFFORT: 'medium',
      OPENAI_API_KEY: 'legacy-test-key',
      OPENAI_MODEL: 'legacy-model',
    });
    assert.equal(config.apiKey, 'deepseek-test-key');
    assert.equal(config.responsesUrl, 'https://deepseek-direct.invalid/responses');
    assert.equal(config.model, 'deepseek-test-model');
    assert.equal(config.reasoningEffort, 'medium');

    const lowEffort = readGatewayConfig({
      DEEPSEEK_API_KEY: 'deepseek-test-key',
      DEEPSEEK_REASONING_EFFORT: 'low',
    });
    assert.equal(lowEffort.reasoningEffort, 'low');
  });

  it('preserves legacy OPENAI configuration when no DeepSeek variable is present', () => {
    const config = readGatewayConfig({
      OPENAI_API_KEY: 'legacy-test-key',
      OPENAI_API_BASE: 'https://legacy.invalid/v1/',
      OPENAI_MODEL: 'legacy-model',
      OPENAI_REASONING_EFFORT: 'high',
    });
    assert.equal(config.apiKey, 'legacy-test-key');
    assert.equal(config.responsesUrl, 'https://legacy.invalid/v1/responses');
    assert.equal(config.model, 'legacy-model');
    assert.equal(config.reasoningEffort, 'high');
    assert.equal(readEvaluationProviderConfig({ env: { OPENAI_MODEL: 'legacy-model' } }).provider, 'openai-compatible');
  });

  it('loads DeepSeek dev vars without overwriting existing process-style variables', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'reflow-gateway-config-'));
    const path = resolve(directory, '.dev.vars');
    try {
      await writeFile(path, [
        'DEEPSEEK_API_KEY=deepseek-file-key',
        'DEEPSEEK_MODEL=deepseek-file-model',
        'OPENAI_MODEL=legacy-file-model',
      ].join('\n'), 'utf8');
      const env = { OPENAI_MODEL: 'legacy-process-model' };
      await loadDevVars(path, env);
      assert.equal(env.OPENAI_MODEL, 'legacy-process-model');
      assert.equal(env.DEEPSEEK_API_KEY, 'deepseek-file-key');
      assert.equal(readGatewayConfig(env).model, 'deepseek-file-model');
      const evaluation = readEvaluationProviderConfig({ env });
      assert.equal(evaluation.provider, 'deepseek');
      assert.equal(evaluation.model, 'deepseek-file-model');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps same-name process DeepSeek variables ahead of dev vars', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'reflow-gateway-config-'));
    const path = resolve(directory, '.dev.vars');
    try {
      await writeFile(path, [
        'DEEPSEEK_API_KEY=deepseek-file-key',
        'DEEPSEEK_MODEL=deepseek-file-model',
      ].join('\n'), 'utf8');
      const env = {
        DEEPSEEK_API_KEY: 'deepseek-process-key',
        DEEPSEEK_MODEL: 'deepseek-process-model',
        OPENAI_MODEL: 'legacy-process-model',
      };
      await loadDevVars(path, env);
      const evaluation = readEvaluationProviderConfig({ env });
      assert.equal(env.DEEPSEEK_API_KEY, 'deepseek-process-key');
      assert.equal(evaluation.provider, 'deepseek');
      assert.equal(evaluation.model, 'deepseek-process-model');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('ignores a missing dev vars file', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'reflow-gateway-config-'));
    try {
      const env = { OPENAI_MODEL: 'legacy-process-model' };
      await loadDevVars(resolve(directory, 'missing.dev.vars'), env);
      assert.equal(readEvaluationProviderConfig({ env }).provider, 'openai-compatible');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses the same provider defaults and CLI precedence for proposal evaluation', () => {
    const defaults = readEvaluationProviderConfig({ env: {} });
    assert.equal(defaults.responsesUrl, 'https://api.deepseek.com/responses');
    assert.equal(defaults.model, 'deepseek-v4-flash');
    assert.equal(defaults.reasoningEffort, 'high');
    assert.deepEqual(defaults.pricingPerMillionTokens, { input: 0.14, output: 0.28 });

    const legacy = readEvaluationProviderConfig({ env: { OPENAI_API_KEY: 'legacy-test-key' } });
    assert.equal(legacy.responsesUrl, 'https://api.chatanywhere.tech/v1/responses');
    assert.equal(legacy.responsesUrl.includes('api.deepseek.com'), false);
    assert.deepEqual(legacy.pricingPerMillionTokens, { input: 5, output: 30 });

    const overridden = readEvaluationProviderConfig({
      env: {
        DEEPSEEK_API_KEY: 'deepseek-test-key',
        REFLOW_EVAL_INPUT_PRICE: '9',
        REFLOW_EVAL_OUTPUT_PRICE: '10',
      },
      args: {
        'base-url': 'https://eval-proxy.invalid/v1/',
        model: 'eval-model',
        reasoning: 'high',
        'input-price': '1.25',
        'output-price': '2.5',
      },
    });
    assert.equal(overridden.responsesUrl, 'https://eval-proxy.invalid/v1/responses');
    assert.equal(overridden.model, 'eval-model');
    assert.equal(overridden.reasoningEffort, 'high');
    assert.deepEqual(overridden.pricingPerMillionTokens, { input: 1.25, output: 2.5 });
  });

  it('normalizes nullable string enums for Responses without mutating the canonical schema', async () => {
    const schema = JSON.parse(await readFile(
      new URL('../../tools/proposal-eval/cloud-proposal-schema.json', import.meta.url),
      'utf8',
    ));
    const canonical = structuredClone(schema);
    const converted = schemaForOpenAI(schema);

    assert.deepEqual(schema, canonical);
    assert.notEqual(converted, schema);
    assert.equal('$schema' in converted, false);
    assert.equal('$id' in converted, false);
    assert.deepEqual(converted.required, canonical.required);
    assert.equal(converted.additionalProperties, false);
    assert.deepEqual(converted.properties.suggestedBucket.enum, ['today', 'waiting', 'someday', null]);
    assert.deepEqual(converted.properties.suggestedBucket.type, ['string', 'null']);
    assert.equal(converted.properties.estimatedMinutes.anyOf[0].minimum, 5);
    assert.equal(converted.properties.estimatedMinutes.anyOf[0].maximum, 480);
    assert.equal(converted.properties.waitingDetails.anyOf[0].additionalProperties, false);
  });
});
