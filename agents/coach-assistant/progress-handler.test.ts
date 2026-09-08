import { describe, expect, it, vi } from 'vitest';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';

const id = 'a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const operation = { version: 'coach-assistant.v2', conversationId: id, turnId: id, operation: 'progress.read', days: 90 };
const request = (body: unknown) => new Request('https://preview.invalid/api/coach-assistant', { method: 'POST', body: JSON.stringify(body) });
function setup() {
  const repository = fixtureRepository(); repository.dataSource = 'authorized_records';
  repository.authorize = vi.fn(async () => ({ actorId: id, subjectId: id, organizationId: id, timezone: 'UTC', language: 'en' }));
  repository.plan = repository.workouts = repository.nutrition = async () => ({ rows: [], truncated: false });
  const execute = vi.fn().mockResolvedValue({ version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_found' });
  const createProgressService = vi.fn(() => ({ execute }));
  const deps = { env: { COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: id, COACH_ASSISTANT_PROGRESS_ACTIONS_ENABLED: '1', VERCEL_ENV: 'preview' }, guard: vi.fn(async () => ({ userId: id })), createRepository: vi.fn(() => repository), createProgressService };
  return { deps, execute };
}
describe('gated Progress HTTP transport', () => {
  it('dispatches Progress through authenticated scope and stays disabled without touching factories', async () => {
    const { deps, execute } = setup();
    const response = await handleCoachRequest(request(operation), deps);
    expect(response.status).toBe(404); expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toMatchObject({ actorId: id, subjectId: id, organizationId: id, operation });
    execute.mockClear(); deps.createProgressService.mockClear(); deps.createRepository.mockClear();
    expect((await handleCoachRequest(request(operation), { ...deps, env: { ...deps.env, COACH_ASSISTANT_PROGRESS_ACTIONS_ENABLED: '0' } })).status).toBe(404);
    expect(execute).not.toHaveBeenCalled(); expect(deps.createProgressService).not.toHaveBeenCalled(); expect(deps.createRepository).not.toHaveBeenCalled();
  });

  it('rejects foreign scope and unreviewed create before service dispatch', async () => {
    const { deps, execute } = setup();
    expect((await handleCoachRequest(request({ ...operation, clientId: crypto.randomUUID() }), deps)).status).toBe(403);
    expect((await handleCoachRequest(request({ ...operation, operation: 'measurement.apply', proposalId: id, hash: 'a'.repeat(64), resourceVersion: '1', actionId: id, reviewed: false }), deps)).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('advertises the registered self Progress capability only while its server flag is on', async () => {
    const { deps } = setup();
    const body = { version: 'coach-assistant.v2', conversationId: id, turnId: id, message: 'Show progress' };
    const enabled = await (await handleCoachRequest(request(body), { ...deps, env: { ...deps.env, COACH_ASSISTANT_DATA_SOURCE: 'authorized_records' } })).json();
    expect(enabled.snapshot.capabilities.find((item: { key: string }) => item.key === 'progress')).toEqual({ key: 'progress', status: 'available', reason: 'reviewed_self_measurements' });
    const disabled = await (await handleCoachRequest(request(body), { ...deps, env: { ...deps.env, COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', COACH_ASSISTANT_PROGRESS_ACTIONS_ENABLED: '0' } })).json();
    expect(disabled.snapshot.capabilities.find((item: { key: string }) => item.key === 'progress').status).toBe('not_connected');
  });
});
