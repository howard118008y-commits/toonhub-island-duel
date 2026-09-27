# 搜尋曝光官方依據與提交驗收

查核日期：2026-09-27（Asia/Taipei）。本文件整理 Google、OpenAI、IndexNow、GitHub 的官方文件，不以第三方 SEO 分數當作排名保證。實際部署與提交結果另見本次上線紀錄。

## 站點與完成條件

遊戲網址為 `https://howard118008y-commits.github.io/toonhub-island-duel/`，屬 GitHub Pages 專案子目錄。品牌入口使用同 hostname 的 `/`；遊戲地址維持不變。

| 工作 | 可驗收的完成條件 | 不代表什麼 |
| --- | --- | --- |
| 網頁與圖標發布 | 正式網址回應成功，HTML 有 canonical、描述、圖標；圖片可擷取 | 不代表 Google 已顯示圖標 |
| 網站驗證 | Search Console 官方介面確認擁有權，驗證標籤持續保留 | 不代表已收錄 |
| Sitemap 提交 | 官方介面列出提交紀錄、可讀取；保留實際狀態 | 不代表列出的全部網址會收錄 |
| 個別網址索引要求 | URL Inspection 確認接受索引要求 | 不代表立即上榜或排名上升 |
| IndexNow | 留存 HTTP 狀態；200 是收到，202 是待金鑰驗證 | 不代表 Google 收錄，也不代表 Bing 已收錄 |
| Google AI 曝光準備 | 可索引、可摘要、真實文字與結構資料一致；Search generative AI 未排除 | 不保證 AI 摘要引用 |

## Google 圖標、站名與根目錄

- Google 搜尋圖標以 **hostname** 為單位，專案子目錄不能獨立設定搜尋 favicon；瀏覽器分頁圖標則仍可按各頁設定。根首頁需有穩定的 `rel="icon"`。選用 96×96 PNG，也保留 SVG 與其他尺寸。Googlebot 與 Googlebot-Image 必須能讀取首頁及圖片。[官方 favicon 說明](https://developers.google.com/search/docs/appearance/favicon-in-search)
- Google 站名同樣不支援子目錄。`WebSite` 的 `url` 指向 hostname 根首頁，名稱與可見品牌一致；專案頁再引用同一個 `#website`。根首頁有獨立、可讀的品牌介紹與遊戲導覽，不做空白跳轉頁。[官方站名說明](https://developers.google.com/search/docs/appearance/site-names)
- `robots.txt` 只有放在 `https://howard118008y-commits.github.io/robots.txt` 才管理此 host；專案內的同名檔案不是有效的 robots 控制入口。根檔案只使用 `Allow: /` 與 sitemap 宣告，避免誤封其他專案。[官方 robots.txt 規則](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt)
- 主站使用帳號名稱對應的 GitHub Pages 儲存庫；既有 project site 仍有自己的專案路徑。新增前查核主站與儲存庫不存在，發布前後確認遊戲路徑仍正常。這個 favicon 和站名可能影響該 hostname 下其他專案，屬 Google 的共同限制。[GitHub Pages 官方說明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## Google 索引與 sitemap

- 以帶尾端斜線的 **URL-prefix property** 驗證遊戲路徑；沒有 github.io DNS 控制權時，不嘗試偽造 Domain property 驗證。根主站可另以 URL-prefix 驗證。[Property 類型](https://support.google.com/webmasters/answer/34592?hl=en)
- HTML meta 驗證字串必須來自目前帳號的官方驗證畫面，放在公開首頁 `head` 並長期保留；不可猜測或借用其他網站字串。[擁有權驗證](https://support.google.com/webmasters/answer/9008080?hl=en)
- Sitemap 僅包含想被收錄的正式 canonical URL，使用絕對網址，`lastmod` 反映真實內容變更；不列 content-hashed 遊戲 runtime、重複 redirect 或驗證檔。根 `sitemap.xml` 使用 sitemap index，分別引用根首頁 sitemap 及專案 sitemap。[建立與提交 sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- 索引要求透過已驗證 Search Console 的 URL Inspection；提交者需 owner 或 full user。Google 可能花數日至數週處理，也可能不收錄，反覆提交同網址不會加速。[要求重新擷取](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- 不使用已淘汰的 Google sitemap ping endpoint；不將一般遊戲頁送進僅適用 JobPosting 或直播 BroadcastEvent 的 Indexing API。[Ping 停用公告](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping)、[Indexing API 適用範圍，更新 2026-07-16](https://developers.google.com/search/apis/indexing-api/v3/quickstart)

## AEO、GEO 與 AI 搜尋

- Google 2026 年官方指南仍以有效 SEO、原創有用內容、可抓取與清楚頁面架構為核心。Guide、角色資料與 FAQ 要讓人實際看得到；結構資料不得與正文矛盾，不能杜撰玩家評分、評價數、下載量或第三方背書。[生成式 AI 搜尋最佳做法，更新 2026-07-10](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- `llms.txt` 是其他系統可使用的輔助索引；Google 官方明確說它對 Google 搜尋可見度及排名沒有正面或負面影響，不把它當成收錄開關。無須「AI 專用 schema」，也不為關鍵字變體大量生成相似頁。[同一份 Google 官方指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- Google FAQ rich result 已於 **2026-05-07 停止顯示**，2026-06-15 移除說明文件。因此仍可製作實用問答，但不能宣稱 FAQ schema 會產生 Google FAQ 富結果。官方更新也記載 llms.txt 的 2026-06-15 澄清。[Google Search 更新紀錄](https://developers.google.com/search/updates)
- Search Console 的 **Settings → Search generative AI** 已於 2026-08-31 全球推出；預設 Include，子資源可能 Inherit。驗證時確認未選 Exclude。報表可能因尚無足夠曝光而未顯示，不能據此認定設定失敗。[AI 包含控制](https://support.google.com/webmasters/answer/16908024)、[AI 效能報表](https://support.google.com/webmasters/answer/16984139)
- OpenAI 的 **OAI-SearchBot** 用於 ChatGPT 搜尋；**GPTBot** 是模型訓練用途，兩者可分別控制。允許搜尋爬蟲有助內容具備進入搜尋答案的資格，不保證引用；允許 GPTBot 不是搜尋曝光必要條件。`ChatGPT-User` 是使用者觸發的存取，不能拿它代替搜尋爬蟲設定。[OpenAI 爬蟲官方說明](https://developers.openai.com/api/docs/bots)

## IndexNow 可行提交

官方允許將 key 檔放在相同 host 的子目錄，並在每次提交指定 `keyLocation`。例如 `/toonhub-island-duel/<key>.txt` 的 key，只可提交 `/toonhub-island-duel/` 以下的 URL；不能用它提交 hostname 根首頁。若要提交根首頁，需根層級 key 或另一個符合範圍的 key。[IndexNow 官方文件](https://www.indexnow.org/documentation)

執行順序：發布 UTF-8 純文字 key → 確認公開可讀且內容正確 → 以同 host、相同 prefix 的 canonical URL 提交 → 記錄 HTTP 結果。HTTP 200 表示接收、202 表示待驗 key；403／422 需修正 key 或範圍，429 表示節流，不連續轟炸。協定參與引擎會相互分享提交；這不是 Google 的 URL Inspection 流程。

## 搜尋抽查與工程審查

2026-09-27 以網路搜尋工具抽查 `site:howard118008y-commits.github.io/toonhub-island-duel/`、`"Card & TW ＆ Game"` 與品牌加台灣關鍵詞，回傳結果未見本專案。這是有限樣本，不是 Google 全部索引的證明；索引狀態以 Search Console URL Inspection 與 Page indexing 為準，不能寫成「確定未收錄」。

本次工程審查關注：HTML 不依賴點擊遊戲才出現介紹；每頁只有正確 canonical；404 不被錯誤當有效內容；圖片和內部連結使用專案 base path；手機使用者能看到同樣正文；JSON-LD 語法可解析、資料能在頁面找到；sitemap 不納入無限 runtime 版本；沒有隱藏關鍵字或地區重複薄頁。公開元資料中不放機密；Search Console 驗證字串按設計公開但保留擁有權。

不建立不存在的實體商家地點，不濫用招聘／直播索引類型，不冒充論壇使用者製造推薦，也不購買或批次發送垃圾外鏈。這些行為不是本遊戲的有效曝光工作。
