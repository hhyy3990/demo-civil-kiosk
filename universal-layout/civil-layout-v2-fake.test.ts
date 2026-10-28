import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CIVIL_V2_COMPONENT_ID,
  CIVIL_V2_FAKE_HOST_ID,
  CIVIL_V2_ITEM_IDS,
  CIVIL_V2_OPTION_GROUP_ID,
  CIVIL_V2_SAFE_LIST_OPTION_ID,
  createValidatedCivilLayoutV2Fake,
} from './civil-layout-v2-fake';
import {
  validateUniversalLayoutV2Plan,
} from './v2/universal-v2-contract-export';
import { civilLayoutV2FakePolicies, isCurrentCivilV2FakeRequest } from './civil-layout-v2-fake';

const regularDefaultRequest = {
  screenId: 'civil.main-menu',
  itemIds: CIVIL_V2_ITEM_IDS,
  viewport: { width: 1080, height: 1920, gridWidth: 500 },
  accessibility: {
    textScale: 'standard',
    buttonScale: 'standard',
    contrast: 'standard',
    viewportMode: null,
  },
  layoutCapabilities: ['reserved-bottom-controls'],
} as const;

test('Civil Development v2 Fake creates and validates a reserved-safe-list plan for 18 ordered items', () => {
  const { model, plan } = createValidatedCivilLayoutV2Fake(regularDefaultRequest);
  assert.equal(model.hostId, CIVIL_V2_FAKE_HOST_ID);
  assert.equal(model.screenId, 'civil.main-menu');
  assert.equal(model.components[0]?.id, CIVIL_V2_COMPONENT_ID);
  assert.equal(model.components[0]?.itemCount, 18);
  assert.deepEqual(model.components[0]?.allowedColumns, [1]);
  assert.deepEqual(model.components[0]?.optionGroups, [{
    id: CIVIL_V2_OPTION_GROUP_ID,
    optionIds: [CIVIL_V2_SAFE_LIST_OPTION_ID],
  }]);
  assert.equal(model.components[0]?.minimumTouchTargetPx, 44);
  assert.equal(plan.operations[0]?.type, 'selectLayoutOption');
  if (plan.operations[0]?.type === 'selectLayoutOption') {
    assert.equal(plan.operations[0].optionId, CIVIL_V2_SAFE_LIST_OPTION_ID);
  }
  assert.deepEqual(validateUniversalLayoutV2Plan(plan, model, civilLayoutV2FakePolicies), plan);
});

test('Civil Development v2 policy rejects the preset without the reserved capability', () => {
  assert.throws(
    () => createValidatedCivilLayoutV2Fake({
      ...regularDefaultRequest,
      layoutCapabilities: [],
    }),
    /UNSUPPORTED_PLAN_OPERATION/,
  );
});

test('Civil Development v2 validator rejects wrong hashes, unknown presets, and extra CSS fields', () => {
  const { model, plan } = createValidatedCivilLayoutV2Fake(regularDefaultRequest);
  assert.throws(() => validateUniversalLayoutV2Plan({
    ...plan,
    constraintHash: '0'.repeat(64),
  }, model, civilLayoutV2FakePolicies));
  assert.throws(() => validateUniversalLayoutV2Plan({
    ...plan,
    operations: [{
      type: 'selectLayoutOption',
      targetId: CIVIL_V2_COMPONENT_ID,
      groupId: CIVIL_V2_OPTION_GROUP_ID,
      optionId: 'unregistered-preset',
    }],
  }, model, civilLayoutV2FakePolicies));
  assert.throws(() => validateUniversalLayoutV2Plan({
    ...plan,
    operations: [{
      ...plan.operations[0],
      css: '.certificate-grid { display:none }',
    }],
  }, model, civilLayoutV2FakePolicies));
});

test('Civil Development v2 policy filters large text, large buttons, contrast, and bottom viewport to one column', () => {
  for (const accessibility of [
    { ...regularDefaultRequest.accessibility, textScale: 'large' as const },
    { ...regularDefaultRequest.accessibility, buttonScale: 'large' as const },
    { ...regularDefaultRequest.accessibility, contrast: 'high' as const },
    { ...regularDefaultRequest.accessibility, viewportMode: { mode: 'bottom' as const, heightPercent: 80 as const } },
  ]) {
    const { model } = createValidatedCivilLayoutV2Fake({ ...regularDefaultRequest, accessibility });
    assert.deepEqual(model.components[0]?.allowedColumns, [1]);
  }
});

test('Civil Development v2 context/generation guard drops stale plans', () => {
  assert.equal(isCurrentCivilV2FakeRequest('current', 'current', 7, 7), true);
  assert.equal(isCurrentCivilV2FakeRequest('new-profile', 'current', 7, 7), false);
  assert.equal(isCurrentCivilV2FakeRequest('current', 'current', 8, 7), false);
});

test('Civil Development v2 model rejects reordered menu identifiers', () => {
  assert.throws(() => createValidatedCivilLayoutV2Fake({
    ...regularDefaultRequest,
    itemIds: [...CIVIL_V2_ITEM_IDS].reverse(),
  }), /POLICY_COMPONENT_INVALID/);
});
