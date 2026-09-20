import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const origin = "https://edudev.kz";
const sitemap = read("sitemap.xml");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1],
);
assert(urls.length >= 8, "Sitemap includes existing and new pages");
assert.equal(new Set(urls).size, urls.length, "No duplicate sitemap URLs");
assert(!urls.some((url) => url.includes("404")), "Error page not in sitemap");
const titles = new Set();
for (const url of urls) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, origin);
  assert.equal(parsed.search, "");
  assert.equal(parsed.hash, "");
  const html = read(parsed.pathname.slice(1) + "index.html");
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert(title, `Title: ${url}`);
  assert(!titles.has(title), `Unique title: ${url}`);
  titles.add(title);
  assert.match(html, /<html lang="ru"/);
  assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `One H1: ${url}`);
  assert.equal(
    html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1],
    url,
  );
  assert(!/<meta[^>]+content="[^"]*noindex/i.test(html), `Indexable: ${url}`);
  for (const match of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    const schema = JSON.parse(match[1]);
    assert.equal(schema["@context"], "https://schema.org");
  }
}
for (const path of [
  "index.html",
  "sozdanie-saytov/index.html",
  "razrabotka-crm/index.html",
  "404.html",
]) {
  const html = read(path);
  const base = new URL(path, origin + "/");
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(value, base);
    if (url.origin !== origin) continue;
    const target = url.pathname.endsWith("/")
      ? url.pathname + "index.html"
      : url.pathname;
    assert(
      existsSync(resolve(root, "." + target)),
      `Local asset/link: ${path} -> ${value}`,
    );
    if (url.hash && target.endsWith(".html")) {
      const fragment = decodeURIComponent(url.hash.slice(1));
      assert(
        read("." + target).includes(`id="${fragment}"`),
        `Anchor: ${path} -> ${value}`,
      );
    }
  }
}
const nginx = read("deploy/nginx-edudev.conf");
const marketing = nginx.split("server_name edudev.kz;")[1].split("server {")[0];
const crm = nginx.split("server_name crm.edudev.kz;")[1].split("server {")[0];
assert(
  marketing.includes("try_files $uri $uri/ =404;"),
  "Marketing returns real 404",
);
assert(
  marketing.includes("error_page 404 /404.html;"),
  "Branded error page configured",
);
assert(
  crm.includes("try_files $uri $uri/ /index.html;"),
  "CRM SPA fallback preserved",
);
assert.match(read("404.html"), /name="robots" content="noindex, follow"/);
assert(read("robots.txt").includes("Sitemap: https://edudev.kz/sitemap.xml"));
assert(
  !/^Disallow:\s*\/\s*$/m.test(read("robots.txt")),
  "Crawling not blocked",
);
console.log(
  `SEO checks passed: ${urls.length} sitemap pages, metadata, JSON-LD, local links, 404 and CRM routing contracts.`,
);
