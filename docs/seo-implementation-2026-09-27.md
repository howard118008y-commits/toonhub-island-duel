# Card & TW ＆ Game：搜尋與分享實作

日期：2026-09-27。範圍是本遊戲網站的技術 SEO、可讀內容、答案整理與來源一致性；不承諾搜尋排名或 AI 引用。

## 實作內容

| 項目 | 已實作方式 |
|---|---|
| 非 JavaScript 可讀 | 首頁 root 提供真實遊戲簡介與三個可直接追蹤的連結；React 啟動後以相同產品事實的互動首頁取代。玩法、圖鑑、關於皆為直接回傳完整 HTML 的靜態頁。 |
| 唯一正式網址 | 首頁與三內容頁各有 HTTPS 自我 canonical，含專案子路徑與尾端斜線。 |
| 標題與摘要 | 各頁有對應 title、description、繁體中文語言標記；內容聚焦免費臺灣單機自走棋，不堆砌關鍵字。 |
| 可見品牌 | 原創牌卡＋臺灣形状標誌沿用網站橘、藍、綠、粉四色；SVG、48／96／192／512 PNG 與 180 Apple touch icon。 |
| 社群分享 | 1200 × 630 原創品牌分享圖、Open Graph 與 Twitter card；圖片不借用其他遊戲素材。 |
| 結構化資料 | 真實 WebSite／WebPage／VideoGame，主站 WebSite ID 統一為 hostname 根目錄；遊戲實體保留專案 `#game`。沒有杜撰評分、評論、組織、人名或成就。 |
| sitemap | 僅列四個正式內容頁，不含遊戲版本入口、圖片本身或舊評估文件。角色圖像以圖鑑的 image sitemap 資訊提供。 |
| 避免重複遊戲頁 | 目前雜湊遊戲入口與舊相容入口皆有 `noindex,follow`，允許 crawler 讀取該標記；不以 robots 阻擋使 noindex 無法生效。 |
| AI 可讀內容 | 靜態規則、角色、FAQ 與可追溯說明優先；llms.txt 僅作輔助連結與事實目錄，不當作搜尋引擎官方要求。 |
| 更新通知 | 公開 IndexNow key、由 sitemap 生成的四網址通知；部署成功後非阻斷通知，HTTP 200／202 只表示收件或待驗證。 |
| 持續驗證 | CI 建置後執行 `check:seo`，驗 canonical、JSON-LD 語法、實體檔案連結、圖片尺寸、manifest、game noindex。 |

## Google favicon 與根站

Google 以 hostname 選擇搜尋圖示與網站名稱，GitHub Pages 專案子目錄不能各自取得獨立 hostname 圖示。專案內 favicon 可用於瀏覽器；另由 hostname 根目錄的品牌入口提供同一品牌圖示與 WebSite 實體。`/toonhub-island-duel/robots.txt` 只是備援說明，正式 robots 規則必須位於 hostname 的 `/robots.txt`。

根站與遊戲頁是不同內容：根站介紹品牌並連到遊戲，遊戲頁直接提供遊玩功能。兩者各自 canonical，不製造 doorway 批次頁面或假引用。

## 驗證方法與界線

- SVG 原始碼為原創向量，PNG 由 SVG 正確轉繪；已目視確認分享圖中文字可讀、標誌描邊與透明背景正常。
- `scripts/check-seo.mjs` 對建置後產物執行檔案與 metadata 檢查，不能取代 Search Console 實際收錄狀態或真人體驗。
- sitemap 與 IndexNow 提交是通知，不是收錄；Google 自行決定 canonical、排名、favicon、摘要及 AI 引用。
- 不提供虛假 FAQ rich result、應用程式評分或「滿分 SEO」承諾。Google 2026-05 起已停止 FAQ rich result，FAQ 可見問答仍有使用價值。
- 沒有宣稱線上多人、原生 App、完整離線快取、官方合作或不存在的成就。manifest 使用 browser 顯示模式，不虛構 PWA 離線能力。

## 參考官方文件

- [Google 搜尋結果 favicon](https://developers.google.com/search/docs/appearance/favicon-in-search)
- [Google 網站名稱](https://developers.google.com/search/docs/appearance/site-names)
- [Google robots.txt 規則](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt)
- [Google sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google 圖片 sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)
- [Google AI 搜尋功能與網站](https://developers.google.com/search/docs/appearance/ai-features)
- [Google 搜尋文件更新](https://developers.google.com/search/updates)
- [IndexNow 協定](https://www.indexnow.org/documentation)
