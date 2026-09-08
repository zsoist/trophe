// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
vi.mock("../../lib/anatomy/release", () => ({
  activeAtlasRelease: (flag: string) =>
    flag === "true" ? "verified-release" : null,
}));
import { WorkoutAtlasEntry } from "../../components/anatomy/WorkoutAtlasEntry";
import { I18nProvider } from "../../lib/i18n";
import { WorkoutAnatomySource } from '../../components/anatomy/WorkoutAnatomySource';
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
it("hides the product entry while release is inactive", () => {
  vi.stubEnv("NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED", "false");
  render(
    <I18nProvider defaultLang="en">
      <WorkoutAtlasEntry />
    </I18nProvider>,
  );
  expect(screen.queryByRole("link")).toBeNull();
});
it("links approved muscle context to the focused route without mounting a viewer", () => {
  vi.stubEnv("NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED", "true");
  const { container } = render(
    <I18nProvider defaultLang="en">
      <WorkoutAtlasEntry muscle="biceps-brachii" />
    </I18nProvider>,
  );
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "/dashboard/workout/atlas?muscle=biceps-brachii",
  );
  expect(container.querySelector("canvas")).toBeNull();
});
it('shows the nested entry only within an explicitly supplied private source', () => {
  vi.stubEnv('NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED', 'false');
  const { container } = render(<I18nProvider defaultLang="en"><WorkoutAnatomySource.Provider value={{ manifestUrl: '/private/manifest.json' }}><WorkoutAtlasEntry /></WorkoutAnatomySource.Provider></I18nProvider>);
  expect(screen.getByRole('link').getAttribute('href')).toBe('/dashboard/workout/atlas');
  expect(container.querySelector('canvas')).toBeNull();
});
