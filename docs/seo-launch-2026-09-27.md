# 搜尋收錄與 SEO／AEO／GEO 上線驗收

日期：2026 年 9 月 27 日。品牌：Card & TW ＆ Game。

## 正式網站

- [品牌入口](https://howard118008y-commits.github.io/)
- [遊戲首頁](https://howard118008y-commits.github.io/toonhub-island-duel/)
- [玩法教學與常見問題](https://howard118008y-commits.github.io/toonhub-island-duel/guide/)
- [24 位角色圖鑑](https://howard118008y-commits.github.io/toonhub-island-duel/characters/)
- [關於遊戲與隱私](https://howard118008y-commits.github.io/toonhub-island-duel/about/)

## 已完成的網站工作

1. 新增 hostname 品牌首頁，補齊 Google 搜尋圖標需要的根首頁設定；保留遊戲原網址與存檔。
2. 原創卡牌與臺灣輪廓 logo、SVG／多尺寸 PNG favicon、Apple icon、1200 × 630 分享圖片。
3. 每頁獨立標題、摘要、自我 canonical、繁體中文語系、OG／Twitter 分享資料。
4. WebSite、WebPage、VideoGame、BreadcrumbList 等與可見內容一致的結構資料；不捏造評分、評論或組織身分。
5. 三個不依賴 JavaScript 的實用內容頁；24 位角色與 6 種羈絆逐欄對照實際遊戲資料。
6. hostname 根 robots.txt、合法 Sitemap index、4 頁遊戲 Sitemap 與 24 張角色圖片條目。
7. 開放一般與搜尋 AI 爬蟲擷取；提供補充 llms.txt，但不把它宣稱為排名或引用保證。
8. 遊戲雜湊執行頁與相容入口 noindex，避免與正式介紹頁競爭；保留遊戲功能。
9. GitHub 專案介紹、正式網址與主題分類已更新。
10. 部署前自動檢查搜尋設定，成功部署後自動向 IndexNow 通知 4 個遊戲內容網址。

## 外部平台紀錄

| 項目 | 實際結果 |
| --- | --- |
| Google Search Console | hostname URL-prefix 資源已透過 HTML meta 驗證擁有權 |
| Google 生成式 AI | 設定頁確認目前沿用「包含」；未排除 AI 摘要／AI 模式 |
| Google Sitemap | 已提交根 Sitemap index 與遊戲 Sitemap；初次回報「無法擷取」，尚不能視為讀取成功 |
| Google 個別索引要求 | 品牌入口、遊戲首頁、教學、圖鑑、關於共 5 頁，逐一顯示「已要求建立索引」，加入優先檢索佇列；不是已收錄 |
| IndexNow 遊戲內容 | GitHub Actions 回報接收 4 網址，HTTP 202，等待驗證／處理 |
| IndexNow 品牌入口 | 公開 key 檔已部署並讀回正確；品牌入口 1 網址收到 HTTP 202 |
| Bing Webmaster 登入 | Google OAuth 回傳 oauth_failure；未宣稱完成後台註冊，網址通知已使用 IndexNow |

Google Sitemap 擷取狀態與公開 HTTP 結果不同，最終檢查兩筆仍為「無法擷取」。已確認所有 Sitemap 均回傳 HTTP 200、合法 XML、正確同 host URL 與根 robots 設定；同時 5 個頁面的個別線上測試及索引要求均已獲接受。尚未查明 Google 端 Sitemap 擷取狀態的原因，以 Search Console 後續處理結果為準，不將已提交寫成已收錄。

## 驗證證據

- 遊戲 15 項規則／儲存測試通過；TypeScript 與正式建置通過。
- 搜尋產物檢查通過：4 個可索引頁、4 組 JSON-LD、83 個本機引用、6 個 PNG 尺寸。
- 獨立交叉審查通過：24 角色、6 羈絆、96 個同 host 引用、Sitemap／圖片／錨點與 IndexNow 邊界；沒有阻擋部署問題。
- 公開 HTTP 實測：42 個頁面／Sitemap／圖標／圖片／key 等資產全部 HTTP 200；另兩個遊戲入口 HTTP 200 且 noindex。
- 瀏覽器實際驗收：375 × 667 與 1280 寬度無水平溢出；首頁主按鈕、資訊頁直達遊戲、既有存檔接續、圖鑑陣營跳轉與技能展開正常；無瀏覽器警告或錯誤。
- 品牌正式首頁的 logo 與角色圖片均成功載入；favicon 指向可公開擷取的 96 × 96 PNG。
- [遊戲部署 36294035450](https://github.com/howard118008y-commits/toonhub-island-duel/actions/runs/36294035450) 成功，包含測試、建置、搜尋檢查與 IndexNow 通知。
- [品牌主站部署 36294268048](https://github.com/howard118008y-commits/howard118008y-commits.github.io/actions/runs/36294268048) 成功。

## 界線與維護

搜尋收錄、排名、搜尋結果圖標和 AI 引用由各平台判定，這次完成的是網站可擷取性、內容、品牌識別與實際提交。沒有購買連結、批量論壇灌文、建立虛假商家或假評論。教學與圖鑑是給玩家閱讀的內容，不是隱藏給爬蟲的文字。

Google favicon 與 site name 以 hostname 區分，因此品牌根首頁的設定可能影響同 hostname 其他專案的搜尋呈現。新增其他獨立品牌時，應規劃各自的 hostname。

來源與細節：[官方研究](seo-research-2026-09-27.md)、[實作說明](seo-implementation-2026-09-27.md)、[獨立審查](seo-independent-review-2026-09-27.md)。
