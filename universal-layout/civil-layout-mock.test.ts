import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  universalSha256,
  UniversalLayoutValidationError,
} from './universal-layout-contract.js';
import {
  createValidatedCivilLayoutMock,
  type CivilLayoutMockRequest,
} from './civil-layout-mock.js';

const itemIds = Array.from(
  { length: 18 },
  (_, index) => `civil.certificate.${String(index + 1).padStart(2, '0')}`,
);

function request(overrides: Partial<CivilLayoutMockRequest> = {}): CivilLayoutMockRequest {
  return {
    screenId: 'civil.main-menu',
    componentId: 'civil.certificate-grid',
    columns: 1,
    itemIds,
    viewport: { width: 390, height: 844, gridWidth: 360 },
    accessibility: {
      textScale: 'standard',
      buttonScale: 'standard',
      contrast: 'standard',
      bottomControls: false,
      viewportMode: null,
    },
    ...overrides,
  };
}

function expectRejectedColumns(value: CivilLayoutMockRequest) {
  assert.throws(
    () => createValidatedCivilLayoutMock(value),
    (error) => error instanceof UniversalLayoutValidationError && error.code === 'DISALLOWED_COLUMN_COUNT',
  );
}

test('civil main-menu mock uses the common validator and preserves 18 stable ordered items', () => {
  const result = createValidatedCivilLayoutMock(request({ columns: 2 }));
  const orderedItemIds = Array.from(
    { length: 18 },
    (_, index) => `civil.certificate.${String(index + 1).padStart(2, '0')}`,
  );

  assert.equal(result.model.hostId, 'civil-kiosk-mock');
  assert.equal(result.model.screenId, 'civil.main-menu');
  assert.equal(result.model.components[0]?.id, 'civil.certificate-grid');
  assert.equal(result.model.components[0]?.itemCount, 18);
  assert.equal(
    result.model.components[0]?.itemOrderHash,
    universalSha256({ orderedItemIds }),
  );
  assert.equal(result.plan.operations[0]?.type, 'setColumns');
  assert.equal(result.plan.operations[0]?.targetId, 'civil.certificate-grid');
  assert.equal(result.plan.operations[0]?.columns, 2);
  assert.notEqual(
    universalSha256({ orderedItemIds }),
    universalSha256({ orderedItemIds: [...orderedItemIds].reverse() }),
  );
});

test('one and two columns are accepted in a standard regular viewport; wide stays within the mock 1/2-column limit', () => {
  for (const columns of [1, 2] as const) {
    assert.equal(createValidatedCivilLayoutMock(request({ columns })).plan.operations[0]?.columns, columns);
  }
  const wideResult = createValidatedCivilLayoutMock(request({
    columns: 2,
    viewport: { width: 1080, height: 1920, gridWidth: 500 },
  }));
  assert.equal(wideResult.model.viewportClass, 'wide');
  assert.deepEqual(wideResult.model.components[0]?.allowedColumns, [1, 2]);
});

test('two columns are rejected in compact or insufficient-width viewports', () => {
  expectRejectedColumns(request({
    columns: 2,
    viewport: { width: 320, height: 844, gridWidth: 292 },
  }));
  expectRejectedColumns(request({
    columns: 2,
    viewport: { width: 390, height: 844, gridWidth: 310 },
  }));
  assert.equal(createValidatedCivilLayoutMock(request({
    columns: 1,
    viewport: { width: 320, height: 844, gridWidth: 292 },
  })).plan.operations[0]?.columns, 1);
});

test('two columns are rejected for larger text, larger buttons, high contrast, bottom controls, and bottom viewport mode', () => {
  const accessibilityCases: CivilLayoutMockRequest['accessibility'][] = [
    { textScale: 'large', buttonScale: 'standard', contrast: 'standard', bottomControls: false, viewportMode: null },
    { textScale: 'extraLarge', buttonScale: 'standard', contrast: 'standard', bottomControls: false, viewportMode: null },
    { textScale: 'standard', buttonScale: 'large', contrast: 'standard', bottomControls: false, viewportMode: null },
    { textScale: 'standard', buttonScale: 'standard', contrast: 'high', bottomControls: false, viewportMode: null },
    { textScale: 'standard', buttonScale: 'standard', contrast: 'standard', bottomControls: true, viewportMode: null },
    {
      textScale: 'standard',
      buttonScale: 'standard',
      contrast: 'standard',
      bottomControls: false,
      viewportMode: { mode: 'bottom', heightPercent: 80 },
    },
  ];

  for (const accessibility of accessibilityCases) {
    expectRejectedColumns(request({ columns: 2, accessibility }));
    assert.equal(
      createValidatedCivilLayoutMock(request({ columns: 1, accessibility })).plan.operations[0]?.columns,
      1,
    );
  }
});

test('host golden vectors keep structure stable and match viewport/accessibility constraint hashes', () => {
  const vectors: Array<{
    name: string;
    input: CivilLayoutMockRequest;
    viewportClass: 'compact' | 'regular' | 'wide';
    allowedColumns: number[];
    constraintHash: string;
  }> = [
    {
      name: '320px standard',
      input: request({ viewport: { width: 320, height: 844, gridWidth: 292 } }),
      viewportClass: 'compact',
      allowedColumns: [1],
      constraintHash: 'adb813aa6fb8276e2dfe63188e7a169e5d38395eac11c8312e43aad5496ef1d5',
    },
    {
      name: '360px standard',
      input: request({ viewport: { width: 360, height: 844, gridWidth: 332 } }),
      viewportClass: 'compact',
      allowedColumns: [1],
      constraintHash: 'adb813aa6fb8276e2dfe63188e7a169e5d38395eac11c8312e43aad5496ef1d5',
    },
    {
      name: '390px standard',
      input: request(),
      viewportClass: 'regular',
      allowedColumns: [1, 2],
      constraintHash: 'd18ee30970e42458e830b1add156184eb862d14c10633a44aa22ab1f41213b2a',
    },
    {
      name: '1080px standard',
      input: request({ viewport: { width: 1080, height: 1920, gridWidth: 470 } }),
      viewportClass: 'wide',
      allowedColumns: [1, 2],
      constraintHash: '1b771f4cd9c43c7311cd95c27eb316aa96909cda355d13dc7c6cc24940a44463',
    },
    {
      name: '390px large text',
      input: request({
        accessibility: {
          textScale: 'large',
          buttonScale: 'standard',
          contrast: 'standard',
          bottomControls: false,
          viewportMode: null,
        },
      }),
      viewportClass: 'regular',
      allowedColumns: [1],
      constraintHash: '2cd8c25f2b197832d1b6d9cba75a9e4bd28fdf6742e896bc1ba3a048aff008af',
    },
    {
      name: '390px large buttons',
      input: request({
        accessibility: {
          textScale: 'standard',
          buttonScale: 'large',
          contrast: 'standard',
          bottomControls: false,
          viewportMode: null,
        },
      }),
      viewportClass: 'regular',
      allowedColumns: [1],
      constraintHash: '32b8db345f531bbf63728d7270d70133b35a079a8067d92d2a12f28500d500bc',
    },
    {
      name: '390px high contrast',
      input: request({
        accessibility: {
          textScale: 'standard',
          buttonScale: 'standard',
          contrast: 'high',
          bottomControls: false,
          viewportMode: null,
        },
      }),
      viewportClass: 'regular',
      allowedColumns: [1],
      constraintHash: '1fbc74335278dc9bdeaded6b953b2802f641301c3a8fab1d9a236f0bb60921c2',
    },
    {
      name: '390px bottom viewport 80%',
      input: request({
        accessibility: {
          textScale: 'standard',
          buttonScale: 'standard',
          contrast: 'standard',
          bottomControls: false,
          viewportMode: { mode: 'bottom', heightPercent: 80 },
        },
      }),
      viewportClass: 'regular',
      allowedColumns: [1],
      constraintHash: 'abce520b55c6e47350afe6317646109afef0fba7a400c1eb12de17ff15e7fc54',
    },
    {
      name: '390px bottom controls',
      input: request({
        accessibility: {
          textScale: 'standard',
          buttonScale: 'standard',
          contrast: 'standard',
          bottomControls: true,
          viewportMode: null,
        },
      }),
      viewportClass: 'regular',
      allowedColumns: [1],
      constraintHash: 'cbe6a636f748e176e38529d5211f262b307fa1de3351a54efdea91974d634ef1',
    },
  ];

  for (const vector of vectors) {
    const { model, plan } = createValidatedCivilLayoutMock(vector.input);
    assert.equal(model.viewportClass, vector.viewportClass, vector.name);
    assert.deepEqual(model.components[0]?.allowedColumns, vector.allowedColumns, vector.name);
    assert.equal(model.components[0]?.itemCount, 18, vector.name);
    assert.equal(
      model.components[0]?.itemOrderHash,
      '1f984cacde0e9014a80a73b90f15ea8a2ca3002ee5a1a65b737cd8fe11e9342c',
      vector.name,
    );
    assert.equal(model.components[0]?.minimumTouchTargetPx, 44, vector.name);
    assert.equal(
      model.structureHash,
      '70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b',
      vector.name,
    );
    assert.equal(model.constraintHash, vector.constraintHash, vector.name);
    assert.equal(plan.operations[0]?.columns, 1, vector.name);
  }
});

test('the development mock rejects other screens, targets, and operations through the strict request and shared contract', () => {
  assert.throws(() => createValidatedCivilLayoutMock({
    ...request(),
    screenId: 'civil.resident-type',
  }));
  assert.throws(() => createValidatedCivilLayoutMock({
    ...request(),
    componentId: 'civil.payment-options',
  }));
  assert.throws(() => createValidatedCivilLayoutMock({
    ...request(),
    columns: 3,
  }));
  assert.throws(() => createValidatedCivilLayoutMock({
    ...request(),
    itemIds: [...itemIds].reverse(),
  }), (error) => error instanceof UniversalLayoutValidationError && error.code === 'POLICY_COMPONENT_INVALID');
  assert.throws(() => createValidatedCivilLayoutMock({
    ...request(),
    itemIds: itemIds.slice(0, 17),
  }));
});
