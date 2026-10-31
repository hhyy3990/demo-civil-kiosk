import { existsSync, statSync, writeSync } from 'node:fs';
import { createServer } from 'node:http';
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
const portValid = Number.isInteger(port) && port > 0 && port <= 65535;
const startupPreflight = {
  portProvided: process.env.PORT !== undefined,
  portValid,
  portMatchesConfiguredLocalPort: port === 5000,
  serverEntryPresent: isFile(new URL('../dist-server/server/production-server.js', import.meta.url)),
  indexHtmlPresent: isFile(new URL('../dist/index.html', import.meta.url)),
  sdkDependencyAvailable: dependencyAvailable('@naebangsik/kiosk-accessibility-sdk'),
  validatorDependencyAvailable: dependencyAvailable('zod'),
};
diagnostic('startup_preflight', startupPreflight);

if (!portValid) {
  diagnostic('startup_preflight_failed', { errorCode: 'INVALID_PORT' }, true);
  process.exit(1);
}

let civilRequestHandler = null;
const server = createServer((request, response) => {
  if (!civilRequestHandler) {
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(JSON.stringify({ error: 'APP_INITIALIZING' }));
    return;
  }

  try {
    civilRequestHandler(request, response);
  } catch (error) {
    diagnostic('request_handler_failed', safeError(error), true);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
    } else {
      response.destroy();
    }
  }
});

try {
  await new Promise((resolve, reject) => {
    const onListenError = (error) => reject(error);
    server.once('error', onListenError);
    server.listen(port, '0.0.0.0', () => {
      server.removeListener('error', onListenError);
      diagnostic('listener_open', { port });
      writeSync(1, `[civil-production-server] listening port=${port}\n`);
      resolve();
    });
  });
} catch (error) {
  fail('server_listen_failed', error);
}

if (
  !startupPreflight.serverEntryPresent
  || !startupPreflight.indexHtmlPresent
  || !startupPreflight.sdkDependencyAvailable
  || !startupPreflight.validatorDependencyAvailable
) {
  diagnostic('startup_preflight_failed', { errorCode: 'ARTIFACT_MISSING' }, true);
  process.exit(1);
}

try {
  diagnostic('server_import_started');
  const productionModule = await import(new URL('../dist-server/server/production-server.js', import.meta.url));
  if (typeof productionModule.handleProductionRequest !== 'function') {
    diagnostic('startup_import_failed', {
      errorName: 'TypeError',
      errorCode: 'PRODUCTION_HANDLER_MISSING',
    }, true);
    process.exit(1);
  }
  civilRequestHandler = productionModule.handleProductionRequest;
  diagnostic('server_module_loaded');
  diagnostic('app_ready');
} catch (error) {
  fail('startup_import_failed', error);
}
