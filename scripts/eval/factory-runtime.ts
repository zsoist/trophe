import { factoryPolicy } from '../../agents/router/policies';
import { executeAiTask } from '../../agents/runtime';
import { invokeTextProvider } from '../safety/paid-ai-provider-facade';
import { assertOffPeakEvalWindow } from './off-peak';

const FACTORY_SYSTEM = 'Generate synthetic nutrition evaluation data only. Never use or infer real-user data.';

export async function generateFactoryText(
  prompt: string,
  metadata: Record<string, unknown>,
  beforeTransportAttempt: (endpoint: string) => unknown,
): Promise<string> {
  assertOffPeakEvalWindow();
  const generation = await executeAiTask({
    task: 'factory_generate',
    prompt,
    systemPrompt: FACTORY_SYSTEM,
    context: { metadata: { ...metadata, lane: 'factory', syntheticOnly: true } },
    invoke: ({ policy, signal }) => {
      if (policy !== factoryPolicy) {
        throw new Error('Factory simulator policy diverged from production routing policy');
      }
      return invokeTextProvider({
        policy,
        signal,
        system: FACTORY_SYSTEM,
        prompt,
        beforeTransportAttempt,
      });
    },
  });

  return generation.output;
}
