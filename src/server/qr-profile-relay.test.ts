import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ACCESSIBILITY_PROFILE_SCHEMA_VERSION,
  ACCESSIBILITY_SDK_VERSION,
  accessibilityClasses,
  createQrProfileClient,
} from '@naebangsik/kiosk-accessibility-sdk';
import { createQrProfileRelay } from './qr-profile-relay.js';

const fakeQrToken = 'Q'.repeat(24);
const fakeProductionAccessToken = 'fake-production-access-token';
const profileResponse = {
  schemaVersion: ACCESSIBILITY_PROFILE_SCHEMA_VERSION,
  preferences: {
    textSize: 'large',
    buttonSize: 'large',
    contrast: 'high',
    easyLanguage: true,
    smartGuide: true,
    voiceGuidance: true,
    guideDelaySeconds: 10,
    viewportMode: { mode: 'bottom', heightPercent: 70 },
    language: 'ko',
    stepByStepGuidance: true,
    conciseGuidance: false,
    slowGuidance: false,
    scrollGuidance: true,
  },
  updatedAt: '2026-10-29T00:00:00.000Z',
};

function createResponse(status: number, body: string | null, contentType?: string, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers(headers);
  if (contentType) responseHeaders.set('Content-Type', contentType);
  return new Response(body, { status, headers: responseHeaders });
}

async function invokeRelay(options: {
  accessToken?: string;
  fetcher?: typeof fetch;
  logger?: (message: string) => void;
}) {
  const request = new PassThrough();
  const body = JSON.stringify({ token: fakeQrToken });
  const incomingRequest = request as unknown as IncomingMessage;
  Object.assign(incomingRequest, {
    method: 'POST',
    url: '/api/qr-profile',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
  });

  const responseState = {
    statusCode: 200,
    headers: new Map<string, string>(),
    body: '',
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers.set(name.toLowerCase(), String(value));
      return this;
    },
    end(value?: string | Uint8Array) {
      this.body = value === undefined ? '' : Buffer.from(value).toString('utf8');
      return this;
    },
  };

  const middleware = createQrProfileRelay(options);
  const completed = middleware(
    incomingRequest,
    responseState as unknown as ServerResponse,
    (error) => { throw error ?? new Error('unexpected middleware fallthrough'); },
  );
  request.end(body);
  await completed;

  return {
    status: responseState.statusCode,
    headers: responseState.headers,
    body: JSON.parse(responseState.body) as Record<string, unknown>,
  };
}

test('QR relay sends the dedicated Production bearer and keeps the resolve request contract', async () => {
  let calls = 0;
  const result = await invokeRelay({
    accessToken: fakeProductionAccessToken,
    fetcher: async (input, init) => {
      calls++;
      assert.equal(new URL(String(input)).pathname, '/api/profiles/resolve');
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${fakeProductionAccessToken}`);
      assert.equal(init?.redirect, 'manual');
      assert.deepEqual(JSON.parse(String(init?.body)), { token: fakeQrToken });
      return createResponse(200, JSON.stringify(profileResponse), 'application/json');
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.equal(result.body.schemaVersion, 5);
  assert.deepEqual(result.body.preferences, profileResponse.preferences);
  assert.equal(result.body.updatedAt, profileResponse.updatedAt);
});

test('missing Production access token returns a clear local error and never calls upstream', async () => {
  let calls = 0;
  const logs: string[] = [];
  const result = await invokeRelay({
    accessToken: '',
    logger: (message) => logs.push(message),
    fetcher: async () => {
      calls++;
      throw new Error('must not be called');
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'QR_PRODUCTION_ACCESS_TOKEN_NOT_CONFIGURED');
  assert.deepEqual(logs, ['[qr-profile-relay] request=blocked reason=production-access-token-not-configured']);
});

test('redirects are blocked and diagnostics never include Location or credential values', async () => {
  const logs: string[] = [];
  const result = await invokeRelay({
    accessToken: fakeProductionAccessToken,
    logger: (message) => logs.push(message),
    fetcher: async (_input, init) => {
      assert.equal(init?.redirect, 'manual');
      return createResponse(307, null, undefined, { Location: 'https://private-login.invalid/path?token=must-not-log' });
    },
  });

  assert.equal(result.status, 502);
  assert.equal(result.body.error, 'QR_UPSTREAM_REDIRECT_BLOCKED');
  assert.equal(logs[0], '[qr-profile-relay] upstream status=307 content-type=missing result=redirect-blocked');
  assert.equal(logs.join('\n').includes('private-login'), false);
  assert.equal(logs.join('\n').includes(fakeProductionAccessToken), false);
  assert.equal(logs.join('\n').includes(fakeQrToken), false);
});

for (const status of [401, 403]) {
  test(`HTTP ${status} is reported as Production access denied without exposing the body`, async () => {
    const logs: string[] = [];
    const result = await invokeRelay({
      accessToken: fakeProductionAccessToken,
      logger: (message) => logs.push(message),
      fetcher: async () => createResponse(status, '{"detail":"private response text"}', 'application/json'),
    });
    assert.equal(result.status, 502);
    assert.equal(result.body.error, 'QR_PRODUCTION_ACCESS_DENIED');
    assert.equal(logs[0], `[qr-profile-relay] upstream status=${status} content-type=json result=production-access-denied`);
    assert.equal(logs.join('\n').includes('private response text'), false);
  });
}

test('a central 404 JSON response remains distinguishable as an unavailable QR', async () => {
  const logs: string[] = [];
  const result = await invokeRelay({
    accessToken: fakeProductionAccessToken,
    logger: (message) => logs.push(message),
    fetcher: async () => createResponse(404, '{"error":"PROFILE_NOT_FOUND","detail":"not forwarded"}', 'application/json'),
  });
  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'QR_UNAVAILABLE');
  assert.equal(JSON.stringify(result.body).includes('not forwarded'), false);
  assert.equal(logs[0], '[qr-profile-relay] upstream status=404 content-type=json result=http-error');
});

test('non-JSON upstream responses fail safely instead of being parsed as profiles', async () => {
  for (const [status, contentType] of [[200, 'text/html'], [404, 'text/html'], [200, undefined]] as const) {
    const result = await invokeRelay({
      accessToken: fakeProductionAccessToken,
      fetcher: async () => createResponse(status, '<html>private response</html>', contentType),
    });
    assert.equal(result.status, 502);
    assert.equal(result.body.error, 'QR_UPSTREAM_NON_JSON');
  }
});

test('the installed SDK still parses a fake schema v5 profile and retains accessibility settings', async () => {
  const client = createQrProfileClient({
    fetcher: async () => createResponse(200, JSON.stringify(profileResponse), 'application/json'),
  });
  const profile = await client.resolve(fakeQrToken, 'manual');
  const classes = accessibilityClasses(profile);

  assert.equal(ACCESSIBILITY_SDK_VERSION, '0.5.31');
  assert.equal(profile.scrollGuidance, true);
  assert.equal(profile.viewportMode?.heightPercent, 70);
  assert.ok(classes.includes('a11y-text-large'));
  assert.ok(classes.includes('a11y-controls-large'));
  assert.ok(classes.includes('a11y-high-contrast'));
  assert.ok(classes.includes('a11y-easy-language'));
  assert.equal(profile.smartGuide, true);
  assert.equal(profile.voiceGuidance, true);
});
