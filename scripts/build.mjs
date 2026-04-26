import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#2f6a61"/><path d="M20 12h24a6 6 0 0 1 6 6v34a4 4 0 0 1-4 4H20a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6Z" fill="#fbfbf8"/><path d="M21 18h22a2 2 0 0 1 2 2v28H21a4 4 0 0 0-4 4V22a4 4 0 0 1 4-4Z" fill="#dbe8e3"/><path d="M28 31a4 4 0 0 1 8 0v4h-8v-4Z" fill="#214f49"/><rect x="25" y="35" width="14" height="11" rx="2" fill="#214f49"/></svg>`;
const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

const scriptFiles = [
  "constants",
  "types",
  "utils",
  "state",
  "preferences",
  "dom",
  "storage",
  "crypto",
  "entries",
  "insights",
  "llm",
  "render",
  "entry",
  "backup",
  "vault",
  "app"
];

const [styles, body, script] = await Promise.all([
  read("src/styles.css"),
  read("src/body.html"),
  readCompiledScript()
]);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src https://openrouter.ai; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <link rel="icon" type="image/svg+xml" href="${faviconHref}">
  <title>Private Diary</title>
  <style>
${indent(styles.trim(), 4)}
  </style>
</head>
<body>
${indent(body.trim(), 2)}
  <script>
${indent(wrapScript(script.trim()), 4)}
  </script>
</body>
</html>
`;

await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(path.join(root, "index.html"), html, "utf8");

function indent(value, spaces) {
  const prefix = " ".repeat(spaces);
  return value.split(/\r?\n/).map((line) => line ? prefix + line : "").join("\n");
}

async function readCompiledScript() {
  const parts = [];
  for (const file of scriptFiles) {
    const distFile = `dist/${file}.js`;
    if (await exists(distFile)) {
      const content = await read(distFile);
      if (content.trim()) parts.push(content.trim());
    }
  }
  return parts.join("\n\n");
}

async function exists(file) {
  try {
    await access(path.join(root, file));
    return true;
  } catch {
    return false;
  }
}

function wrapScript(script) {
  return `(() => {\n${indent(script, 2)}\n})();`;
}
