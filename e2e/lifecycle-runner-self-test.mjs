import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { cleanupServices, runE2ELifecycle } from './lifecycle-runner.mjs';

function fakeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    if (child.exitCode === null) {
      child.exitCode = 0;
      queueMicrotask(() => child.emit('close', 0, null));
    }
    return true;
  };
  return child;
}

function complete(child, code) {
  child.exitCode = code;
  queueMicrotask(() => child.emit('close', code, null));
}

function harness({ playwrightCode = 0, services = [{ name: 'first' }, { name: 'second' }] } = {}) {
  const spawned = [];
  const cleaned = [];
  let nextPid = 4100;
  return {
    spawned,
    cleaned,
    options: {
      ports: [],
      services,
      playwright: { name: 'playwright' },
      logger: () => {},
      installSignalHandlers: false,
      ensurePortsFree: async () => {},
      ensurePortsReleased: async () => true,
      waitForService: async () => true,
      spawnChild(spec) {
        const child = fakeChild(nextPid++);
        spawned.push({ name: spec.name, pid: child.pid });
        if (spec.name === 'playwright') complete(child, playwrightCode);
        return child;
      },
      async cleanupService(service) {
        cleaned.push(service.child.pid);
        service.child.kill();
        return true;
      },
    },
  };
}

async function testOccupiedPortPreventsStartup() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  let starts = 0;

  const code = await runE2ELifecycle({
    ports: [address.port],
    services: [{ name: 'must-not-start' }],
    playwright: { name: 'playwright' },
    logger: () => {},
    installSignalHandlers: false,
    spawnChild() {
      starts += 1;
      return fakeChild(9999);
    },
    waitForService: async () => true,
    ensurePortsReleased: async () => true,
  });

  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  assert.equal(code, 1);
  assert.equal(starts, 0);
}

async function testSuccessCleansOwnedServices() {
  const test = harness();
  const code = await runE2ELifecycle(test.options);
  assert.equal(code, 0);
  assert.deepEqual(test.cleaned, [4101, 4100]);
  assert.deepEqual(test.spawned.map((entry) => entry.name), ['first', 'second', 'playwright']);
}

async function testPlaywrightFailurePropagates() {
  const test = harness({ playwrightCode: 23 });
  const code = await runE2ELifecycle(test.options);
  assert.equal(code, 23);
  assert.deepEqual(test.cleaned, [4101, 4100]);
}

async function testCleanupUsesRecordedPidsOnly() {
  const services = [{ name: 'owned-a', child: fakeChild(7123) }, { name: 'owned-b', child: fakeChild(8456) }];
  const targets = [];
  const result = await cleanupServices(services, {
    logger: () => {},
    async cleanupService(service) {
      targets.push(service.child.pid);
      return true;
    },
  });
  assert.equal(result, true);
  assert.deepEqual(targets, [8456, 7123]);
}

async function testCleanupIsIdempotent() {
  const services = [{ name: 'owned', child: fakeChild(9012) }];
  let calls = 0;
  const cleanupService = async () => {
    calls += 1;
    return true;
  };
  const [first, second] = await Promise.all([
    cleanupServices(services, { cleanupService, logger: () => {} }),
    cleanupServices(services, { cleanupService, logger: () => {} }),
  ]);
  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(calls, 1);
}

const tests = [
  ['occupied port prevents startup', testOccupiedPortPreventsStartup],
  ['success cleans owned services', testSuccessCleansOwnedServices],
  ['Playwright failure propagates', testPlaywrightFailurePropagates],
  ['cleanup uses recorded PIDs only', testCleanupUsesRecordedPidsOnly],
  ['cleanup is idempotent', testCleanupIsIdempotent],
];

for (const [, test] of tests) await test();
console.log(`lifecycle self-test: ${tests.length}/${tests.length} passed`);
