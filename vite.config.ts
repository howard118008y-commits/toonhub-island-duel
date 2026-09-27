import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { versionedGame } from './scripts/versioned-game.ts';

export default defineConfig(({ command }) => {
  const game = versionedGame(fileURLToPath(new URL('./public/game', import.meta.url)));
  return {
    base: './',
    define: {
      'import.meta.env.VITE_GAME_ENTRY': JSON.stringify(command === 'build' ? game.entry : 'game/index.html'),
    },
    plugins: [react(), tailwindcss(), game.plugin],
  };
});
