import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { Plugin } from 'vite';
import { CIVIL_V2_ITEM_IDS } from './civil-layout-v2-fake-constants';
import { civilLayoutV2FakePlugin } from './civil-layout-v2-fake-relay';

const request = {
  screenId: 'civil.main-menu',
  itemIds: CIVIL_V2_ITEM_IDS,
  viewport: { width: 1080, height: 1920, gridWidth: 470 },
  accessibility: {
    textScale: 'standard',
    buttonScale: 'standard',
    contrast: 'standard',
    viewportMode: null,
  },
  layoutCapabilities: ['reserved-bottom-controls'],
};

const eligibility = {
  screenIsMainMenu: true,
  viewportAllowed: true,
  geometryKnown: true,
  footerVisible: true,
  footerInFlow: true,
  qrDockVisible: true,
  qrDockReservesBottom: true,
  menuClearOfFooter: true,
  menuClearOfQrDock: true,
  minimumTouchTargetPx: 44,
  menuHitTestSafe: true,
  reservedBottomCapability: true,
  targetViewport: false,
  centralProfileAllowed: true,
};

function getMiddleware() {
  let middleware:
    | ((request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void)
    | undefined;
  civilLayoutV2FakePlugin.configureServer?.({
    middlewares: { use: (handler: typeof middleware) => { middleware = handler; } },
  } as unknown as Parameters<NonNullable<Plugin['configureServer']>>[0]);
  assert.ok(middleware);
  return middleware;
}

async function callMiddleware(input: unknown) {
  const middleware = getMiddleware();
  const stream = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(input))]),
    {
      url: '/api/dev/universal-layout/v2-fake',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    },
  );
  let status = 0;
  let responseBody = '';
  const response = {
    set statusCode(value: number) { status = value; },
    setHeader: () => undefined,
    end: (value: string) => { responseBody = value; },
  };
  await middleware(stream as IncomingMessage, response as unknown as ServerResponse, () => {
    throw new Error('local v2 middleware did not match');
  });
  return { status, body: JSON.parse(responseBody) as Record<string, unknown> };
}

test('local Fake relay validates the same safe envelope before model generation', async (t) => {
  const valid = await callMiddleware({ request, eligibility });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.accepted, true);

  const unsafeStates = [
    ['footer hidden', { ...eligibility, footerVisible: false, reservedBottomCapability: false }],
    ['QR dock hidden', { ...eligibility, qrDockVisible: false, reservedBottomCapability: false }],
    ['QR dock does not reserve bottom', { ...eligibility, qrDockReservesBottom: false, reservedBottomCapability: false }],
    ['menu overlaps footer', { ...eligibility, menuClearOfFooter: false }],
    ['menu overlaps QR dock', { ...eligibility, menuClearOfQrDock: false }],
    ['touch target below minimum', { ...eligibility, minimumTouchTargetPx: 43 }],
  ] as const;

  for (const [name, unsafeEligibility] of unsafeStates) {
    await t.test(name, async () => {
      const result = await callMiddleware({ request, eligibility: unsafeEligibility });
      assert.equal(result.status, 409);
      assert.equal(result.body.accepted, false);
    });
  }
});

test('local Fake relay rejects the legacy unguarded request shape', async () => {
  const result = await callMiddleware(request);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { accepted: false, error: 'INVALID_FAKE_REQUEST' });
});
