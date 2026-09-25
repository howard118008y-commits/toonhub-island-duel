# Card & TW ＆ Game｜臺灣地域卡牌對戰

從24位臺灣地域角色中選12張組牌，在4個戰場席位中出牌、攻擊，挑戰電腦對手。首頁展示角色的地區、職業與台詞，並與遊戲同步角色圖像、配色與背景圖案；支援桌面及手機，返回首頁後可繼續原有對局。

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

## 地域角色與本地素材

24 位公仔依原有台灣地域圖鑑的個性、服裝及道具設定生成；地區、職業與台詞保留原稿，由頁面以繁體中文呈現，沒有將文字渲染進人物圖像。

| 本地圖像 | 角色編號 |
| --- | --- |
| `public/characters/regions-01.png` | 01–06：天母、信義、中和、永和、基隆、桃園 |
| `public/characters/regions-02.png` | 07–12：新竹市、竹北、苗栗、台中、彰化、南投 |
| `public/characters/regions-03.png` | 13–18：雲林、嘉義市、嘉義縣、台南、高雄、屏東 |
| `public/characters/regions-04.png` | 19–24：宜蘭、花蓮、台東、澎湖、金門、馬祖 |

每張圖像為 1536 × 1024 的透明 PNG，以 3 欄 × 2 列排列；每格 512 × 512，按編號由左至右、由上至下對應角色。首頁與遊戲從同一組本地素材顯示人物，圖像會隨網站一併部署。

人物個性、技能與台詞均為創作設定；地域文化與網路印象不是對全體居民的判定。
