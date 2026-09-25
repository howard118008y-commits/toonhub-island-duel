# TOONHUB × 島嶼對決

以 React、TypeScript、Vite、Tailwind CSS 與 lucide-react 製作的 TOONHUB 公仔輪播首頁，結合可直接遊玩的台灣地域卡牌遊戲。首頁四位公仔以 650 毫秒切換位置、大小、模糊程度與背景色，支援桌面及手機。

[網站](https://howard118008y-commits.github.io/toonhub-island-duel/) · [GitHub 專案](https://github.com/howard118008y-commits/toonhub-island-duel)

## 啟動

使用 Node.js 22 與 npm，在專案根目錄執行：

```sh
npm ci
npm run dev
```

開啟終端機顯示的開發網址。首頁的遊戲入口會以 iframe 載入同站台的 `game/`。

## 建置與預覽

```sh
npm run build
npm run preview
```

正式網站輸出至 `dist/`；`public/game/` 會一併複製為 `dist/game/`，包含遊戲頁面、樣式、卡牌資料、規則引擎與角色圖像。遊戲本身是靜態 JavaScript，無須另啟遊戲伺服器。

GitHub Pages 專案網址包含 `/toonhub-island-duel/`。目前 Vite 使用 `base: './'`，首頁資產與 iframe 的相對路徑可保留部署子路徑，變更儲存庫名稱時無須修改。若改用絕對 `base`，則須與部署網址一致，並確認首頁及 `game/` 都能載入。

## 部署至 GitHub Pages

1. 將專案與 `package-lock.json` 推送至此儲存庫的 `main` 分支。
2. 在儲存庫的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 在 **Actions → Deploy to GitHub Pages** 確認執行成功；如初次推送時尚未設定 Pages，可按 **Run workflow** 重新執行。
4. 開啟工作流程顯示的網站網址，確認輪播與卡牌遊戲均正常。

後續推送至 `main` 會自動部署，也可手動執行。工作流程使用 Node.js 22，依序執行 `npm ci`、`npm run build`，僅上傳 `dist/`。部署使用官方 GitHub Actions 與 `github-pages` 環境，不需自行設定個人存取權杖。

部署流程參考 [GitHub Pages 官方工作流程文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 卡牌玩法

24 位台灣地域角色可組成 12 張不重複牌組；預設牌組包含天母、信義、中和、永和。雙方英雄有 24 點生命，起手 5 張、起始費用 3；手牌最多 8 張，場上最多 4 位角色。

點選手牌出牌，再選擇能攻擊的我方角色與敵方目標。守護角色必須優先被攻擊，快攻角色可在進場當回合攻擊；角色另有抽牌、治療、增益、傷害與召喚等技能。結束回合後由電腦對手行動，牌庫用盡會累加疲勞傷害，直到分出勝負。

## 外部圖片與字體

首頁依規格直接使用以下四張 Figma Site 圖片，並在載入時預先載入：

| 圖片 | 背景色 | 原始來源 |
| --- | --- | --- |
| 1 | `#F4845F` | [公仔圖片 1](https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png) |
| 2 | `#6BBF7A` | [公仔圖片 2](https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png) |
| 3 | `#E882B4` | [公仔圖片 3](https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png) |
| 4 | `#6EB5FF` | [公仔圖片 4](https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png) |

`index.html` 透過 [Google Fonts 樣式表](https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap) 載入 **Anton** 與 **Inter**，字體檔由 `fonts.gstatic.com` 提供。

首頁圖片與字體需要網路及來源站台持續提供服務；卡牌遊戲的角色圖像則隨網站一起部署。外部圖片仍屬其原權利人所有，本專案未另行授予其使用權。
