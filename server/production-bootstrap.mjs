import { existsSync, statSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const startedAt = performance.now();
const allowedErrorNames = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'URIError', 'EvalError', 'AggregateError', 'AbortError',
]);
const allowedErrorCodes = new Set([
  'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_PACKAGE_IMPORT_NOT_DEFINED', 'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_REQUIRE_ESM', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE',
  'ERR_OUT_OF_RANGE', 'ERR_SOCKET_BAD_PORT', 'EADDRINUSE', 'EADDRNOTAVAIL',
  'EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EMFILE', 'ENFILE', 'ENOMEM',
]);

function diagnostic(stage, fields = {}, error = false) {
  try {
    writeSync(error ? 2 : 1, `[civil-production-bootstrap] ${JSON.stringify({
      stage,
      time: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - startedAt),
      ...fields,
    })}\n`);
  } catch {
    // A diagnostic output failure must not change normal server behavior.
  }
}

function safeError(error) {
  let errorName = 'UnknownError';
  let errorCode = 'UNCLASSIFIED';
  try {
    if (allowedErrorNames.has(error?.name)) errorName = error.name;
    if (allowedErrorCodes.has(error?.code)) errorCode = error.code;
  } catch {
    // Never inspect or stringify an arbitrary error message, stack, or cause.
  }
  return { errorName, errorCode };
}

function fail(stage, error) {
  diagnostic(stage, safeError(error), true);
  process.exit(1);
}

process.on('uncaughtException', (error) => fail('uncaught_exception', error));
process.on('unhandledRejection', (error) => fail('unhandled_rejection', error));
process.on('exit', (exitCode) => diagnostic('process_exit', { exitCode }));

function isFile(url) {
  try {
    return statSync(url).isFile();
  } catch {
    return false;
  }
}

function dependencyAvailable(name) {
  try {
    return existsSync(fileURLToPath(import.meta.resolve(name)));
  } catch {
    return false;
  }
}

diagnostic('boot_started');
const port = Number.parseInt(process.env.PORT ?? '5000', 10);
diagnostic('startup_preflight', {
  portProvided: process.env.PORT !== undefined,
  portValid: Number.isInteger(port) && port >= 0 && port <= 65535,
  portMatchesConfiguredLocalPort: port === 5000,
  serverEntryPresent: isFile(new URL('../dist-server/server/production-server.js', import.meta.url)),
  indexHtmlPresent: isFile(new URL('../dist/index.html', import.meta.url)),
  sdkDependencyAvailable: dependencyAvailable('@naebangsik/kiosk-accessibility-sdk'),
  validatorDependencyAvailable: dependencyAvailable('zod'),
});

try {
  diagnostic('server_import_started');
  await import(new URL('../dist-server/server/production-server.js', import.meta.url));
  // Import completion is not proof that the server has begun listening.
  diagnostic('server_module_loaded');
} catch (error) {
  fail('startup_import_failed', error);
}
