const CIVIL_QR_APPLY_KEY_PREFIX = 'civil-qr-apply:';
const CIVIL_QR_APPLY_EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CivilQrApplyEvent = {
  id: number;
  profile: unknown;
  productionIdempotencyKey: string | null;
};

export function formatCivilQrApplyIdempotencyKey(eventId: string): string | null {
  if (!CIVIL_QR_APPLY_EVENT_ID.test(eventId)) return null;
  return `${CIVIL_QR_APPLY_KEY_PREFIX}${eventId.toLowerCase()}`;
}

export function isCivilQrApplyIdempotencyKey(value: string | undefined): value is string {
  if (
    !value
    || !value.startsWith(CIVIL_QR_APPLY_KEY_PREFIX)
    || value.length !== CIVIL_QR_APPLY_KEY_PREFIX.length + 36
  ) return false;
  return formatCivilQrApplyIdempotencyKey(value.slice(CIVIL_QR_APPLY_KEY_PREFIX.length)) === value;
}

export function shouldStartCivilProductionQrPlan(
  event: CivilQrApplyEvent | null,
  lastRequestedEventId: number | null,
): event is CivilQrApplyEvent & { productionIdempotencyKey: string } {
  return event !== null
    && event.id !== lastRequestedEventId
    && isCivilQrApplyIdempotencyKey(event.productionIdempotencyKey ?? undefined);
}

export function claimQrProfileResolveAttempt(state: { current: boolean }): boolean {
  if (state.current) return false;
  state.current = true;
  return true;
}
