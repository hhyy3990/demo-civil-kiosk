import { z } from 'zod';
import {
  UNIVERSAL_LAYOUT_CONTRACT_VERSION,
  UNIVERSAL_LAYOUT_SCHEMA_VERSION,
  createUniversalLayoutModel,
  universalSha256,
  validateUniversalLayoutModel,
  validateUniversalLayoutPlan,
  UniversalLayoutValidationError,
  type UniversalLayoutModel,
  type UniversalLayoutPlan,
  type UniversalLayoutPolicy,
  type UniversalViewportClass,
} from './universal-layout-contract.js';

const civilMockRequestSchema = z.object({
  screenId: z.literal('civil.main-menu'),
  componentId: z.literal('civil.certificate-grid'),
  columns: z.union([z.literal(1), z.literal(2)]),
  itemIds: z.array(z.string().min(1).max(64)).length(18),
  viewport: z.object({
    width: z.number().int().min(240).max(3000),
    height: z.number().int().min(300).max(3000),
    gridWidth: z.number().int().min(200).max(1200),
  }).strict(),
  accessibility: z.object({
    textScale: z.enum(['standard', 'large', 'extraLarge']),
    buttonScale: z.enum(['standard', 'large']),
    contrast: z.enum(['standard', 'high']),
    bottomControls: z.boolean(),
    viewportMode: z.union([
      z.null(),
      z.object({
        mode: z.literal('bottom'),
        heightPercent: z.union([z.literal(60), z.literal(70), z.literal(80)]),
      }).strict(),
    ]),
  }).strict(),
}).strict();

export type CivilLayoutMockRequest = z.infer<typeof civilMockRequestSchema>;

// This is a Development experiment, not a confirmed central or Production policy.
// Narrow component widths use one column; only standard accessibility settings
// may try two columns, while touch targets remain constrained to at least 44px.
const baseAllowedColumns: Readonly<Record<UniversalViewportClass, readonly number[]>> = {
  compact: [1],
  regular: [1, 2],
  wide: [1, 2],
};

const certificateIds = Array.from(
  { length: 18 },
  (_, index) => `civil.certificate.${String(index + 1).padStart(2, '0')}`,
);

function createCivilMockPolicy(bottomControlsEnabled: boolean): UniversalLayoutPolicy {
  const allowedColumnsByViewport = bottomControlsEnabled
    ? { compact: [1], regular: [1], wide: [1] }
    : baseAllowedColumns;

  return {
    hostId: 'civil-kiosk-mock',
    screenId: 'civil.main-menu',
    structureVersion: 'civil-main-mock.v1',
    components: [{
      id: 'civil.certificate-grid',
      kind: 'repeated-card-list',
      role: 'certificate-choice-list',
      order: 0,
      itemCountRange: [18, 18],
      operations: ['setColumns'],
      allowedColumnsByViewport,
      singleColumnForLargeText: true,
      singleColumnForLargeButtons: true,
      singleColumnForHighContrast: true,
      singleColumnForBottomViewport: true,
      minimumTouchTargetPx: 44,
      protectedProperties: ['items', 'order', 'selection', 'issuance-actions'],
    }],
  };
}

export const civilLayoutMockPolicies = {
  standard: createCivilMockPolicy(false),
  bottomControls: createCivilMockPolicy(true),
} as const;

function viewportClassFor(request: CivilLayoutMockRequest): UniversalViewportClass {
  if (request.viewport.width <= 360 || request.viewport.gridWidth < 320) return 'compact';
  if (request.viewport.width < 760) return 'regular';
  return 'wide';
}

function createModel(
  request: CivilLayoutMockRequest,
  policy: UniversalLayoutPolicy,
): UniversalLayoutModel {
  const model = createUniversalLayoutModel(policy, {
    viewportClass: viewportClassFor(request),
    accessibility: {
      textScale: request.accessibility.textScale,
      buttonScale: request.accessibility.buttonScale,
      contrast: request.accessibility.contrast,
      viewportMode: request.accessibility.viewportMode,
    },
    componentState: [{
      id: 'civil.certificate-grid',
      itemCount: request.itemIds.length,
      itemOrderHash: universalSha256({ orderedItemIds: request.itemIds }),
    }],
  });
  return validateUniversalLayoutModel(model, [policy]);
}

export function createValidatedCivilLayoutMock(input: unknown): {
  model: UniversalLayoutModel;
  plan: UniversalLayoutPlan;
} {
  const request = civilMockRequestSchema.parse(input);
  if (request.itemIds.some((id, index) => id !== certificateIds[index])) {
    throw new UniversalLayoutValidationError('POLICY_COMPONENT_INVALID');
  }
  const policy = request.accessibility.bottomControls
    ? civilLayoutMockPolicies.bottomControls
    : civilLayoutMockPolicies.standard;
  const model = createModel(request, policy);
  const proposedPlan = {
    schemaVersion: UNIVERSAL_LAYOUT_SCHEMA_VERSION,
    contractVersion: UNIVERSAL_LAYOUT_CONTRACT_VERSION,
    hostId: model.hostId,
    screenId: model.screenId,
    structureVersion: model.structureVersion,
    structureHash: model.structureHash,
    constraintHash: model.constraintHash,
    viewportClass: model.viewportClass,
    operations: [{
      type: 'setColumns' as const,
      targetId: request.componentId,
      columns: request.columns,
    }],
  };
  const plan = validateUniversalLayoutPlan(proposedPlan, model, [policy]);
  return { model, plan };
}

export { UniversalLayoutValidationError };
