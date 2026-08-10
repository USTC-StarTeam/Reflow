import { readResponsesProviderConfig } from '../../gateway/config.mjs';

function positiveNumberOption(args, env, name, fallback) {
  const value = args[name] ?? env[`REFLOW_EVAL_${name.replaceAll('-', '_').toUpperCase()}`];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} 必须是正数。`);
  return parsed;
}

export function readEvaluationProviderConfig({ args = {}, env = process.env } = {}) {
  const provider = readResponsesProviderConfig(env);
  const baseUrl = args['base-url'] === undefined
    ? provider.baseUrl
    : String(args['base-url']).replace(/\/+$/, '');
  const responsesUrl = args['responses-url'] === undefined
    ? (args['base-url'] === undefined ? provider.responsesUrl : `${baseUrl}/responses`)
    : String(args['responses-url']);
  const defaultPricing = provider.provider === 'deepseek'
    ? { input: 0.14, output: 0.28 }
    : { input: 5, output: 30 };
  return {
    apiKey: provider.apiKey,
    baseUrl,
    responsesUrl,
    model: String(args.model ?? provider.model),
    reasoningEffort: String(args.reasoning ?? provider.reasoningEffort),
    provider: provider.provider,
    pricingPerMillionTokens: {
      input: positiveNumberOption(args, env, 'input-price', defaultPricing.input),
      output: positiveNumberOption(args, env, 'output-price', defaultPricing.output),
    },
  };
}
