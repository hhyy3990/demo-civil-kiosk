import { z } from 'zod';
import {
  createUniversalLayoutV2Model,
  UNIVERSAL_LAYOUT_V2_CAPABILITIES,
  universalSha256,
  validateUniversalLayoutV2Model,
  type UniversalLayoutV2Accessibility,
  type UniversalLayoutV2Capability,
  type UniversalLayoutV2Policy,
  type UniversalLayoutV2Viewport,
} from './v2/universal-v2-contract-export.js';
import {
  CIVIL_V2_PRODUCTION_COMPONENT_ID,
  CIVIL_V2_PRODUCTION_HOST_ID,
  CIVIL_V2_PRODUCTION_ITEM_IDS,
  CIVIL_V2_PRODUCTION_OPTION_GROUP_ID,
  CIVIL_V2_PRODUCTION_OPTION_ID,
  CIVIL_V2_PRODUCTION_SCREEN_ID,
  CIVIL_V2_PRODUCTION_STRUCTURE_VERSION,
} from './civil-layout-v2-production-constants.js';
import { civilV2HostEligibilitySchema } from './civil-layout-v2-host-safety.js';

export * from './civil-layout-v2-production-constants.js';

const productionRequestSchema = z.object({
  request: z.object({
    screenId: z.literal(CIVIL_V2_PRODUCTION_SCREEN_ID),
    itemIds: z.array(z.string().min(1).max(64)).length(18),
    viewport: z.object({
      width: z.literal(1080),
      height: z.literal(1920),
      gridWidth: z.number().int().min(200).max(1200),
    }).strict(),
    accessibility: z.object({
      textScale: z.literal('large'),
      buttonScale: z.literal('large'),
      contrast: z.literal('high'),
      viewportMode: z.object({
        mode: z.literal('bottom'),
        heightPercent: z.literal(70),
      }).strict(),
    }).strict(),
    layoutCapabilities: z.array(z.enum(UNIVERSAL_LAYOUT_V2_CAPABILITIES)).max(8),
  }).strict(),
  eligibility: civilV2HostEligibilitySchema,
  qrProfile: z.object({
    textSize: z.literal('large'),
    buttonSize: z.literal('large'),
    contrast: z.literal('high'),
    // SDK v0.5.x schema-v5 profiles encode bottom interaction through viewportMode;
    // the legacy bottomControls flag is normalized to false by the SDK.
    bottomControls: z.literal(false),
    easyLanguage: z.literal(true),
    smartGuide: z.literal(true),
    scrollGuidance: z.literal(true),
    voiceGuidance: z.literal(false),
    viewportMode: z.object({
      mode: z.literal('bottom'),
      heightPercent: z.literal(70),
    }).strict(),
  }).strict(),
}).strict();

export type CivilProductionV2Request = z.infer<typeof productionRequestSchema>;

export const civilProductionV2Policy: UniversalLayoutV2Policy = {
  hostId: CIVIL_V2_PRODUCTION_HOST_ID,
  screenId: CIVIL_V2_PRODUCTION_SCREEN_ID,
  structureVersion: CIVIL_V2_PRODUCTION_STRUCTURE_VERSION,
  allowedCapabilities: ['reserved-bottom-controls'],
  capabilityRules: {
    'reserved-bottom-controls': {
      componentIds: [CIVIL_V2_PRODUCTION_COMPONENT_ID],
      maximumColumns: 1,
    },
  },
  components: [{
    id: CIVIL_V2_PRODUCTION_COMPONENT_ID,
    kind: 'repeated-card-list',
    role: 'certificate-choice-list',
    order: 0,
    itemCountRange: [18, 18],
    allowedColumnsByViewport: {
      compact: [1],
      regular: [1],
      wide: [1],
    },
    singleColumnForLargeText: true,
    singleColumnForLargeButtons: true,
    singleColumnForHighContrast: true,
    singleColumnForBottomViewport: true,
    operations: ['setColumns'],
    optionGroups: [{
      id: CIVIL_V2_PRODUCTION_OPTION_GROUP_ID,
      options: [{
        id: CIVIL_V2_PRODUCTION_OPTION_ID,
        requiresCapabilities: ['reserved-bottom-controls'],
      }],
    }],
    minimumTouchTargetPx: 44,
    protectedProperties: ['items', 'order', 'selection', 'issuance-actions'],
  }],
};

export const civilProductionV2Policies = [civilProductionV2Policy] as const;

export function classifyCivilProductionViewport(width: number, gridWidth: number): UniversalLayoutV2Viewport {
  if (width <= 360 || gridWidth < 320) return 'compact';
  if (width < 760) return 'regular';
  return 'wide';
}

export function createCivilProductionV2Model(value: unknown) {
  const parsed = productionRequestSchema.parse(value);
  if (parsed.request.itemIds.some((id, index) => id !== CIVIL_V2_PRODUCTION_ITEM_IDS[index])) {
    throw new Error('MENU_STRUCTURE_INVALID');
  }
  if (parsed.request.layoutCapabilities.length !== 1
    || parsed.request.layoutCapabilities[0] !== 'reserved-bottom-controls') {
    throw new Error('RESERVED_BOTTOM_CONTROLS_UNAVAILABLE');
  }

  const model = createUniversalLayoutV2Model(civilProductionV2Policy, {
    viewportClass: classifyCivilProductionViewport(
      parsed.request.viewport.width,
      parsed.request.viewport.gridWidth,
    ),
    accessibility: parsed.request.accessibility as UniversalLayoutV2Accessibility,
    layoutCapabilities: parsed.request.layoutCapabilities as UniversalLayoutV2Capability[],
    componentState: [{
      id: CIVIL_V2_PRODUCTION_COMPONENT_ID,
      itemCount: parsed.request.itemIds.length,
      itemOrderHash: universalSha256({ orderedItemIds: parsed.request.itemIds }),
    }],
  });
  validateUniversalLayoutV2Model(model, civilProductionV2Policies);
  return model;
}

export function civilProductionV2ItemOrderHash(): string {
  return universalSha256({ orderedItemIds: CIVIL_V2_PRODUCTION_ITEM_IDS });
}
