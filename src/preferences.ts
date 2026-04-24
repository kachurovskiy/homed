function loadUiPreferences(): void {
  const preferences = readUiPreferences();
  state.uiTheme = preferences.theme;
  state.uiFont = preferences.font;
  state.uiMaxWidth = preferences.uiMaxWidth;
  applyUiPreferences();
}

function syncPreferenceControls(): void {
  els.themeSelect.value = state.uiTheme;
  els.fontSelect.value = state.uiFont;
  els.uiWidthInput.value = String(state.uiMaxWidth);
}

function onThemeChange(): void {
  state.uiTheme = normalizeUiTheme(els.themeSelect.value);
  applyUiPreferences();
  saveUiPreferences();
  resetAutoLockTimer();
}

function onFontChange(): void {
  state.uiFont = normalizeUiFont(els.fontSelect.value);
  applyUiPreferences();
  saveUiPreferences();
  resetAutoLockTimer();
}

function onUiWidthChange(): void {
  state.uiMaxWidth = normalizeUiMaxWidth(els.uiWidthInput.value);
  els.uiWidthInput.value = String(state.uiMaxWidth);
  applyUiPreferences();
  saveUiPreferences();
  resetAutoLockTimer();
}

function applyUiPreferences(): void {
  document.documentElement.dataset.theme = state.uiTheme;
  document.documentElement.dataset.font = state.uiFont;
  document.documentElement.style.setProperty("--ui-max-width", `${state.uiMaxWidth}px`);
}

function readUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return defaultUiPreferences();
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return defaultUiPreferences();
    return {
      theme: normalizeUiTheme(parsed.theme),
      font: normalizeUiFont(parsed.font),
      uiMaxWidth: normalizeUiMaxWidth(parsed.uiMaxWidth)
    };
  } catch (error) {
    return defaultUiPreferences();
  }
}

function saveUiPreferences(): void {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
      theme: state.uiTheme,
      font: state.uiFont,
      uiMaxWidth: state.uiMaxWidth
    }));
  } catch (error) {
    // UI preferences are optional; private diary data is unaffected if storage is unavailable.
  }
}

function defaultUiPreferences(): UiPreferences {
  return {
    theme: "sage",
    font: "system",
    uiMaxWidth: 1200
  };
}

function normalizeUiTheme(value: unknown): UiThemeValue {
  return UI_THEMES.some((theme) => theme.value === value) ? value as UiThemeValue : "sage";
}

function normalizeUiFont(value: unknown): UiFontValue {
  return UI_FONTS.some((font) => font.value === value) ? value as UiFontValue : "system";
}

function normalizeUiMaxWidth(value: unknown): number {
  const width = Number(value);
  if (!Number.isFinite(width)) return 1200;
  return Math.round(clampNumber(width, 720, 2400, 1200));
}
