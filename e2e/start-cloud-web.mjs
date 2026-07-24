import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const port = process.env.REFLOW_CLOUD_WEB_PORT ?? '8082';
const gatewayUrl = process.env.REFLOW_CLOUD_GATEWAY_URL ?? 'http://127.0.0.1:8788';
const child = spawn(process.execPath, [expoCli, 'start', '--web', '--port', port], {
  cwd: root,
  env: {
    ...process.env,
    EXPO_PUBLIC_PROPOSAL_MODE: 'cloud',
    EXPO_PUBLIC_AI_GATEWAY_URL: gatewayUrl,
  },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
