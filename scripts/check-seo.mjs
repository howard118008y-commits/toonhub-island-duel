import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const directory = resolve(process.argv[2] || 'dist');
const base = 'https://howard118008y-commits.github.io/toonhub-island-duel/';
const slugs = ['', 'guide/', 'characters/', 'about/'];
const read = (path) => readFileSync(join(directory, path), 'utf8');
const sitemap = read('sitemap.xml');
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort(), slugs.map((slug) => base + slug).sort(), 'Sitemap must contain exactly the four public content pages.');
let schemas = 0;
let references = 0;
for (const slug of slugs) {
  const html = read(`${slug}index.html`);
  assert.match(html, /<html[^>]+lang="zh-Hant"/, `${slug} must declare Traditional Chinese.`);
  assert.ok(html.includes(`rel="canonical" href="${base + slug}"`), `${slug} canonical mismatch.`);
  assert.doesNotMatch(html, /name="robots"[^>]*noindex/, `${slug} must be indexable.`);
  assert.match(html, /<h1[\s>]/, `${slug} needs visible, non-JavaScript content.`);
  assert.match(html, /property="og:image"[^>]*social-card\.png/, `${slug} needs the social image.`);
  const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length, `${slug} needs JSON-LD.`);
  for (const block of blocks) {
    const data = JSON.parse(block[1]);
    assert.equal(data['@context'], 'https://schema.org');
    assert.doesNotMatch(block[1], /"(?:aggregateRating|review)"/, 'Do not publish invented reviews.');
    schemas += 1;
  }
  for (const [, reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|mailto:|#)/.test(reference)) continue;
    const url = new URL(reference, base + slug);
    if (!url.pathname.startsWith('/toonhub-island-duel/')) continue;
    let relative = decodeURIComponent(url.pathname.slice('/toonhub-island-duel/'.length));
    if (relative.endsWith('/')) relative += 'index.html';
    assert.ok(existsSync(join(directory, relative)), `${slug} references missing ${relative}.`);
    references += 1;
  }
}
for (const size of [48, 96, 192, 512]) {
  const png = readFileSync(join(directory, `brand/favicon-${size}.png`));
  assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
}
for (const [file, width, height] of [['social-card.png', 1200, 630], ['apple-touch-icon.png', 180, 180]]) {
  const png = readFileSync(join(directory, 'brand', file));
  assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
}
JSON.parse(read('site.webmanifest'));
for (const dir of readdirSync(directory).filter((name) => /^game(?:-[a-f0-9]{12})?$/.test(name))) {
  assert.match(read(`${dir}/index.html`), /name="robots" content="noindex,follow"/, `${dir} must be excluded from the index.`);
}
console.log(`SEO artifacts OK: ${slugs.length} indexable pages, ${schemas} JSON-LD blocks, ${references} local references, 6 PNG sizes, manifest and game noindex.`);
