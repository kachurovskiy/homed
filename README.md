# Private Diary

Private Diary is a local-first encrypted journal that runs as a single `index.html` file. It stores entries in the browser, supports encrypted JSON backups, and can optionally send selected diary context to OpenRouter for LLM-assisted reflection.

## What It Does

- Single-file app: open `index.html` in any modern browser.
- Local encrypted vault: diary entries are stored in IndexedDB after AES-GCM encryption.
- Password-derived key: the master password is stretched with PBKDF2-SHA-256 before deriving the vault key.
- Encrypted backups: export and import encrypted JSON backups.
- Optional OpenRouter integration: LLM calls happen only when requested from the UI.
- No runtime package dependencies.

## Use The App

Open https://kachurovskiy.com/homed/

To keep a local copy, save the page as `index.html` on your PC and open that file in a modern browser.

The first unlock flow creates a new encrypted vault. After that, unlock with the same master password.

## Privacy And Security

This app is designed for local-first personal use, but it is not a substitute for a professionally audited security product.

- There is no password recovery. If the master password is lost, the encrypted diary and backups cannot be decrypted.
- The browser stores encrypted vault metadata, encrypted entries, and encrypted LLM settings in IndexedDB.
- UI preferences are stored separately in `localStorage`.
- While the diary is unlocked, decrypted entries and the Web Crypto key exist in browser memory.
- OpenRouter API keys are saved inside the encrypted vault settings.
- Diary content is sent to OpenRouter only when an LLM action is explicitly requested.
- Browser extensions, operating system compromise, physical device access, weak passwords, and malicious hosting are outside the app's protection boundary.

For sensitive use, run the app from a trusted local copy or a trusted static host, keep encrypted backups, and use a strong unique master password.

## Development

For source changes:

```sh
npm ci
npm run typecheck
npm run build
npm run check
```

The build compiles TypeScript into `dist/` and then rewrites the checked-in `index.html` from:

- `src/styles.css`
- `src/body.html`
- compiled TypeScript from `src/*.ts`

Commit `index.html` after source changes so static hosting serves the current app.

## Project Layout

- `src/` - TypeScript, HTML body, and CSS source files.
- `scripts/build.mjs` - assembles the single-file static app.
- `index.html` - generated app entry point for static hosting.
- `dist/` - ignored TypeScript compiler output.

## License

MIT. See [LICENSE](LICENSE).
