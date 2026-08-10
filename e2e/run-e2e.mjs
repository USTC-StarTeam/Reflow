import { runE2ELifecycle } from './lifecycle-runner.mjs';

process.exitCode = await runE2ELifecycle({ forwardedArgs: process.argv.slice(2) });
