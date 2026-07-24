import { createServer } from 'node:http';

import { createGatewayHandler } from './app.mjs';
import { loadDevVars, readGatewayConfig } from './config.mjs';

await loadDevVars();
const config = readGatewayConfig();
const handler = createGatewayHandler({ config });
const server = createServer(handler);

server.listen(config.port, config.host, () => {
  console.log(`Reflow AI Gateway listening on http://${config.host}:${config.port}`);
  console.log(`Model: ${config.model}; reasoning: ${config.reasoningEffort}; AI enabled: ${config.enabled}`);
});
