document.addEventListener("DOMContentLoaded", init);

async function init(): Promise<void> {
  loadUiPreferences();
  cacheElements();
  syncPreferenceControls();
  populateMoodOptions();
  bindEvents();

  if (!window.indexedDB || !window.crypto || !window.crypto.subtle) {
    setStatus(els.authStatus, "This browser does not provide IndexedDB and Web Crypto. Use a current desktop or mobile browser.", "error");
    els.authButton.disabled = true;
    return;
  }

  try {
    state.db = await openDatabase();
    state.vault = await getVaultMeta();
    renderAuthMode();
  } catch (error) {
    setStatus(els.authStatus, "The local vault could not be opened: " + readableError(error), "error");
    els.authButton.disabled = true;
  }
}
