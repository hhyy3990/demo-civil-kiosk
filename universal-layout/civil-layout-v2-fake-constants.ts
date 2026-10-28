export const CIVIL_V2_FAKE_HOST_ID = 'civil-kiosk-development-test';
export const CIVIL_V2_SCREEN_ID = 'civil.main-menu';
export const CIVIL_V2_COMPONENT_ID = 'civil.certificate-grid';
export const CIVIL_V2_STRUCTURE_VERSION = 'civil-main-menu.v2-test';
export const CIVIL_V2_SAFE_LIST_OPTION_ID = 'reserved-safe-list';
export const CIVIL_V2_OPTION_GROUP_ID = 'arrangement';
export const CIVIL_V2_ITEM_IDS = Array.from(
  { length: 18 },
  (_, index) => `civil.certificate.${String(index + 1).padStart(2, '0')}`,
);
