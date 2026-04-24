# Private Diary

Private Diary is a local-first encrypted journal that builds to a single static `index.html` file. It stores entries in the browser, supports encrypted JSON backups, and can optionally send selected diary context to OpenRouter for LLM-assisted reflection.

## Features

- Single-file static app: the generated `index.html` can be hosted by GitHub Pages or any static web host.
- Local encrypted vault: diary entries are stored in IndexedDB after AES-GCM encryption.
- Password-derived key: the master password is stretched with PBKDF2-SHA-256 before deriving the vault key.
- Encrypted backups: export and import encrypted JSON backups.
- Optional OpenRouter integration: LLM calls happen only when requested from the UI.
- No runtime package dependencies.

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

## Use The App

Open `index.html` in a modern browser, or host the repository root with any static file server.

GitHub's repository file viewer shows `index.html` as source code. To let people try the app directly from GitHub, this repository includes a GitHub Pages workflow that publishes the generated `index.html` as a static site.

After pushing to GitHub:

1. Open the repository settings.
2. Go to Pages.
3. Set the Pages source to GitHub Actions.
4. Push to `master` or run the Pages workflow manually.

The app will be available at:

```text
https://<github-user>.github.io/<repository-name>/
```

For sensitive diary use, prefer a trusted local copy or a dedicated trusted domain. GitHub Pages project sites under the same account share one `github.io` origin, so other pages on that origin are part of the browser trust boundary.

The first unlock flow creates a new encrypted vault. After that, unlock with the same master password.

## Development

Install dependencies:

```sh
npm ci
```

Run type checking:

```sh
npm run typecheck
```

Build the generated static app:

```sh
npm run build
```

Run the full local check:

```sh
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
