import {describe,it,expectTypeOf} from 'vitest';
import type {CoachChatAttachmentRemovalPort,CoachSpeechTextPort} from './chat-ports';
import type {createPrivateAttachmentService} from './attachments-service';
import type {CoachSpeechTextPort as ExistingSpeechExport} from './speech';
import type {CoachVoiceScope} from './voice-contract';
describe('neutral chat ports preserve existing adapters structurally',()=>{
 it('accepts the private attachment service and retains the speech export and scope',()=>{
  expectTypeOf<ReturnType<typeof createPrivateAttachmentService>>().toExtend<CoachChatAttachmentRemovalPort>();
  expectTypeOf<ExistingSpeechExport>().toEqualTypeOf<CoachSpeechTextPort>();
  expectTypeOf<Parameters<CoachSpeechTextPort['load']>[1]>().toMatchTypeOf<CoachVoiceScope>();
 });
});
