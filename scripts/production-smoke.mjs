import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer, request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const startupTimeoutMs = 5000;
const requestTimeoutMs = 2500;
const maxResponseBytes = 2 * 1024 * 1024;

class SmokeFailure extends Error {
  constructor(code) {
    super();
    this.code = code;
  }
}

function log(stage, fields = {}) {
  console.log(`[civil-production-smoke] ${JSON.stringify({ stage, ...fields })}`);
}

function readPackage(packagePath) {
  return JSON.parse(readFileSync(packagePath, 'utf8'));
}

function checkArtifacts() {
  const serverEntry = resolve(projectRoot, 'dist-server/server/production-server.js');
  const indexHtml = resolve(projectRoot, 'dist/index.html');
  const sdkPackagePath = require.resolve('@naebangsik/kiosk-accessibility-sdk/package.json');
  const zodPackagePath = require.resolve('zod/package.json');
  const sdkVersion = readPackage(sdkPackagePath).version;
  const zodVersion = readPackage(zodPackagePath).version;
  const result = {
    serverEntryPresent: existsSync(serverEntry),
    indexHtmlPresent: existsSync(indexHtml),
    sdkAvailable: existsSync(sdkPackagePath) && sdkVersion === '0.5.31',
    sdkVersion,
    zodAvailable: existsSync(zodPackagePath),
    zodVersion,
  };

  log('artifacts', result);
  if (
    !result.serverEntryPresent
    || !result.indexHtmlPresent
    || !result.sdkAvailable
    || !result.zodAvailable
  ) {
    throw new SmokeFailure('ARTIFACT_MISSING');
  }
  return indexHtml;
}

async function choosePort() {
  const server = createTcpServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '0.0.0.0', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    throw new SmokeFailure('PORT_ALLOCATION_FAILED');
  }
  const { port } = address;
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
  return port;
}

function safeCode(error) {
  const allowed = new Set([
    'EADDRINUSE',
    'EADDRNOTAVAIL',
    'EACCES',
    'EPERM',
    'ENOENT',
    'ERR_MODULE_NOT_FOUND',
    'MODULE_NOT_FOUND',
    'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
  ]);
  return allowed.has(error?.code) ? error.code : 'UNCLASSIFIED';
}

function safeName(error) {
  const allowed = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError']);
  return allowed.has(error?.name) ? error.name : 'UnknownError';
}

function requestLocal(port, path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
      (response) => {
        const chunks = [];
        let byteLength = 0;
        response.on('data', (chunk) => {
          byteLength += chunk.length;
          if (byteLength > maxResponseBytes) {
            request.destroy(Object.assign(new Error(), { code: 'SMOKE_RESPONSE_TOO_LARGE' }));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolvePromise({
          status: response.statusCode ?? 0,
          contentType: response.headers['content-type'] ?? '',
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      },
    );
    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(Object.assign(new Error(), { code: 'ETIMEDOUT' }));
    });
    request.once('error', (error) => rejectPromise(error));
    request.end();
  });
}

function safeStartupFields(record) {
  const fields = {};
  for (const key of [
    'elapsedMs',
    'portProvided',
    'portValid',
    'portMatchesConfiguredLocalPort',
    'serverEntryPresent',
    'indexHtmlPresent',
    'sdkDependencyAvailable',
    'validatorDependencyAvailable',
    'exitCode',
    'errorName',
    'errorCode',
  ]) {
    const value = record[key];
    if (
      typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && /^[A-Z0-9_]{1,48}$/.test(value))
    ) {
      fields[key] = value;
    }
  }
  return fields;
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main() {
  let failureCode = '';
  let child;
  let childExited = false;
  let childExitCode = null;
  let childSignal = null;
  let childError = null;
  let startupFailure = false;
  let portFailure = false;
  let readyResolve;
  const readyPromise = new Promise((resolvePromise) => {
    readyResolve = resolvePromise;
  });
  let exitResolve;
  const exitPromise = new Promise((resolvePromise) => {
    exitResolve = resolvePromise;
  });
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const observeLine = (line, streamName) => {
    const marker = '[civil-production-bootstrap] ';
    const markerIndex = line.indexOf(marker);
    if (markerIndex >= 0) {
      try {
        const record = JSON.parse(line.slice(markerIndex + marker.length));
        if (typeof record.stage === 'string') {
          log('bootstrap', { ...safeStartupFields(record), stageName: record.stage });
          if (record.stage === 'startup_import_failed') startupFailure = true;
          if (
            record.stage === 'startup_preflight'
            && (
              record.portValid !== true
              || record.serverEntryPresent !== true
              || record.indexHtmlPresent !== true
              || record.sdkDependencyAvailable !== true
              || record.validatorDependencyAvailable !== true
            )
          ) {
            startupFailure = true;
          }
        }
      } catch {
        // Ignore malformed or unrelated process output; never echo raw output.
      }
    }

    if (line.includes('EADDRINUSE') || line.includes('EADDRNOTAVAIL')) portFailure = true;
    if (line.includes('[civil-production-server] listening port=')) readyResolve(true);
    if (streamName === 'stderr' && line.includes('startup_import_failed')) startupFailure = true;
  };

  const attachOutput = (stream, streamName) => {
    let pending = '';
    stream.on('data', (chunk) => {
      pending += chunk.toString('utf8');
      if (pending.length > 64 * 1024) pending = pending.slice(-64 * 1024);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) observeLine(line, streamName);
    });
    stream.on('end', () => {
      if (pending) observeLine(pending, streamName);
    });
  };

  async function stopChild() {
    if (!child || child.pid === undefined || childExited) return true;
    try {
      child.kill('SIGTERM');
    } catch {
      // The force-kill check below determines whether cleanup succeeded.
    }
    await Promise.race([exitPromise, wait(1200)]);
    if (!childExited) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Report cleanup failure if it remains alive.
      }
      await Promise.race([exitPromise, wait(1200)]);
    }
    return childExited;
  }

  try {
    const indexHtmlPath = checkArtifacts();
    const port = await choosePort();
    log('spawn_started', { command: 'node server/production-bootstrap.mjs', portSelected: true });

    const childEnv = {
      PATH: process.env.PATH ?? '',
      HOME: tmpdir(),
      TMPDIR: tmpdir(),
      NODE_ENV: 'production',
      PORT: String(port),
      CIVIL_UNIVERSAL_LAYOUT_V2_PRODUCTION_RELAY_ENABLED: 'false',
      CIVIL_UNIVERSAL_LAYOUT_V2_PRODUCTION_HOST_POLICY_VERIFIED: 'false',
      CIVIL_UNIVERSAL_LAYOUT_CENTRAL_RELAY_ENABLED: 'false',
      CIVIL_UNIVERSAL_LAYOUT_OPENAI_RELAY_ENABLED: 'false',
      CIVIL_UNIVERSAL_LAYOUT_V2_LOCAL_FAKE_AUTO_ENABLED: 'false',
    };
    child = spawn(process.execPath, ['server/production-bootstrap.mjs'], {
      cwd: projectRoot,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    attachOutput(child.stdout, 'stdout');
    attachOutput(child.stderr, 'stderr');
    child.once('error', (error) => {
      childError = { name: safeName(error), code: safeCode(error) };
      exitResolve({ kind: 'spawn_error' });
    });
    child.once('exit', (code, signal) => {
      childExited = true;
      childExitCode = code;
      childSignal = signal;
      exitResolve({ kind: 'exit' });
    });

    const timeout = new Promise((resolvePromise) => {
      setTimeout(() => resolvePromise({ kind: 'timeout' }), startupTimeoutMs);
    });
    const startup = await Promise.race([
      readyPromise.then((isReady) => ({ kind: isReady ? 'ready' : 'not_ready' })),
      exitPromise,
      timeout,
    ]);

    if (startup.kind !== 'ready') {
      if (childError) {
        log('startup_failure', { classification: 'START_FAILED', ...childError });
        throw new SmokeFailure('START_FAILED');
      }
      if (startupFailure) throw new SmokeFailure('IMPORT_OR_PREFLIGHT_FAILED');
      if (portFailure || safeCode({ code: childError?.code }) === 'EADDRINUSE') {
        throw new SmokeFailure('PORT_CONFLICT');
      }
      if (startup.kind === 'exit') {
        log('startup_failure', { classification: 'PROCESS_EXITED_BEFORE_LISTEN', exitCode: childExitCode });
        throw new SmokeFailure('PROCESS_EXITED_BEFORE_LISTEN');
      }
      log('startup_failure', { classification: 'START_TIMEOUT', timeoutMs: startupTimeoutMs });
      throw new SmokeFailure('START_TIMEOUT');
    }

    log('server_ready', { ok: true });

    const rootResponse = await requestLocal(port, '/');
    log('root_http', { status: rootResponse.status, contentType: rootResponse.contentType.split(';')[0] });
    if (
      rootResponse.status !== 200
      || !rootResponse.contentType.toLowerCase().includes('text/html')
      || !rootResponse.body.includes('<title>무인민원발급기')
      || !rootResponse.body.includes('<div id="root"></div>')
    ) {
      throw new SmokeFailure('ROOT_HTTP_FAILED');
    }

    const assetPaths = [...rootResponse.body.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => {
        try {
          const url = new URL(match[1], 'http://127.0.0.1');
          return url.origin === 'http://127.0.0.1' && url.pathname.startsWith('/assets/')
            ? url.pathname
            : '';
        } catch {
          return '';
        }
      })
      .filter((path) => path.endsWith('.js') || path.endsWith('.css'));
    const jsPaths = assetPaths.filter((path) => path.endsWith('.js'));
    const cssPaths = assetPaths.filter((path) => path.endsWith('.css'));
    if (jsPaths.length === 0 || cssPaths.length === 0) throw new SmokeFailure('ASSET_REFERENCE_MISSING');

    for (const [kind, assetPath, expectedType] of [
      ['js', jsPaths[0], 'javascript'],
      ['css', cssPaths[0], 'text/css'],
    ]) {
      const assetResponse = await requestLocal(port, assetPath);
      const contentType = assetResponse.contentType.toLowerCase();
      const ok = assetResponse.status === 200 && contentType.includes(expectedType) && assetResponse.body.length > 0;
      log('asset_http', { kind, status: assetResponse.status, ok, bytes: Buffer.byteLength(assetResponse.body) });
      if (!ok) throw new SmokeFailure('ASSET_HTTP_FAILED');
    }

    const qrResponse = await requestLocal(port, '/api/qr-profile');
    log('qr_route', { method: 'GET', status: qrResponse.status, ok: qrResponse.status === 405 });
    if (qrResponse.status !== 405) throw new SmokeFailure('QR_ROUTE_FAILED');

    const aiResponse = await requestLocal(port, '/api/production/universal-layout/v2/status');
    let aiBody;
    try {
      aiBody = JSON.parse(aiResponse.body);
    } catch {
      throw new SmokeFailure('AI_STATUS_INVALID');
    }
    log('ai_gate', { status: aiResponse.status, enabled: aiBody.enabled === true });
    if (aiResponse.status !== 200 || aiBody.enabled !== false) {
      throw new SmokeFailure('AI_GATE_NOT_OFF');
    }

    log('http_checks', { ok: true, routesChecked: 4 });
  } catch (error) {
    failureCode = error instanceof SmokeFailure ? error.code : 'SMOKE_INTERNAL_ERROR';
    if (!(error instanceof SmokeFailure)) {
      log('smoke_exception', { errorName: safeName(error), errorCode: safeCode(error) });
    }
  } finally {
    const stopped = await stopChild();
    log('cleanup', { childExited: stopped, exitCode: childExitCode });
    if (!stopped && !failureCode) failureCode = 'CLEANUP_FAILED';
  }

  if (failureCode) {
    log('result', { status: 'failed', failureCode });
    process.exitCode = 1;
    return;
  }
  log('result', { status: 'passed' });
}

await main();
