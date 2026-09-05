// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import fixture from "./catalogue.fixture.json";
import type { CanvasProps } from "../../components/anatomy/AtlasCanvas";
vi.mock("next/dynamic", () => ({
  default: () =>
    function FakeCanvas(p: CanvasProps) {
      return (
        <div data-testid="canvas">
          <button onClick={() => p.onPick("FJ3259")}>Pick left femur</button>
          <button onClick={() => p.onError("context-lost")}>Lose WebGL</button>
        </div>
      );
    },
}));
vi.mock("../../lib/anatomy/validation", () => ({
  fetchAtlasManifest: vi.fn(async () => fixture),
}));
import AnatomyExplorer from "../../components/anatomy/AnatomyExplorer";
import { I18nProvider } from "../../lib/i18n";
afterEach(cleanup);
const open = () =>
  render(
    <I18nProvider defaultLang="en">
      <AnatomyExplorer
        manifestUrl={`/anatomy/${fixture.release}/manifest.json`}
      />
    </I18nProvider>,
  );
it("keeps text usable before opening 3D and after context loss, disposes the canvas on close", async () => {
  open();
  await screen.findByRole("button", { name: "Open 3D view" });
  expect(screen.queryByTestId("canvas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open 3D view" }));
  expect(screen.getByTestId("canvas")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close 3D view" }));
  expect(screen.queryByTestId("canvas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open 3D view" }));
  fireEvent.click(screen.getByRole("button", { name: "Lose WebGL" }));
  expect(screen.queryByTestId("canvas")).toBeNull();
  expect(screen.getByRole("searchbox")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
});
it("picking and search select the same source identity and explain hidden layers", async () => {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Open 3D view" }));
  fireEvent.click(screen.getByRole("button", { name: "Pick left femur" }));
  expect(screen.getByRole("heading", { name: "left femur" })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Skeleton/ }));
  expect(
    screen.getByText(/Some or all of this selection is hidden/),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "FMA24475" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /left femur FMA24475/ }),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: /left femur FMA24475/ }));
  expect(screen.getByRole("heading", { name: "left femur" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  expect(
    screen.queryByText(/Some or all of this selection is hidden/),
  ).toBeNull();
});
