import { z } from 'zod';
import {
  UNIVERSAL_LAYOUT_V2_CAPABILITIES,
  UNIVERSAL_LAYOUT_V2_CONTRACT_VERSION,
  UNIVERSAL_LAYOUT_V2_SCHEMA_VERSION,
  createUniversalLayoutV2Model,
  universalSha256,
  validateUniversalLayoutV2Model,
  validateUniversalLayoutV2Plan,
  type UniversalLayoutV2Accessibility,
  type UniversalLayoutV2Capability,
  type UniversalLayoutV2Plan,
  type UniversalLayoutV2Policy,
  type UniversalLayoutV2Viewport,
} from './v2/universal-v2-contract-export.js';
import {
  CIVIL_V2_COMPONENT_ID,
  CIVIL_V2_FAKE_HOST_ID,
  CIVIL_V2_ITEM_IDS,
  CIVIL_V2_OPTION_GROUP_ID,
  CIVIL_V2_SAFE_LIST_OPTION_ID,
  CIVIL_V2_SCREEN_ID,
  CIVIL_V2_STRUCTURE_VERSION,
} from './civil-layout-v2-fake-constants.js';

export * from './civil-layout-v2-fake-constants.js';

const civilV2FakeRequestSchema = z.object({
  screenId: z.literal(CIVIL_V2_SCREEN_ID),
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
    viewportMode: z.union([
      z.null(),
      z.object({
        mode: z.literal('bottom'),
        heightPercent: z.union([z.literal(60), z.literal(70), z.literal(80)]),
      }).strict(),
    ]),
  }).strict(),
  layoutCapabilities: z.array(z.enum(UNIVERSAL_LAYOUT_V2_CAPABILITIES)).max(8),
}).strict();

export type CivilLayoutV2FakeRequest = z.infer<typeof civilV2FakeRequestSchema>;

/**
 * Local Development-only policy. This is not a central Civil registry entry.
 * The footer-reservation capability limits the menu to one column; the named
 * option remains a host-owned presentation preset and never moves the footer.
 */
export const civilLayoutV2FakePolicy: UniversalLayoutV2Policy = {
  hostId: CIVIL_V2_FAKE_HOST_ID,
  screenId: CIVIL_V2_SCREEN_ID,
  structureVersion: CIVIL_V2_STRUCTURE_VERSION,
  allowedCapabilities: ['reserved-bottom-controls'],
  capabilityRules: {
    'reserved-bottom-controls': {
      componentIds: [CIVIL_V2_COMPONENT_ID],
      maximumColumns: 1,
    },
  },
  components: [{
    id: CIVIL_V2_COMPONENT_ID,
    kind: 'repeated-card-list',
    role: 'certificate-choice-list',
    order: 0,
    itemCountRange: [18, 18],
    allowedColumnsByViewport: {
      compact: [1],
      regular: [1, 2],
      wide: [1, 2],
    },
    singleColumnForLargeText: true,
    singleColumnForLargeButtons: true,
    singleColumnForHighContrast: true,
    singleColumnForBottomViewport: true,
    operations: ['setColumns'],
    optionGroups: [{
      id: CIVIL_V2_OPTION_GROUP_ID,
      options: [{ id: CIVIL_V2_SAFE_LIST_OPTION_ID, requiresCapabilities: ['reserved-bottom-controls'] }],
    }],
    minimumTouchTargetPx: 44,
    protectedProperties: ['items', 'order', 'selection', 'issuance-actions'],
  }],
};

export const civilLayoutV2FakePolicies = [civilLayoutV2FakePolicy] as const;

export function classifyCivilV2Viewport(
  width: number,
  gridWidth: number,
): UniversalLayoutV2Viewport {
  if (width <= 360 || gridWidth < 320) return 'compact';
  if (width < 760) return 'regular';
  return 'wide';
}

export function createValidatedCivilLayoutV2Fake(input: unknown): {
  model: ReturnType<typeof createUniversalLayoutV2Model>;
  plan: UniversalLayoutV2Plan;
} {
  const request = civilV2FakeRequestSchema.parse(input);
  if (request.itemIds.some((id, index) => id !== CIVIL_V2_ITEM_IDS[index])) {
    throw new Error('POLICY_COMPONENT_INVALID');
  }

  const model = createUniversalLayoutV2Model(civilLayoutV2FakePolicy, {
    viewportClass: classifyCivilV2Viewport(request.viewport.width, request.viewport.gridWidth),
    accessibility: request.accessibility as UniversalLayoutV2Accessibility,
    layoutCapabilities: request.layoutCapabilities as UniversalLayoutV2Capability[],
    componentState: [{
      id: CIVIL_V2_COMPONENT_ID,
      itemCount: request.itemIds.length,
      itemOrderHash: universalSha256({ orderedItemIds: request.itemIds }),
    }],
  });
  validateUniversalLayoutV2Model(model, civilLayoutV2FakePolicies);

  const proposedPlan: UniversalLayoutV2Plan = {
    schemaVersion: UNIVERSAL_LAYOUT_V2_SCHEMA_VERSION,
    contractVersion: UNIVERSAL_LAYOUT_V2_CONTRACT_VERSION,
    hostId: model.hostId,
    screenId: model.screenId,
    structureVersion: model.structureVersion,
    structureHash: model.structureHash,
    constraintHash: model.constraintHash,
    viewportClass: model.viewportClass,
    operations: [{
      type: 'selectLayoutOption',
      targetId: CIVIL_V2_COMPONENT_ID,
      groupId: CIVIL_V2_OPTION_GROUP_ID,
      optionId: CIVIL_V2_SAFE_LIST_OPTION_ID,
    }],
  };
  const plan = validateUniversalLayoutV2Plan(proposedPlan, model, civilLayoutV2FakePolicies);
  return { model, plan };
}

export function isCurrentCivilV2FakeRequest(
  currentContextKey: string,
  requestContextKey: string,
  currentGeneration: number,
  requestGeneration: number,
): boolean {
  return currentContextKey === requestContextKey && currentGeneration === requestGeneration;
}
