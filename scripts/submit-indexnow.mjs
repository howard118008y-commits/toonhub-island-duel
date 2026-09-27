import { readFileSync } from 'node:fs';

const host = 'howard118008y-commits.github.io';
const base = `https://${host}/toonhub-island-duel/`;
const key = '4c399b1be6b1324c4bef3968f589b70d';
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (urlList.some((url) => !url.startsWith(base))) throw new Error('IndexNow URLs must stay within the verified project path.');
const payload = { host, key, keyLocation: `${base}${key}.txt`, urlList };
if (!process.argv.includes('--submit')) {
  console.log(JSON.stringify(payload, null, 2));
  console.log('Dry run only. Use --submit after deployment to notify IndexNow; receipt does not guarantee indexing.');
} else {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow notification failed: HTTP ${response.status}`);
  console.log(`IndexNow received ${urlList.length} URLs (HTTP ${response.status}). This is a notification, not confirmation of indexing.`);
}
