/** Private export: optional capture telemetry cannot reach an account service. */
export const trpcClient = { food: { corrections: { captureAdjustment: { mutate: async () => { throw new Error('Not connected in private preview'); } } } } };
