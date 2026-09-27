import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export function versionedGame(sourceDir: string) {
  const hash = createHash('sha256');
  function visit(relativeDir = '') {
    const entries = readdirSync(join(sourceDir, relativeDir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const relativePath = join(relativeDir, entry.name);
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile()) {
        const content = readFileSync(join(sourceDir, relativePath));
        hash.update(`${relativePath}\0${content.length}\0`).update(content);
      }
    }
  }
  visit();
  const directory = `game-${hash.digest('hex').slice(0, 12)}`;
  let outputDir: string;
  const plugin: Plugin = {
    name: 'versioned-game-assets',
    apply: 'build',
    configResolved(config) {
      outputDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      // A sibling directory keeps every relative module and artwork URL valid.
      renameSync(join(outputDir, 'game'), join(outputDir, directory));
      const destination = `../${directory}/index.html`;
      mkdirSync(join(outputDir, 'game'));
      writeFileSync(join(outputDir, 'game', 'index.html'), `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${destination}"><title>開啟臺灣地域自走棋</title>
<script>location.replace(${JSON.stringify(destination)});</script></head>
<body><p>正在開啟最新版遊戲。<a href="${destination}">若未自動前往，請點此繼續。</a></p></body></html>
`);
    },
  };
  return { entry: `${directory}/index.html`, plugin };
}
