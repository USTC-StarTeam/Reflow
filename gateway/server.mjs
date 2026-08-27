import { createServer } from 'node:http';

import { loadDevVars, readGatewayConfig } from './config.mjs';
import { createLocalServiceHandler } from './local-service.mjs';

await loadDevVars();
const config = readGatewayConfig();
const handler = createLocalServiceHandler({ config });
const server = createServer(handler);

server.listen(config.port, config.host, () => {
  console.log(`Reflow Local Gateway listening on http://${config.host}:${config.port}`);
  console.log(`Model: ${config.model}; reasoning: ${config.reasoningEffort}; AI enabled: ${config.enabled}`);
});
