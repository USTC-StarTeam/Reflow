// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    // Gateway, E2E runner and proposal evaluation tooling run on Node.js, but
    // eslint-config-expo only declares browser-style globals. Without this,
    // `Buffer` / `process` / `fetch` / ... in those files would be reported as
    // undefined and the directories were previously outside the lint scope.
    files: ['gateway/**/*.mjs', 'e2e/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: ["dist/*", ".expo/*", "test-results/*"],
  }
]);
