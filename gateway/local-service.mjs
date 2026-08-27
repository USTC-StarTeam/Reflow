import { createGatewayHandler } from './app.mjs';
import { createEmailHandler } from './email/handler.mjs';
import { createUstcImapAdapter } from './email/ustc-imap-adapter.mjs';

export function createLocalServiceHandler({ config, fetchImpl = fetch, logger = console, emailAdapter } = {}) {
  const proposalHandler = createGatewayHandler({ config, fetchImpl, logger });
  const emailHandler = createEmailHandler({
    config,
    adapter: emailAdapter ?? createUstcImapAdapter(),
    logger,
  });
  return function localServiceHandler(req, res) {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/messages' || pathname.startsWith('/messages/')) return emailHandler(req, res);
    return proposalHandler(req, res);
  };
}
