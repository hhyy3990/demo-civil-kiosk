import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CIVIL_V2_PRODUCTION_HOST_ID,
  CIVIL_V2_PRODUCTION_COMPONENT_ID,
  CIVIL_V2_PRODUCTION_ITEM_IDS,
  CIVIL_V2_PRODUCTION_OPTION_GROUP_ID,
  CIVIL_V2_PRODUCTION_OPTION_ID,
  CIVIL_V2_PRODUCTION_SCREEN_ID,
  CIVIL_V2_PRODUCTION_STRUCTURE_VERSION,
  createCivilProductionV2Model,
} from './civil-layout-v2-production.js';
import { createCivilProductionV2Forwarder } from './central-v2-production-relay.js';

const input = {
  request: {
    screenId: CIVIL_V2_PRODUCTION_SCREEN_ID,
    itemIds: [...CIVIL_V2_PRODUCTION_ITEM_IDS],
    viewport: { width: 1080, height: 1920, gridWidth: 470 },
    accessibility: {
      textScale: 'large',
      buttonScale: 'large',
      contrast: 'high',
      viewportMode: { mode: 'bottom', heightPercent: 70 },
    },
    layoutCapabilities: ['reserved-bottom-controls'],
  },
  eligibility: {
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
    targetViewport: true,
    centralProfileAllowed: true,
  },
  qrProfile: {
    textSize: 'large',
    buttonSize: 'large',
    contrast: 'high',
    bottomControls: true,
    easyLanguage: true,
    smartGuide: true,
    scrollGuidance: true,
    voiceGuidance: false,
    viewportMode: { mode: 'bottom', heightPercent: 70 },
  },
};

function makePlan(model: ReturnType<typeof createCivilProductionV2Model>) {
  return {
    schemaVersion: model.schemaVersion,
    contractVersion: model.contractVersion,
    hostId: model.hostId,
    screenId: model.screenId,
    structureVersion: model.structureVersion,
    structureHash: model.structureHash,
    constraintHash: model.constraintHash,
    viewportClass: model.viewportClass,
    operations: [{
      type: 'selectLayoutOption',
      targetId: CIVIL_V2_PRODUCTION_COMPONENT_ID,
      groupId: CIVIL_V2_PRODUCTION_OPTION_GROUP_ID,
      optionId: CIVIL_V2_PRODUCTION_OPTION_ID,
    }],
  };
}

function readyConfig(fetcher: typeof fetch, extra: Record<string, unknown> = {}) {
  return {
    productionRuntime: true,
    enabled: true,
    hostPolicyVerified: true,
    centralProductionUrl: 'https://central-production.example',
    hostAiToken: 'not-a-real-host-token',
    sessionSecret: 'not-a-real-session-secret',
    fetcher,
    ...extra,
  };
}

test('Production relay sends only strict model with host auth and idempotency; accepts a valid raw plan', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (inputUrl, init) => {
    calls += 1;
    const url = new URL(String(inputUrl));
    assert.equal(url.pathname, '/api/production/universal-layout/v2/openai-plan');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('X-Host-AI-Token'), 'not-a-real-host-token');
    assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'civil-test-key-000001');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body), ['model']);
    const model = body.model as ReturnType<typeof createCivilProductionV2Model>;
    return new Response(JSON.stringify(makePlan(model)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const first = await forward(input, 'civil-test-key-000001', 'session-1');
  const duplicate = await forward(input, 'civil-test-key-000001', 'session-1');
  assert.equal(first.status, 200);
  assert.equal((first.body.plan as { operations: { optionId: string }[] }).operations[0]?.optionId, 'reserved-safe-list');
  assert.equal(duplicate.status, 200);
  assert.equal(calls, 1);
  assert.equal(first.body.model && (first.body.model as { hostId: string }).hostId, CIVIL_V2_PRODUCTION_HOST_ID);
  assert.equal((first.body.plan as { structureVersion: string }).structureVersion, CIVIL_V2_PRODUCTION_STRUCTURE_VERSION);
});

test('Production relay stays blocked before fetch unless all independent gates and registry verification are true', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    throw new Error('unexpected fake fetch');
  };
  for (const overrides of [
    { enabled: false },
    { productionRuntime: false },
    { hostPolicyVerified: false },
    { hostAiToken: '' },
    { centralProductionUrl: 'https://central-production.example/api/path' },
  ]) {
    const forward = createCivilProductionV2Forwarder(readyConfig(fetcher, overrides));
    const result = await forward(input, 'civil-test-key-000002', `session-${calls}-${Object.keys(overrides)[0]}`);
    assert.notEqual(result.status, 200);
  }
  assert.equal(calls, 0);
});

test('Production relay fails closed on invalid plan and does not retry the provider', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const first = await forward(input, 'civil-test-key-000003', 'session-3');
  const duplicate = await forward(input, 'civil-test-key-000003', 'session-3');
  assert.equal(first.status, 502);
  assert.equal((first.body as { error: string }).error, 'INVALID_CENTRAL_PLAN');
  assert.deepEqual(duplicate, first);
  assert.equal(calls, 1);
});

test('Production relay rejects repeat AI attempts from one signed session with a new idempotency key', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls += 1;
    const model = JSON.parse(String(init?.body)).model as ReturnType<typeof createCivilProductionV2Model>;
    return new Response(JSON.stringify(makePlan(model)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  assert.equal((await forward(input, 'civil-test-key-000004', 'session-4')).status, 200);
  const blocked = await forward(input, 'civil-test-key-000005', 'session-4');
  assert.equal(blocked.status, 429);
  assert.equal((blocked.body as { error: string }).error, 'SESSION_AI_LIMIT_REACHED');
  assert.equal(calls, 1);
});

test('Production relay maps authentication and allowlist errors safely without retrying', async (t) => {
  for (const [status, code, expectedStatus] of [
    [403, 'AUTH_REQUIRED', 502],
    [404, 'HOST_NOT_ALLOWLISTED', 422],
  ] as const) {
    await t.test(`central ${status}`, async () => {
      let calls = 0;
      const fetcher: typeof fetch = async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: code }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
      const result = await forward(input, `civil-test-key-${status}0000`, `session-${status}`);
      assert.equal(result.status, expectedStatus);
      assert.equal((result.body as { error: string }).error, code);
      assert.equal(calls, 1);
    });
  }
});

test('Production relay times out once, sanitizes the failure, and does not retry', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('private request detail');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  };
  const forward = createCivilProductionV2Forwarder(
    readyConfig(fetcher, { requestTimeoutMs: 1 }),
  );
  const result = await forward(input, 'civil-test-key-timeout', 'session-timeout');
  assert.equal(result.status, 504);
  assert.equal((result.body as { error: string }).error, 'CENTRAL_REQUEST_TIMEOUT');
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes('private request detail'), false);
});
