import { diffThemes } from "./generated/diffThemes.js";

export { diffThemes };

export interface DiffThemeSelection {
  readonly appearance?: "system" | "light" | "dark";
  readonly light: string;
  readonly dark: string;
}

export function resolveDiffTheme(id: unknown, dark: boolean) {
  return (
    diffThemes.find((theme) => theme.id === id && theme.dark === dark) ??
    diffThemes.find((theme) => theme.id === (dark ? "jayjay-dark" : "jayjay-light"))!
  );
}

export function diffThemeAttributes(themes?: DiffThemeSelection) {
  return themes
    ? {
        "data-jj-appearance": themes.appearance,
        "data-jj-theme-light": resolveDiffTheme(themes.light, false).id,
        "data-jj-theme-dark": resolveDiffTheme(themes.dark, true).id,
      }
    : {};
}
