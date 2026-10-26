// Production server: serves the built site (dist/) from files embedded in the executable.
// The synth itself runs in the browser; this only hands out static files.
//   bun run server:build   → ./synth (single executable)
//   ./synth                → listens on $PORT (default 3000)
//   ./synth health         → exits 0 if the server on $PORT answers (for Docker healthchecks)
import { extname } from "node:path";
import { assets } from "./assets.gen";

const port = Number(process.env.PORT ?? 3000);

if (process.argv.includes("health")) {
  const res = await fetch(`http://127.0.0.1:${port}/`).catch(() => null);
  process.exit(res?.ok ? 0 : 1);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
};

/** Builds a fixed response for one embedded file. Vite's hashed /assets/* never change; HTML must revalidate. */
async function respond(urlPath: string, file: string) {
  const body = await Bun.file(file).bytes();
  return new Response(body, {
    headers: {
      "content-type": TYPES[extname(urlPath)] ?? "application/octet-stream",
      "cache-control": urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
    },
  });
}

const routes: Record<string, Response> = {};
for (const [urlPath, file] of Object.entries(assets)) routes[urlPath] = await respond(urlPath, file);
routes["/"] = routes["/index.html"]!;

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  routes,
  fetch: () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } }),
});

console.log(`Serving ${Object.keys(assets).length} files on ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.stop().then(() => process.exit(0)));
