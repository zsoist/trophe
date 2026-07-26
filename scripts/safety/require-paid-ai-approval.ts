import { pathToFileURL } from 'node:url';

const MAX_APPROVED_CALLS = 1_000;
const MAX_APPROVED_USD_MICRODOLLARS = 3_000_000;
const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/;
const MAX_USD_PATTERN = /^(?:0|[1-2])\.\d{6}$|^3\.000000$/;
const ESTIMATE_PATTERN = /^(?:0|[1-9]\d{0,2})\.(\d{1,12})$/;

const OPERATION_POLICIES = {
  'canary-production-ai-route': {
    target: 'production-ai-canary',
    estimatedUsdPerAttempt: '0.250000',
  },
  'debug-parse-roundtrip': {
    target: 'trophe-production',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-all': {
    target: 'provider-runtime',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-deepseek-candidate': {
    target: 'deepseek',
    estimatedUsdPerAttempt: '0.050000',
  },
  'eval-deepseek-stress': {
    target: 'deepseek',
    estimatedUsdPerAttempt: '0.050000',
  },
  'eval-food-parse-fifty': {
    target: 'provider-runtime',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-food-parse-route': {
    target: 'food-parse-route',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-food-parse-watchlist': {
    target: 'trophe-production',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-generate-benchmark': {
    target: 'provider-runtime',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-generate-french': {
    target: 'provider-runtime',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-generate-replacements': {
    target: 'provider-runtime',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-greek-colombian-prod': {
    target: 'trophe-production',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-meal-suggest': {
    target: 'meal-suggest-provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-nutrition-enterprise-prod': {
    target: 'trophe-production',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-phase2-round1': {
    target: 'provider-runtime',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-validate-dataset': {
    target: 'food-parse-route',
    estimatedUsdPerAttempt: '0.250000',
  },
  'ingest-food-embeddings': {
    target: 'voyage',
    estimatedUsdPerAttempt: '0.010000',
  },
} as const;

export type PaidAiToolOperation = keyof typeof OPERATION_POLICIES;

type ApprovalRule =
  | 'ack-required'
  | 'attempt-limit'
  | 'call-limit-invalid'
  | 'case-limit-invalid'
  | 'dataset-unbounded'
  | 'estimate-invalid'
  | 'live-flag-required'
  | 'operation-not-allowlisted'
  | 'run-id-invalid'
  | 'target-mismatch'
  | 'tool-opt-in-required'
  | 'usd-limit'
  | 'usd-limit-invalid';

const APPROVAL_RULES = new Set<ApprovalRule>([
  'ack-required',
  'attempt-limit',
  'call-limit-invalid',
  'case-limit-invalid',
  'dataset-unbounded',
  'estimate-invalid',
  'live-flag-required',
  'operation-not-allowlisted',
  'run-id-invalid',
  'target-mismatch',
  'tool-opt-in-required',
  'usd-limit',
  'usd-limit-invalid',
]);

function allowlistedOperation(operation: string): PaidAiToolOperation | 'unknown' {
  return Object.hasOwn(OPERATION_POLICIES, operation)
    ? operation as PaidAiToolOperation
    : 'unknown';
}

export class PaidAiToolApprovalError extends Error {
  readonly name = 'PaidAiToolApprovalError';
  readonly code = 'PAID_AI_TOOL_APPROVAL_BLOCKED';
  readonly rule: ApprovalRule;
  readonly operation: PaidAiToolOperation | 'unknown';

  constructor(rule: ApprovalRule, operation: string) {
    super('Paid AI tool approval blocked');
    this.rule = APPROVAL_RULES.has(rule) ? rule : 'operation-not-allowlisted';
    this.operation = allowlistedOperation(operation);
    Object.setPrototypeOf(this, PaidAiToolApprovalError.prototype);
  }

  toJSON(): {
    name: 'PaidAiToolApprovalError';
    code: 'PAID_AI_TOOL_APPROVAL_BLOCKED';
    rule: ApprovalRule;
    operation: PaidAiToolOperation | 'unknown';
  } {
    return {
      name: this.name,
      code: this.code,
      rule: this.rule,
      operation: this.operation,
    };
  }
}

function blocked(rule: ApprovalRule, operation: string): never {
  throw new PaidAiToolApprovalError(rule, operation);
}

function exactSingleFlag(
  argv: readonly string[],
  flag: string,
  operation: string,
  rule: ApprovalRule,
): string {
  const prefix = `${flag}=`;
  const matches = argv.filter((arg) => arg.startsWith(prefix));
  if (matches.length !== 1 || matches[0].length === prefix.length) {
    blocked(rule, operation);
  }
  return matches[0].slice(prefix.length);
}

function parseMaxCalls(value: string, operation: string): number {
  if (!/^[1-9]\d*$/.test(value)) blocked('call-limit-invalid', operation);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_APPROVED_CALLS) {
    blocked('call-limit-invalid', operation);
  }
  return parsed;
}

function parseMaxUsd(value: string, operation: string): number {
  if (!MAX_USD_PATTERN.test(value)) blocked('usd-limit-invalid', operation);
  const [whole, fraction] = value.split('.');
  const microdollars = Number(whole) * 1_000_000 + Number(fraction);
  if (
    !Number.isSafeInteger(microdollars)
    || microdollars <= 0
    || microdollars > MAX_APPROVED_USD_MICRODOLLARS
  ) {
    blocked('usd-limit-invalid', operation);
  }
  return microdollars;
}

function estimateToMicrodollarsCeil(
  value: string,
  operation: string,
): number {
  const match = ESTIMATE_PATTERN.exec(value);
  if (!match) blocked('estimate-invalid', operation);
  const [whole] = value.split('.');
  const fraction = match[1];
  const micros = Number(fraction.slice(0, 6).padEnd(6, '0'));
  const remainder = fraction.slice(6);
  const rounded = Number(whole) * 1_000_000
    + micros
    + (/[1-9]/.test(remainder) ? 1 : 0);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) {
    blocked('estimate-invalid', operation);
  }
  return rounded;
}

export interface PaidAiAttemptSnapshot {
  attempts: number;
  consumedUsdMicrodollars: number;
  remainingCalls: number;
  remainingUsdMicrodollars: number;
}

export interface PaidAiAttemptCounter {
  readonly operation: PaidAiToolOperation;
  readonly maxCalls: number;
  readonly maxUsdMicrodollars: number;
  consumeAttempt(): PaidAiAttemptSnapshot;
  snapshot(): PaidAiAttemptSnapshot;
}

export function createPaidAiAttemptCounter(input: {
  operation: string;
  maxCalls: number;
  maxUsdMicrodollars: number;
  estimatedUsdPerAttempt: string;
}): PaidAiAttemptCounter {
  const operation = allowlistedOperation(input.operation);
  if (operation === 'unknown') blocked('operation-not-allowlisted', input.operation);
  if (
    !Number.isSafeInteger(input.maxCalls)
    || input.maxCalls <= 0
    || input.maxCalls > MAX_APPROVED_CALLS
  ) {
    blocked('call-limit-invalid', operation);
  }
  if (
    !Number.isSafeInteger(input.maxUsdMicrodollars)
    || input.maxUsdMicrodollars <= 0
    || input.maxUsdMicrodollars > MAX_APPROVED_USD_MICRODOLLARS
  ) {
    blocked('usd-limit-invalid', operation);
  }
  const estimateMicrodollars = estimateToMicrodollarsCeil(
    input.estimatedUsdPerAttempt,
    operation,
  );
  if (estimateMicrodollars > input.maxUsdMicrodollars) {
    blocked('usd-limit', operation);
  }
  let attempts = 0;
  let consumedUsdMicrodollars = 0;

  const snapshot = (): PaidAiAttemptSnapshot => Object.freeze({
    attempts,
    consumedUsdMicrodollars,
    remainingCalls: input.maxCalls - attempts,
    remainingUsdMicrodollars: input.maxUsdMicrodollars - consumedUsdMicrodollars,
  });

  return Object.freeze({
    operation,
    maxCalls: input.maxCalls,
    maxUsdMicrodollars: input.maxUsdMicrodollars,
    consumeAttempt(): PaidAiAttemptSnapshot {
      if (attempts >= input.maxCalls) blocked('attempt-limit', operation);
      if (consumedUsdMicrodollars + estimateMicrodollars > input.maxUsdMicrodollars) {
        blocked('usd-limit', operation);
      }
      attempts += 1;
      consumedUsdMicrodollars += estimateMicrodollars;
      return snapshot();
    },
    snapshot,
  });
}

export interface PaidAiToolApproval extends PaidAiAttemptCounter {
  readonly target: string;
  readonly runId: string;
  boundCases<T>(
    cases: readonly T[],
    options?: Readonly<{ attemptsPerCase?: number }>,
  ): readonly T[];
}

export function requirePaidAiToolApproval(input: {
  operation: string;
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
}): PaidAiToolApproval {
  const operation = allowlistedOperation(input.operation);
  if (operation === 'unknown') {
    blocked('operation-not-allowlisted', input.operation);
  }
  if (input.env.TROPHE_ALLOW_PAID_AI !== '1') {
    blocked('tool-opt-in-required', operation);
  }
  if (input.argv.filter((arg) => arg === '--live').length !== 1) {
    blocked('live-flag-required', operation);
  }
  if (input.argv.some((arg) => arg.startsWith('--live='))) {
    blocked('live-flag-required', operation);
  }

  const target = exactSingleFlag(
    input.argv,
    '--target',
    operation,
    'target-mismatch',
  );
  if (target !== OPERATION_POLICIES[operation].target) {
    blocked('target-mismatch', operation);
  }
  const maxCalls = parseMaxCalls(
    exactSingleFlag(input.argv, '--max-calls', operation, 'call-limit-invalid'),
    operation,
  );
  const maxUsdMicrodollars = parseMaxUsd(
    exactSingleFlag(input.argv, '--max-usd', operation, 'usd-limit-invalid'),
    operation,
  );
  const runId = exactSingleFlag(
    input.argv,
    '--run-id',
    operation,
    'run-id-invalid',
  );
  if (!RUN_ID_PATTERN.test(runId)) blocked('run-id-invalid', operation);
  const acknowledgement = exactSingleFlag(
    input.argv,
    '--ack',
    operation,
    'ack-required',
  );
  if (acknowledgement !== `I_UNDERSTAND_PAID_AI:${operation}:${runId}`) {
    blocked('ack-required', operation);
  }

  const caseLimitValues = input.argv
    .filter((arg) => arg.startsWith('--case-limit='))
    .map((arg) => arg.slice('--case-limit='.length));
  let caseLimit = 1;
  if (caseLimitValues.length > 1) blocked('case-limit-invalid', operation);
  if (caseLimitValues.length === 1) {
    if (!/^[1-9]\d*$/.test(caseLimitValues[0])) {
      blocked('case-limit-invalid', operation);
    }
    caseLimit = Number(caseLimitValues[0]);
    if (!Number.isSafeInteger(caseLimit) || caseLimit > MAX_APPROVED_CALLS) {
      blocked('case-limit-invalid', operation);
    }
  }

  const counter = createPaidAiAttemptCounter({
    operation,
    maxCalls,
    maxUsdMicrodollars,
    estimatedUsdPerAttempt: OPERATION_POLICIES[operation].estimatedUsdPerAttempt,
  });
  const estimateMicrodollars = estimateToMicrodollarsCeil(
    OPERATION_POLICIES[operation].estimatedUsdPerAttempt,
    operation,
  );
  const maxAffordableCalls = Math.floor(
    maxUsdMicrodollars / estimateMicrodollars,
  );
  return Object.freeze({
    ...counter,
    target,
    runId,
    boundCases<T>(
      cases: readonly T[],
      options: Readonly<{ attemptsPerCase?: number }> = {},
    ): readonly T[] {
      if (!Array.isArray(cases)) blocked('dataset-unbounded', operation);
      const attemptsPerCase = options.attemptsPerCase ?? 1;
      if (
        !Number.isSafeInteger(attemptsPerCase)
        || attemptsPerCase <= 0
        || attemptsPerCase > maxCalls
      ) {
        blocked('dataset-unbounded', operation);
      }
      const approvedCases = Math.min(
        Math.floor(maxCalls / attemptsPerCase),
        Math.floor(maxAffordableCalls / attemptsPerCase),
      );
      if (approvedCases <= 0) blocked('dataset-unbounded', operation);
      return Object.freeze(cases.slice(0, Math.min(caseLimit, approvedCases)));
    },
  });
}

async function runCli(): Promise<void> {
  const operationArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--operation='));
  const operation = operationArg?.slice('--operation='.length) ?? 'unknown';
  try {
    const approval = requirePaidAiToolApproval({
      operation,
      argv: process.argv.slice(2),
      env: process.env,
    });
    approval.consumeAttempt();
  } catch (error) {
    const safeError = error instanceof PaidAiToolApprovalError
      ? error
      : new PaidAiToolApprovalError('operation-not-allowlisted', operation);
    process.stderr.write(`${safeError.operation}:${safeError.rule}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runCli();
}
