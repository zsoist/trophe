import type { HistoryTransport } from './history-client';

// Keep schema validation out of the initial Workout shell. Every operation still
// enters the same validated HTTP client before any response reaches the UI.
const client = async () => (await import('./history-client')).requestHistory;
export const requestHistory: HistoryTransport = {
  recover: async (...args) => (await client()).recover!(...args),
  list: async (...args) => (await client()).list(...args),
  read: async (...args) => (await client()).read(...args),
  create: async (...args) => (await client()).create!(...args),
  rename: async (...args) => (await client()).rename!(...args),
  remove: async (...args) => (await client()).remove!(...args),
};
