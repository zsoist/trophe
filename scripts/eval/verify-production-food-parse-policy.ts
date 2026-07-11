import { foodParseSimulatorPolicy, taskFallbacks } from '../../agents/router/policies';

export type DeployedFoodParsePolicy = {
  provider?: string;
  model?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
};

export async function verifyProductionFoodParsePolicy(
  apiBase: string,
): Promise<DeployedFoodParsePolicy> {
  const response = await fetch(`${apiBase}/api/health`);
  const health = await response.json() as {
    routing?: { foodParse?: DeployedFoodParsePolicy };
  };
  const deployed = health.routing?.foodParse;
  if (!response.ok
    || deployed?.provider !== foodParseSimulatorPolicy.provider
    || deployed?.model !== foodParseSimulatorPolicy.model
    || deployed?.fallbackProvider !== taskFallbacks.food_parse?.provider
    || deployed?.fallbackModel !== taskFallbacks.food_parse?.model) {
    throw new Error(`Deployed food_parse policy does not match the local production policy: ${JSON.stringify(deployed)}`);
  }
  return deployed;
}
