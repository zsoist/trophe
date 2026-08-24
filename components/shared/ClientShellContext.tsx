'use client';

import { createContext, useContext } from 'react';

const ClientShellNavigationContext = createContext(false);

export const ClientShellNavigationProvider = ClientShellNavigationContext.Provider;

export function useClientShellNavigationOwner(): boolean {
  return useContext(ClientShellNavigationContext);
}
