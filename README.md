# Card & TW ＆ Game｜臺灣地域自走棋

招募 24 位臺灣地域角色，搭配羈絆與站位，挑戰 10 輪單機自動對戰。首頁與遊戲共用立體人物、四組地域配色及圖案；支援桌面、手機與瀏覽器本機存檔，不需帳號或遊戲伺服器。

[網站](https://howard118008y-commits.github.io/toonhub-island-duel/) · [玩法教學](https://howard118008y-commits.github.io/toonhub-island-duel/guide/) · [24角色圖鑑](https://howard118008y-commits.github.io/toonhub-island-duel/characters/) · [關於與隱私](https://howard118008y-commits.github.io/toonhub-island-duel/about/) · [GitHub 專案](https://github.com/howard118008y-commits/toonhub-island-duel)

## 設計與驗收紀錄

改版前設計評估（2026-09-27，舊卡牌對戰版本）：[Markdown 原文](docs/design-review-2026-09-27.md) · [HTML 閱讀版](docs/design-review-2026-09-27.html)。原報告與分數保留作改版前紀錄；HTML 可離線開啟，支援手機閱讀與 A4 列印。

自走棋設計、來源與簡化原則：[規則設計文件](docs/autobattler-design-2026-09-27.md)。8,000 次固定種子闖關結果：[平衡報告](docs/autobattler-balance-2026-09-27.md) · [原始 JSON](docs/autobattler-balance-2026-09-27.json)。

本次自走棋驗收：[實際通關、存檔恢復與待驗項目](docs/autobattler-acceptance-2026-09-27.md)。

## 啟動

使用 Node.js 22 與 npm，在專案根目錄執行：

```sh
npm ci
npm run dev
```

開啟終端機顯示的開發網址。首頁的遊戲入口會以 iframe 載入同站台的 `game/`。

## 建置與預覽

```sh
npm test
npm run test:balance
npm run build
npm run check:seo
npm run preview
```

正式網站輸出至 `dist/`；`public/game/` 會依全部遊戲檔案內容的雜湊輸出至 `dist/game-<hash>/`，`public/characters/` 則複製至 `dist/characters/`。Vite 自動定義 `VITE_GAME_ENTRY`，首頁直接載入版本入口，遊戲內相對 JS／CSS 模組共用目錄版本，不必逐檔維護 `?v=`。`dist/game/index.html` 保留為相容入口，將舊書籤導向目前版本，並提供繁體中文備援連結。版本目錄包含遊戲頁面、樣式、卡牌資料與規則引擎，人物素材維持獨立路徑。遊戲本身是靜態 JavaScript，無須另啟遊戲伺服器。

GitHub Pages 專案網址包含 `/toonhub-island-duel/`。目前 Vite 使用 `base: './'`，首頁資產、iframe 與遊戲內的相對路徑可保留部署子路徑；若更換公開網址，仍需同步更新 canonical、結構化資料、sitemap、IndexNow 與說明文件。若改用絕對 `base`，則須與部署網址一致，並確認首頁及 `game/` 都能載入。

## 部署至 GitHub Pages

1. 將專案與 `package-lock.json` 推送至此儲存庫的 `main` 分支。
2. 在儲存庫的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 在 **Actions → Deploy to GitHub Pages** 確認執行成功；如初次推送時尚未設定 Pages，可按 **Run workflow** 重新執行。
4. 開啟工作流程顯示的網站網址，確認輪播與卡牌遊戲均正常。

後續推送至 `main` 會自動部署，也可手動執行。工作流程使用 Node.js 22，依序執行 `npm ci`、`npm test`、`npm run build`、`npm run check:seo`，僅上傳 `dist/`；部署成功後通知 IndexNow，通知失敗不會回滾部署。部署使用官方 GitHub Actions 與 `github-pages` 環境，不需自行設定個人存取權杖。

部署流程參考 [GitHub Pages 官方工作流程文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 單機自走棋玩法

- 每場 24 點生命、10 輪；第 10 輪勝出且存活即可通關。
- 隊伍最多 5 位，備位最多 3 位。商店有 4 個等級、24 種角色、6 組羈絆；同羈絆上陣 2／4 種不同角色會啟動加成。
- 招募花 3 金幣、出售得 1 金幣、刷新花 1 金幣；免費凍結可以保留商店到下一輪。每輪金幣重新補足，不累積利息。
- 3 張相同普通角色自動合成金色角色，並獲得下一階角色的免費三選一獎勵。
- 招募後安排站位，按下開戰即可自動交戰。戰鬥中的受傷與增益不會帶到下一輪；動畫可以加速或略過，結果保持一致。
- 瀏覽器允許本機儲存時，每次操作會保存進度；重新整理可恢復。儲存被封鎖時仍可玩，但關閉頁面後無法保留。

借鏡《爐石戰記：英雄戰場》的招募與自動戰鬥循環，採用原創人物、技能、介面與單機關卡設計；未使用 Blizzard 的美術或程式碼。官方與論壇資料來源及差異見規則設計文件。

## 驗證

`npm test` 驗證規則、無效操作、合成、戰鬥與存檔。`npm run test:balance` 以固定種子比較多種招募策略；模擬用來找明顯失衡，不代表真人勝率。

## 地域角色與本地素材

本版採用 24 張獨立的 1024 × 1536 透明 PNG 立體潮玩人物，存放於 `public/characters/portrait-01.png` 至 `portrait-24.png`，依卡牌編號對應地域角色。地區、職業與台詞保留原稿，由頁面以繁體中文呈現，沒有將文字渲染進人物圖像。

網站優先載入 `public/characters/web/` 的 WebP：首頁保留 1024 × 1536，卡片使用 320 × 480；原始 PNG 完整保留。首頁與遊戲共用這組直式人物素材，等比例顯示；卡牌詳情呈現完整人物，小型戰場可裁切少量下緣。舊 `regions-01.png` 至 `regions-04.png` 圖集僅作獨立圖片尚未載入時的備援；`public/game/assets/character-atlas.png` 保留供編號 101「掌中戲偶」使用。

美術方向與每位角色的最終生成提示詞見 [立體潮玩角色美術紀錄](art-direction-v2.md)。

人物個性、技能與台詞均為創作設定；地域文化與網路印象不是對全體居民的判定。

## 搜尋與分享

首頁提供直接可讀的繁體中文介紹，另有三個靜態內容頁；canonical、Open Graph、WebSite／WebPage／VideoGame 結構化資料、品牌圖示、多尺寸 PNG、分享卡、sitemap 與輔助 llms.txt 一併部署。遊戲 iframe 與相容導向入口標示 noindex，避免重複內容。

- [SEO／AEO／GEO 實作說明](docs/seo-implementation-2026-09-27.md)
- `npm run check:seo`：檢查正式產物的四個可索引頁、結構化資料、靜態連結、品牌圖片與遊戲 noindex。
- `node scripts/submit-indexnow.mjs`：僅列出通知內容；`npm run notify:indexnow` 才送出。公開 key 只是網址擁有權證明，不是存取憑證。
- `public/robots.txt` 位於專案子路徑，不能代替 hostname 根目錄的 robots.txt；根站另行提供正式規則與品牌入口。

搜尋引擎會自行決定是否及何時收錄、顯示圖示或引用。結構化資料、提交 sitemap、IndexNow 收件與 llms.txt 均不代表已收錄或排名保證。
