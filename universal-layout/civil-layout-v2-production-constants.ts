/**
 * Production-candidate identifiers. Central allowlist registration is still
 * required before this model can be used against the Production API.
 */
export const CIVIL_V2_PRODUCTION_HOST_ID = 'civil-kiosk-production';
export const CIVIL_V2_PRODUCTION_STRUCTURE_VERSION = 'civil-main-menu.production.v1';
export const CIVIL_V2_PRODUCTION_SCREEN_ID = 'civil.main-menu';
export const CIVIL_V2_PRODUCTION_COMPONENT_ID = 'civil.certificate-grid';
export const CIVIL_V2_PRODUCTION_OPTION_GROUP_ID = 'arrangement';
export const CIVIL_V2_PRODUCTION_OPTION_ID = 'reserved-safe-list';
export const CIVIL_V2_PRODUCTION_ITEM_IDS = Array.from(
  { length: 18 },
  (_, index) => `civil.certificate.${String(index + 1).padStart(2, '0')}`,
);
