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
