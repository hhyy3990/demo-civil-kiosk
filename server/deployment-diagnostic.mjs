import { createServer } from 'node:http';

// Temporary isolation test only. Restore .replit deployment run to
// ["npm", "start"] after the test; never submit this server as the Civil app.
function log(stage, fields = {}, failed = false) {
  const output = `[civil-deployment-diagnostic] ${JSON.stringify({
    stage,
    time: new Date().toISOString(),
    ...fields,
  })}`;
  if (failed) console.error(output);
  else console.info(output);
}

const allowedErrorCodes = new Set([
  'EADDRINUSE', 'EADDRNOTAVAIL', 'EACCES', 'EPERM',
  'EMFILE', 'ENFILE', 'ENOMEM', 'ERR_SOCKET_BAD_PORT',
]);

function startupFailure(error) {
  log('listen_failed', {
    errorCode: allowedErrorCodes.has(error?.code) ? error.code : 'UNCLASSIFIED',
  }, true);
  process.exitCode = 1;
}

log('boot_started');
const suppliedPort = process.env.PORT;
const defaultPortUsed = suppliedPort === undefined;
const candidate = suppliedPort ?? '5000';
const port = Number(candidate);
if (!/^\d{1,5}$/.test(candidate) || !Number.isInteger(port) || port < 1 || port > 65535) {
  log('invalid_port', { errorCode: 'INVALID_PORT' }, true);
  process.exit(1);
}
log('port_validated', { defaultPortUsed, matchesConfiguredPort: port === 5000 });

let rootResponses = 0;
const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url ?? '/', 'http://diagnostic.invalid').pathname;
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request\n');
    return;
  }

  const isRootProbe = pathname === '/' && (request.method === 'GET' || request.method === 'HEAD');
  response.writeHead(isRootProbe ? 200 : 404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(request.method === 'HEAD' ? undefined : isRootProbe
    ? 'Civil deployment diagnostic only. This is not the kiosk application.\n'
    : 'Not found. Kiosk APIs are disabled in this temporary diagnostic server.\n');
  if (isRootProbe) log('root_response', { status: 200, count: ++rootResponses });
});

server.on('error', startupFailure);
try {
  server.listen(port, '0.0.0.0', () => {
    log('listening', { boundToAllInterfaces: server.address()?.address === '0.0.0.0' });
  });
} catch (error) {
  startupFailure(error);
}
