import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),gate:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/workout/shared-pilot-budget',()=>({sharedPilotRuntimeGate:mocks.gate}));
import {GET} from '@/app/api/coach-assistant/route';
beforeEach(()=>{vi.stubEnv('VERCEL_ENV','production');mocks.getUser.mockResolvedValue({data:{user:{id:'actor'}},error:null});mocks.gate.mockReturnValue({ok:true});});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('shows only server-admitted identity and prevents shared caching',async()=>{
 const response=await GET();expect(await response.json()).toEqual({available:true});
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 expect(mocks.gate).toHaveBeenCalledWith(process.env,'actor');
});
it('hides denied production actors',async()=>{mocks.gate.mockReturnValue({ok:false});expect(await (await GET()).json()).toEqual({available:false});});
it('does not admit an invalid session',async()=>{mocks.getUser.mockResolvedValue({data:{user:null},error:new Error('expired')});expect(await (await GET()).json()).toEqual({available:false});expect(mocks.gate).not.toHaveBeenCalled();});

it('hides an unadmitted preview actor too',async()=>{vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED','1');mocks.gate.mockReturnValue({ok:false});expect(await (await GET()).json()).toEqual({available:false});});
