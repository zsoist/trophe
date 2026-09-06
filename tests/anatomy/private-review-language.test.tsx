// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../../lib/i18n";
import { PrivateAtlasReview } from "../../tools/anatomy/private-review";

vi.mock("../../components/anatomy/AnatomyExplorer", () => ({
  default: function Explorer() {
    const { t } = useI18n();
    return <h1>{t("anatomy.workout_title")}</h1>;
  },
}));
const open = () =>
  render(
    <I18nProvider>
      <PrivateAtlasReview
        manifestUrl="/manifest.json"
        identity={{ codeSha: "test", manifestSha256: "test", release: "test" }}
      />
    </I18nProvider>,
  );
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("starts in English and changes the viewer and review panel together", () => {
  open();
  expect(screen.getByRole("heading", { name: "Muscle Atlas" })).toBeTruthy();
  expect(screen.getByText("Private device check")).toBeTruthy();
  expect(document.documentElement.lang).toBe("en");
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "es" },
  });
  expect(screen.getByRole("heading", { name: "Muscle Atlas" })).toBeTruthy();
  expect(screen.getByText("Revisión privada del dispositivo")).toBeTruthy();
  expect(localStorage.getItem("trophe_lang")).toBe("es");
});

it("honors a saved language without resetting the user's preference", async () => {
  localStorage.setItem("trophe_lang", "el");
  open();
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Muscle Atlas" })).toBeTruthy(),
  );
  expect(screen.getByText("Ιδιωτικός έλεγχος συσκευής")).toBeTruthy();
  expect(document.documentElement.lang).toBe("el");
});
