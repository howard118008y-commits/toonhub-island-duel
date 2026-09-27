# SEO 改版交叉審查

審查日期：2026-09-27（Asia/Taipei）。判定：**PASS，可部署；未發現需要阻擋部署的缺陷。**

本審查由未撰寫遊戲專案 SEO 程式與內容頁的研究代理執行，針對技術基礎與內容代理的產出進行交叉檢查。品牌根站由另一位代理獨立審查，不納入本人的自我驗收。這份結果不表示搜尋引擎已收錄；正式部署、Search Console 與 IndexNow 接收結果由上線紀錄另行保存。

## 審查範圍與結果

| 範圍 | 結果 | 證據與核對位置 |
| --- | --- | --- |
| 四個可收錄頁面 | PASS | 首頁、玩法、圖鑑、關於頁均有唯一 H1、自我 canonical、相符 og:url、繁體中文與可直接讀取的 HTML。`index.html:7`；`public/guide/index.html:7`；`public/characters/index.html:7`；`public/about/index.html:7`。 |
| 結構資料 | PASS | 4 個 JSON-LD 區塊可解析，WebPage／CollectionPage 與各頁 URL 一致；麵包屑名稱可見，引用共用 hostname `#website`；沒有虛構 review 或 aggregateRating。 |
| 24 張角色資料 | PASS | 獨立比對 `public/game/src/roster.js:68`：24 個 ID、不重複；地區、職業、台詞、地帶、陣營、階級、攻擊、生命、短技能、詳細技能與圖片編號全部相符。`public/characters/index.html:36` 起。 |
| 規則正文 | PASS | 6 種羈絆描述逐字移除空白後符合即時 TRAITS；金幣、升階、5＋3 席位、三合一、護盾、先攻、敗北上限與第十輪勝利條件符合引擎。`public/guide/index.html:37` 起。 |
| 網址與圖片 | PASS | 獨立解析驗證 96 個同 host 連結／素材引用存在；頁面 ID 無重複、同頁錨點有效；未引用錯誤的站根資產路徑。 |
| Sitemap | PASS | XML 可解析，恰好 4 個正式頁 URL、24 個不同角色圖片 URL；檔案存在。沒有 content-hashed runtime、redirect 或驗證檔進入 sitemap。`public/sitemap.xml:2`。 |
| 遊戲 runtime | PASS | 遊戲本體與 `/game/` 相容導向皆為 `noindex,follow`，首頁、內容頁仍可索引；沒有 robots 封鎖造成 noindex 無法讀取。`public/game/index.html:6`；`scripts/versioned-game.ts:35`。 |
| 圖標與分享圖 | PASS | 專案檢查器驗證 48、96、192、512 方形 PNG、180 Apple icon 與 1200×630 分享圖尺寸；manifest 可解析。`scripts/check-seo.mjs:38` 起。 |
| IndexNow 通知 | PASS | 固定官方 HTTPS endpoint、20 秒上限、限定專案 URL prefix；dry run 僅輸出 4 個正式頁與正確 keyLocation；公開 key 檔內容吻合，沒有加入帳號憑證或遊戲存檔。`scripts/submit-indexnow.mjs:3`。 |
| 部署流程 | PASS | 遊戲測試與建置之後先執行 SEO 檢查；發布成功才通知 IndexNow。通知失敗不把已發布網站判成部署失敗；工作紀錄仍會留下該步錯誤。`.github/workflows/deploy.yml:47`、`:59`。 |
| 隱私文字 | PASS | 真實 localStorage 名稱與來源相符；使用者清除／重開進度的說明正確。活動程式未找到 Google Analytics、廣告像素或外部字體呼叫；未宣稱代管商完全不處理連線資料。`public/about/index.html:39`；`public/game/src/storage.js:3`。 |

## 實際執行的機械驗證

- 作者提供的 `check:seo`：**4 頁、4 JSON-LD 區塊、83 個相對素材引用、6 PNG 尺寸、manifest 與 runtime noindex 通過**。
- 獨立 HTML／XML 解析：**4 頁唯一 H1、canonical／og:url 一致、96 個同 host URL、ID 與錨點、4 sitemap URL＋24 圖片、IndexNow key 內容通過**。96 與 83 的差異是本審查另外計入絕對同 host 引用。
- 獨立 ROSTER 比對：**24 位角色完整欄位與 6 種羈絆通過**。這是目前版本與實際遊戲資料的比對，並非只檢查卡牌數量。
- IndexNow 僅在本審查執行 **dry run**，沒有再次送出外部通知；實際送出由部署流程負責。
- 主代理另執行了建置及桌機／375px 新頁瀏覽、技能展開、導覽與 `#play` 進入遊戲；其結果由主代理上線驗收記錄承接，未冒稱本代理親自執行瀏覽器測試。

## 官方依據與界線

GitHub 隱私說明連結有效，2026-04-27 生效版本的「Service Usage Information」明確列出 IP、裝置、請求時間等資料；正文使用「GitHub 可能依服務運作處理連線資訊」而非替代管商保證零蒐集。[GitHub 隱私聲明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

公開 Search Console meta 是官方驗證設計，不是密碼；值由主代理在已登入官方介面取得。IndexNow 驗證檔同樣必須公開才可證明網站控制權。[Search Console 驗證](https://support.google.com/webmasters/answer/9008080?hl=en)、[IndexNow 驗證](https://www.indexnow.org/documentation)

程式沒有濫用 Google Indexing API、已廢棄 sitemap ping、虛構評價或隱藏關鍵字；說明文件正確區分「已發布／已提交／已收錄」。一般遊戲頁不適用招聘與直播專用 API。[Indexing API 適用範圍](https://developers.google.com/search/apis/indexing-api/v3/quickstart)

本次沒有尚待修復的 P0／P1／P2 問題。正式網路回應、Search Console 擁有權與 sitemap 接收、Google AI 包含設定，以及 IndexNow HTTP 結果仍必須以部署後實際觀測為準。
