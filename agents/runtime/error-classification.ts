import type { AiErrorCategory } from './types';

const CATEGORY_BY_DIAGNOSTIC = new Map<string, AiErrorCategory>([
  ['authentication_error', 'auth'],
  ['permission_error', 'auth'],
  ['forbidden', 'auth'],
  ['invalid_api_key', 'auth'],
  ['insufficient_permissions', 'auth'],
  ['invalid_response', 'schema'],
  ['response_validation_error', 'schema'],
  ['schema_validation_error', 'schema'],
  ['budget_exceeded', 'budget'],
  ['cost_limit_exceeded', 'budget'],
  ['insufficient_quota', 'budget'],
  ['quota_exceeded', 'budget'],
  ['content_filter', 'policy'],
  ['content_policy_violation', 'policy'],
  ['policy_violation', 'policy'],
  ['safety_refusal', 'policy'],
  ['invalid_request_error', 'invalid_input'],
  ['request_too_large', 'invalid_input'],
  ['rate_limit_error', 'rate_limit'],
  ['rate_limit_exceeded', 'rate_limit'],
  ['rate_limited', 'rate_limit'],
  ['api_error', 'transient'],
  ['overloaded_error', 'transient'],
  ['server_error', 'transient'],
]);

const INTERNAL_CATEGORY_BY_NAME = new Map<string, AiErrorCategory>([
  ['OrganizationAiBudgetExceededError', 'budget'],
  ['ZodError', 'schema'],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type OwnField =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: unknown };

function ownField(record: Record<string, unknown>, key: string): OwnField {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) return { kind: 'absent' };
    if (!('value' in descriptor)) return { kind: 'invalid' };
    return { kind: 'value', value: descriptor.value };
  } catch {
    return { kind: 'invalid' };
  }
}

function categoryFromStatus(status: number): AiErrorCategory | undefined {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 409 || status >= 500) return 'transient';
  return undefined;
}

function categoryFromDiagnostic(value: unknown): AiErrorCategory | undefined {
  return typeof value === 'string' ? CATEGORY_BY_DIAGNOSTIC.get(value) : undefined;
}

/**
 * Classifies only normalized runtime markers and low-cardinality provider
 * fields. Arbitrary error messages and provider response bodies are ignored.
 */
export function classifyAiError(error: unknown): AiErrorCategory {
  if (!isRecord(error)) return 'unknown';

  const timeout = ownField(error, '_isTimeout');
  if (timeout.kind === 'invalid') return 'unknown';
  if (timeout.kind === 'value' && timeout.value === true) return 'timeout';

  const status = ownField(error, 'status');
  if (status.kind === 'invalid') return 'unknown';
  if (status.kind === 'value') {
    if (
      typeof status.value !== 'number'
      || !Number.isInteger(status.value)
      || status.value < 100
      || status.value > 599
    ) {
      return 'unknown';
    }

    const statusCategory = categoryFromStatus(status.value);
    if (statusCategory) return statusCategory;
  }

  const name = ownField(error, 'name');
  if (name.kind === 'invalid') return 'unknown';
  const internalCategory = name.kind === 'value' && typeof name.value === 'string'
    ? INTERNAL_CATEGORY_BY_NAME.get(name.value)
    : undefined;
  if (internalCategory) return internalCategory;

  const code = ownField(error, 'code');
  const type = ownField(error, 'type');
  if (code.kind === 'invalid' || type.kind === 'invalid') return 'unknown';
  return categoryFromDiagnostic(code.kind === 'value' ? code.value : undefined)
    ?? categoryFromDiagnostic(type.kind === 'value' ? type.value : undefined)
    ?? 'unknown';
}

export function isFallbackEligible(category: AiErrorCategory): boolean {
  return category === 'timeout' || category === 'rate_limit' || category === 'transient';
}
