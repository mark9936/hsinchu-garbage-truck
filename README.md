# 新竹市垃圾車即時地圖

查詢新竹市垃圾車、資源回收車即時動態的靜態網頁。輸入地址或使用目前位置，地圖會顯示範圍內的路線、站點與車輛；滑鼠移到站點可看今天是否收垃圾／回收、表定時間與預估到站狀態。

資料來自新竹市環境保護局「[新竹市清運車便民查詢網](https://7966.hccg.gov.tw/WEB/)」。這是非官方工具，使用的是該網站未公開文件的 API，欄位日後可能變動。

## 地圖上的內容

- **路線與行進方向**：路線上的箭頭是垃圾車的行進方向。
- **站點**：搜尋範圍內的站點用大圓點；同一條路線在範圍外的「沿路站點」用小圓點，可在「地圖顯示 → 沿路」選擇顯示到多遠（不顯示、1／2／3 公里內、整條路線）。
- **到站時間**：站點旁的文字是預估到站時間（例如「約 9 分」），沒有即時預估時顯示表定時間。地圖縮得太小時不顯示，放大就會出現。
- **車輛**：執勤中的垃圾車（垃）與資源回收車（收），小三角形是車頭方向。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 整個網頁（單一檔案），放到 GitHub Pages 的就是它 |
| `worker.js`、`wrangler.toml` | Cloudflare Worker 轉接代理 |
| `serve.py` | 本機測試用的伺服器，內含同樣的轉接功能 |

## 為什麼需要代理

官方 API 沒有開放跨網域（CORS），瀏覽器不允許其他網域的網頁直接讀取它。所以網頁本身是純靜態的，但資料要經過一支很小的轉接程式。

## 在本機試用

```sh
python3 serve.py
```

開啟 <http://localhost:8000>。不需要安裝任何套件，也不需要 Cloudflare 帳號。

## 部署到 GitHub Pages

### 1. 部署 Cloudflare Worker

先把 `worker.js` 裡的 `ALLOWED_ORIGINS` 第一行改成你的 GitHub Pages 網域，例如 `https://yourname.github.io`（只要網域，不含路徑與結尾斜線）。

```sh
npx wrangler login     # 第一次使用時登入（免費方案即可）
npx wrangler deploy
```

完成後會顯示 Worker 網址，例如 `https://hsinchu-trash-proxy.yourname.workers.dev`。

不想用指令的話，也可以在 Cloudflare 後台建立一個 Worker，把 `worker.js` 的內容整份貼上後部署。

確認代理正常：

```sh
curl "https://你的-worker-網址/getCarLocation?rId=all" | head -c 200
```

看到 `{"data":{"total":…` 開頭的 JSON 就代表成功。

### 2. 把 Worker 網址填進網頁

編輯 `index.html`，找到 `DEFAULT_API_BASE`，填入上一步的網址（結尾不要加斜線）：

```js
DEFAULT_API_BASE: 'https://hsinchu-trash-proxy.yourname.workers.dev',
```

### 3. 推上 GitHub 並開啟 Pages

把這個資料夾推到 GitHub repo，在 repo 的 Settings → Pages 選擇要發布的分支。網址會是 `https://yourname.github.io/repo名稱/`。

如果網頁顯示「代理拒絕了這個網站來源」，代表 `ALLOWED_ORIGINS` 與實際網域不一致，修正後重新 `npx wrangler deploy`。

## 使用上的限制

- 官方 API 的座標查詢最大只到 500 公尺。選 1 公里或 2 公里時，網頁會改抓全市資料（約 180KB）再自行篩選，每次更新的流量較大。
- 路線超過 8 條時，離查詢位置最近的 8 條有各自的顏色，其餘以灰色虛線顯示。
- 顯示沿路站點時，符合篩選的路線在 8 條以內會逐條抓時刻表（每條約 2KB）；超過 8 條則改抓全市資料（約 180KB）。在意行動網路流量的話，可把「沿路」改成「不顯示範圍外的站點」。
- 行進方向是依官方軌跡資料的點順序畫的。2026-11-15 以全部 139 條路線的站點順序核對過，方向一致；若官方日後更改資料格式，箭頭可能需要重新核對。
- 地址搜尋使用 Esri ArcGIS 地理編碼服務，輸入的文字會傳送到該服務。門牌地址最準；巷弄或地標建議改選搜尋結果中的「站點」，或直接點地圖指定位置。
- Worker 會把即時資料快取 10 秒、路線軌跡快取 12 小時，以減少對市府伺服器的請求。
