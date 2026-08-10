import { spawn } from 'node:child_process';
import { createServer, get } from 'node:http';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const mockGateway = fileURLToPath(new URL('./mock-gateway.mjs', import.meta.url));

const STARTUP_DEADLINE_MS = 120_000;
const CLEANUP_GRACE_MS = 5_000;
const CLEANUP_FORCE_WAIT_MS = 5_000;
const cleanupPromises = new WeakMap();

export const E2E_PORTS = [8081, 8788, 8082];

function logEvent(logger, name, pid, stage, extra = '') {
  logger(`[e2e-runner] service=${name} pid=${pid ?? '-'} stage=${stage}${extra}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isMissingProcess(error) {
  return error?.code === 'ESRCH';
}

function childIsClosed(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildClose(child, timeoutMs) {
  if (childIsClosed(child)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('close', onClose);
      resolve(false);
    }, timeoutMs);
    const onClose = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('close', onClose);
  });
}

function waitForExit(child) {
  if (childIsClosed(child)) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }

  return new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

function requestHealthy(url) {
  return new Promise((resolve) => {
    const request = get(url, { timeout: 1_000 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });
    request.once('timeout', () => request.destroy());
    request.once('error', () => resolve(false));
  });
}

export async function waitForHealthy(service, child, { deadlineMs = STARTUP_DEADLINE_MS, shouldAbort = () => false } = {}) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (shouldAbort() || childIsClosed(child)) return false;
    if (await requestHealthy(service.healthUrl)) return true;
    await delay(250);
  }
  return false;
}

function tryBind(port, host) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, host, () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

export async function assertPortsFree(ports) {
  for (const port of ports) {
    for (const host of ['127.0.0.1', '::1']) {
      try {
        await tryBind(port, host);
      } catch (error) {
        if (host === '::1' && ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error?.code)) continue;
        throw new Error(`port ${port} is already in use`);
      }
    }
  }
}

export async function waitForPortsFree(ports, { deadlineMs = CLEANUP_FORCE_WAIT_MS } = {}) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      await assertPortsFree(ports);
      return true;
    } catch {
      await delay(100);
    }
  }
  return false;
}

function spawnTaskkill(pid, force) {
  return new Promise((resolve) => {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.push('/F');
    const taskkill = spawn('taskkill.exe', args, { shell: false, stdio: 'ignore', windowsHide: true });
    taskkill.once('error', () => resolve(false));
    taskkill.once('close', (code) => resolve(code === 0));
  });
}

export async function stopServiceTree(service, { logger = console.log, platform = process.platform } = {}) {
  const { child, name } = service;
  const pid = child?.pid;
  if (!Number.isInteger(pid) || childIsClosed(child)) return true;

  logEvent(logger, name, pid, 'stopping');
  try {
    if (platform === 'win32') {
      child.kill('SIGTERM');
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch (error) {
    if (!isMissingProcess(error)) return false;
  }

  if (await waitForChildClose(child, CLEANUP_GRACE_MS)) {
    logEvent(logger, name, pid, 'stopped');
    return true;
  }

  if (platform === 'win32') {
    logEvent(logger, name, pid, 'forcing');
    if (!await spawnTaskkill(pid, true)) return false;
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if (!isMissingProcess(error)) return false;
    }
  }

  const stopped = await waitForChildClose(child, CLEANUP_FORCE_WAIT_MS);
  logEvent(logger, name, pid, stopped ? 'stopped' : 'cleanup-failed');
  return stopped;
}

export function cleanupServices(services, { cleanupService = stopServiceTree, logger = console.log } = {}) {
  const existing = cleanupPromises.get(services);
  if (existing) return existing;

  const cleanup = (async () => {
    let succeeded = true;
    for (const service of [...services].reverse()) {
      if (!await cleanupService(service, { logger })) succeeded = false;
    }
    return succeeded;
  })();
  cleanupPromises.set(services, cleanup);
  return cleanup;
}

function defaultServices() {
  return [
    {
      name: 'mock-web',
      healthUrl: 'http://127.0.0.1:8081',
      args: [expoCli, 'start', '--web', '--port', '8081'],
      env: { EXPO_PUBLIC_PROPOSAL_MODE: 'mock', EXPO_PUBLIC_AI_GATEWAY_URL: '' },
    },
    {
      name: 'mock-gateway',
      healthUrl: 'http://127.0.0.1:8788/health',
      args: [mockGateway],
      env: {},
    },
    {
      name: 'cloud-web',
      healthUrl: 'http://127.0.0.1:8082',
      args: [expoCli, 'start', '--web', '--port', '8082'],
      env: {
        EXPO_PUBLIC_PROPOSAL_MODE: 'cloud',
        EXPO_PUBLIC_AI_GATEWAY_URL: 'http://127.0.0.1:8788',
      },
    },
  ];
}

function defaultPlaywright(forwardedArgs) {
  return { name: 'playwright', args: [playwrightCli, 'test', ...forwardedArgs], env: {} };
}

function spawnNode(spec) {
  return spawn(process.execPath, spec.args, {
    cwd: root,
    env: { ...process.env, ...spec.env },
    stdio: 'inherit',
    shell: false,
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
}

function codeForExit({ code }) {
  return typeof code === 'number' ? code : 1;
}

export async function runE2ELifecycle({
  forwardedArgs = [],
  ports = E2E_PORTS,
  services = defaultServices(),
  playwright = defaultPlaywright(forwardedArgs),
  spawnChild = spawnNode,
  waitForService = waitForHealthy,
  ensurePortsFree = assertPortsFree,
  ensurePortsReleased = waitForPortsFree,
  cleanupService = stopServiceTree,
  logger = console.log,
  installSignalHandlers = true,
} = {}) {
  const launched = [];
  let playwrightChild;
  let interrupted = false;
  let exitCode = 1;
  let stage = 'ports';

  const onSignal = (signal) => {
    interrupted = true;
    logEvent(logger, 'runner', null, `received-${signal}`);
    if (playwrightChild && !childIsClosed(playwrightChild)) playwrightChild.kill(signal);
  };
  if (installSignalHandlers) {
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  }

  try {
    await ensurePortsFree(ports);
    stage = 'startup';

    for (const service of services) {
      if (interrupted) throw new Error('interrupted before startup completed');
      const child = spawnChild(service);
      const record = { ...service, child };
      launched.push(record);
      logEvent(logger, service.name, child.pid, 'started');
      if (!await waitForService(service, child, { shouldAbort: () => interrupted })) {
        logEvent(logger, service.name, child.pid, 'startup-failed');
        throw new Error('service readiness failed');
      }
      logEvent(logger, service.name, child.pid, 'ready');
    }

    if (interrupted) throw new Error('interrupted before Playwright startup');
    stage = 'playwright';
    playwrightChild = spawnChild(playwright);
    logEvent(logger, playwright.name, playwrightChild.pid, 'started');
    const result = await waitForExit(playwrightChild);
    exitCode = codeForExit(result);
    logEvent(logger, playwright.name, playwrightChild.pid, 'exited', ` code=${exitCode}`);
  } catch {
    logEvent(logger, 'runner', null, stage === 'ports' ? 'ports-unavailable' : 'failed');
    exitCode = 1;
  } finally {
    const servicesStopped = await cleanupServices(launched, { cleanupService, logger });
    const portsReleased = launched.length === 0 || await ensurePortsReleased(ports);
    if (!servicesStopped || !portsReleased) {
      logEvent(logger, 'runner', null, 'cleanup-failed');
      if (exitCode === 0) exitCode = 1;
    } else if (launched.length > 0) {
      logEvent(logger, 'runner', null, 'cleanup-complete');
    }
    if (installSignalHandlers) {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }
  }

  logEvent(logger, 'runner', null, 'exited', ` code=${exitCode}`);
  return exitCode;
}
