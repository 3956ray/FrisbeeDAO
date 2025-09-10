# FrisbeDAO MVP 開發 TODO 清單 - 更新版

## 📅 開發時間線：12週完成 MVP

## ✅ 已完成的核心智能合約開發

### 🎯 智能合約架構完成情況
- ✅ **AthleteRegistry.sol** - 運動員註冊管理合約（685行）
  - 等級系統邏輯、成就記錄、聲譽分數系統、認證機制、管理員控制
- ✅ **PersonalTokenFactory.sol** - 個人代幣工廠合約（619行）
  - 聯合曲線定價、收益分配、代幣管理、流動性池穩定器
- ✅ **PersonalToken.sol** - 個人代幣模板（內嵌於Factory）
  - ERC-20標準、聯合曲線交易、持有者特權、價格歷史記錄
- ✅ **PriceOracle.sol** - 價格預言機合約（428行）
  - Chainlink整合、批量更新、多簽驗證、價格調整限制
- ✅ **ContentManager.sol** - 內容管理合約（654行）
  - 付費內容管理、訪問權限控制、IPFS整合、解鎖記錄
- ✅ **AchievementTracker.sol** - 成就追蹤合約（557行）
  - NFT成就系統、驗證機制、成就類型管理

### 🧪 測試與部署基礎設施
- ✅ 完整的測試套件（4個主要測試文件）
- ✅ 部署腳本和配置文件
- ✅ ABI提取和類型生成
- ✅ 合約文檔和部署指南
- ✅ 本地部署配置完成

### 🎨 前端基礎架構
- ✅ **Next.js 15 + TypeScript** 項目架構
- ✅ **Web3 整合** - RainbowKit + Wagmi + Viem
- ✅ **UI 組件庫** - Radix UI + Tailwind CSS
- ✅ **基礎組件** - 錢包連接、運動員註冊、IPFS上傳
- ✅ **狀態管理** - TanStack Query
- ✅ **開發工具** - ESLint + TypeScript 配置

---

## 🏗️ Phase 1: 核心代幣化功能 (週 1-4)

### Week 1: 智能合約升級與部署

#### 🔧 智能合約開發

- [x] **升級 AthleteRegistry 合約**
    
    - [x] 添加等級系統邏輯（累計投資金額計算）
    - [x] 添加成就記錄功能
    - [x] 添加聲譽分數系統
    - [x] 添加運動員認證機制（社交媒體驗證狀態）
    - [x] 添加管理員角色控制
    - [x] 整合預言機接口（Chainlink）
- [x] **升級 PersonalTokenFactory 合約**
    
    - [x] 實現聯合曲線定價機制（P = 0.01 * (1 + supply/1000)^1.5）
    - [x] 添加混合模式價格調整邏輯
    - [x] 實現收益分配（75%/20%/5%）
    - [x] 添加代幣元數據管理
    - [x] 實現代幣暫停/恢復功能
    - [x] 實現流動性池價格穩定器
- [x] **新增 PersonalToken 合約模板**
    
    - [x] ERC-20 標準實現
    - [x] 聯合曲線買入/賣出功能
    - [x] 持有者特權記錄
    - [x] 價格歷史記錄（鏈上存儲）
    - [x] 分紅機制實現
    - [x] 無滑點即時成交機制
- [x] **新增 PriceOracle 合約**
    
    - [x] Chainlink Automation 整合
    - [x] 批量價格更新功能
    - [x] 多簽驗證機制
    - [x] 價格調整範圍限制（±10%/24小時）
    - [x] 緊急暫停機制
- [x] **新增 ContentManager 合約**
    
    - [x] 付費內容管理
    - [x] 訪問權限控制
    - [x] 內容CID記錄（IPFS哈希）
    - [x] 解鎖記錄追蹤

#### 🧪 合約測試與部署

- [x] 單元測試覆蓋率 > 90%
- [x] 整合測試所有合約交互
- [x] 聯合曲線定價測試
- [x] 預言機更新測試
- [x] Gas 優化（目標：註冊 < 100k gas，交易 < 80k gas）
- [x] 安全測試（重入攻擊、整數溢出等）
- [x] 本地網路完整部署測試
- [ ] Polygon zkEVM Testnet 部署與驗證

### Week 2: 後端 API 開發與數據層建設

#### 🌐 核心 API 服務

- [ ] **用戶管理服務**
    
    - [ ] POST `/api/auth/connect` - 錢包連接認證
    - [ ] GET `/api/users/profile` - 獲取用戶資料
    - [ ] PUT `/api/users/profile` - 更新用戶資料
    - [ ] POST `/api/users/upload-avatar` - 上傳頭像到 IPFS
- [ ] **運動員管理服務**
    
    - [ ] POST `/api/athletes/register` - 運動員註冊
    - [ ] GET `/api/athletes/:address` - 獲取運動員詳情
    - [ ] PUT `/api/athletes/:address` - 更新運動員資料
    - [ ] POST `/api/athletes/verify-social` - 社交媒體認證
    - [ ] GET `/api/athletes/verification-status/:address` - 認證狀態查詢
- [ ] **社交媒體認證服務**
    
    - [ ] POST `/api/auth/instagram` - Instagram OAuth認證
    - [ ] POST `/api/auth/twitter` - Twitter OAuth認證
    - [ ] POST `/api/auth/xiaohongshu` - 小紅書認證（第三方服務）
    - [ ] POST `/api/auth/tiktok` - TikTok OAuth認證
    - [ ] GET `/api/auth/verify-followers` - 驗證粉絲數（>100）
    - [ ] POST `/api/auth/refresh-verification` - 30天自動重新驗證
- [ ] **代幣管理服務**
    
    - [ ] POST `/api/tokens/create` - 創建個人代幣
    - [ ] GET `/api/tokens/:address/price` - 獲取代幣實時價格
    - [ ] GET `/api/tokens/:address/curve-price` - 計算聯合曲線價格
    - [ ] GET `/api/tokens/:address/history` - 獲取價格歷史
    - [ ] POST `/api/tokens/buy` - 購買代幣（聯合曲線）
    - [ ] POST `/api/tokens/sell` - 售出代幣（聯合曲線）
    - [ ] GET `/api/tokens/:address/holders` - 獲取持有者列表

#### 📊 數據服務

- [ ] **市場數據服務**
    
    - [ ] GET `/api/market/top10` - 市值 Top 10 運動員
    - [ ] GET `/api/market/trending` - 24小時漲幅榜
    - [ ] GET `/api/market/stats` - 平臺總體統計
    - [ ] GET `/api/market/liquidity-pool` - 流動性池狀態
- [ ] **預言機數據服務**
    
    - [ ] POST `/api/oracle/match-data` - 提交比賽數據
    - [ ] GET `/api/oracle/price-calculation` - 價格計算（鏈下）
    - [ ] POST `/api/oracle/update-prices` - 批量更新價格（24小時）
    - [ ] GET `/api/oracle/data-sources` - 數據源狀態
- [ ] **爬蟲服務**
    
    - [ ] 中華民國飛盤協會數據抓取
    - [ ] WFDF世界飛盤總會數據抓取
    - [ ] 賽事官網數據解析
    - [ ] 數據驗證與清洗
    - [ ] 多節點共識機制
- [ ] **等級服務**
    
    - [ ] GET `/api/levels/:userAddress/:athleteAddress` - 獲取用戶對特定運動員的等級
    - [ ] POST `/api/levels/update` - 更新等級（內部調用）

#### 🗄️ 數據庫設計與實現

- [ ] **PostgreSQL 表設計**
    
    ```sql
    - users: id, wallet_address, username, email, avatar_ipfs, created_at, updated_at
    - athletes: user_id, sport, bio, achievements, stats, verification_status
    - social_verifications: athlete_id, platform, social_id_hash, follower_count, verified_at
    - tokens: address, athlete_id, name, symbol, total_supply, current_price, market_cap
    - transactions: id, user_id, token_address, type, amount, price, timestamp, tx_hash
    - user_levels: user_id, athlete_id, cumulative_investment, current_level, updated_at
    - encrypted_messages: id, sender, recipient, encrypted_content, nonce, created_at, expires_at
    - price_history: token_address, price, timestamp, adjustment_reason
    ```
    
- [ ] **IPFS 存儲配置**
    
    - [ ] Pinata API 整合
    - [ ] CloudFlare IPFS 網關設置
    - [ ] 內容上傳工作流
    - [ ] CID 索引管理
- [ ] **Redis 緩存配置**
    
    - [ ] 熱門動態緩存（TTL: 1小時）
    - [ ] 排行榜緩存（TTL: 5分鐘）
    - [ ] Session 管理
    - [ ] WebSocket 連接池
    - [ ] 價格數據緩存

### Week 3: TradingView 風格首頁開發

#### 📈 首頁股票篩選器組件

- [ ] **TopAthletes 組件**
    
    - [ ] 市值 Top 10 運動員列表
    - [ ] 實時價格顯示（聯合曲線計算）
    - [ ] 24小時漲跌幅（紅綠配色）
    - [ ] 簡化 K 線圖整合
    - [ ] 一鍵購買按鈕
    - [ ] 每5分鐘自動刷新
    - [ ] 流動性池狀態顯示
- [ ] **PriceChart 組件**
    
    - [ ] 整合 TradingView Lightweight Charts
    - [ ] 支援 24小時、7天、30天時間範圍
    - [ ] 聯合曲線價格軌跡顯示
    - [ ] 價格、成交量雙圖表
    - [ ] 滑鼠懸停顯示詳細數據
    - [ ] 響應式設計適配移動端
- [ ] **QuickBuy 組件**
    
    - [ ] 金額輸入（支援美金和 ETH）
    - [ ] 聯合曲線價格即時計算
    - [ ] 預期獲得代幣數量計算
    - [ ] Gas 費估算
    - [ ] 一鍵購買確認
    - [ ] 交易狀態追蹤

#### 🎨 UI/UX 設計實現

- [ ] **色彩系統**
    
    - [ ] 主色調：藍色 (#3B82F6)
    - [ ] 上漲：綠色 (#10B981)
    - [ ] 下跌：紅色 (#EF4444)
    - [ ] 背景：淺灰 (#F8FAFC)
    - [ ] 文字：深灰 (#1F2937)
- [ ] **響應式佈局**
    
    - [ ] Desktop: 1200px+ 三欄佈局
    - [ ] Tablet: 768px-1199px 兩欄佈局
    - [ ] Mobile: 768px 以下單欄佈局
    - [ ] 導航欄移動端折疊菜單

### Week 4: 代幣交易系統整合

#### 💱 前端交易功能

- [ ] **BuyToken 組件**
    
    - [ ] 連接錢包檢查
    - [ ] 餘額充足性驗證
    - [ ] 聯合曲線價格顯示
    - [ ] 無滑點保證提示
    - [ ] 交易確認對話框
    - [ ] 成功/失敗狀態處理
- [ ] **SellToken 組件**
    
    - [ ] 持有代幣數量顯示
    - [ ] 售出數量滑桿選擇
    - [ ] 聯合曲線預期收益計算
    - [ ] 確認售出流程
    - [ ] 交易記錄更新
- [ ] **TransactionHistory 組件**
    
    - [ ] 個人交易歷史列表
    - [ ] 按時間、類型、代幣篩選
    - [ ] 交易詳情查看
    - [ ] 導出 CSV 功能
    - [ ] 分頁加載優化
- [ ] **LiquidityPool 組件**
    
    - [ ] 流動性池狀態顯示
    - [ ] 價格穩定器狀態
    - [ ] 準備金餘額
    - [ ] 自動調節記錄

#### ⚡ 性能優化

- [ ] **前端優化**
    
    - [ ] React Query 數據緩存
    - [ ] 虛擬滾動大列表
    - [ ] 圖片懶加載（IPFS優化）
    - [ ] 代碼分割和預加載
- [ ] **後端優化**
    
    - [ ] Redis 緩存熱點數據
    - [ ] 數據庫索引優化
    - [ ] API 響應壓縮
    - [ ] CloudFlare CDN 配置

---

## 📱 Phase 2: 社交功能核心 (週 5-8)

### Week 5: 動態發布系統

#### ✍️ 內容創建功能

- [ ] **PostComposer 組件**
    
    - [ ] 文字輸入（280字符限制，實時計數）
    - [ ] 圖片上傳到IPFS（最多4張，壓縮優化）
    - [ ] 視頻上傳到IPFS（最長60秒，格式轉換）
    - [ ] 付費內容標記
    - [ ] 發布權限設置（公開/代幣持有者）
    - [ ] Emoji 選擇器
    - [ ] @ 提及用戶功能
- [ ] **MediaUpload 組件**
    
    - [ ] 拖拽上傳支援
    - [ ] 文件類型驗證
    - [ ] 上傳進度顯示
    - [ ] 圖片預覽和編輯
    - [ ] IPFS上傳整合（Pinata API）
    - [ ] CloudFlare CDN加速
    - [ ] 上傳失敗重試機制
- [ ] **PaidContent 組件**
    
    - [ ] 付費內容標記 UI
    - [ ] 解鎖等級設置
    - [ ] 價格設定功能
    - [ ] 預覽模式切換
    - [ ] 收入分成顯示

#### 🗄️ 內容管理後端

- [ ] **動態管理 API**
    
    - [ ] POST `/api/posts` - 創建動態（含IPFS上傳）
    - [ ] GET `/api/posts/:id` - 獲取單個動態
    - [ ] PUT `/api/posts/:id` - 編輯動態
    - [ ] DELETE `/api/posts/:id` - 刪除動態
    - [ ] GET `/api/posts/user/:address` - 獲取用戶動態
    - [ ] POST `/api/posts/upload-media` - 媒體文件上傳到IPFS
- [ ] **IPFS整合服務**
    
    - [ ] Pinata SDK配置
    - [ ] 內容上傳與固定
    - [ ] CID管理與索引
    - [ ] CloudFlare網關配置
    - [ ] 備份策略實施
- [ ] **數據庫表設計**
    
    ```sql
    posts: id, author_id, content, ipfs_cid, media_cids, is_paid, unlock_level, price, created_at
    post_unlocks: user_id, post_id, unlocked_at
    content_index: ipfs_cid, content_type, size, created_at
    ```
    

### Week 6: 時間線與互動系統

#### 📰 時間線功能

- [ ] **Timeline 組件**
    
    - [ ] 個人化內容推薦算法
    - [ ] 無限滾動加載
    - [ ] 內容優先級排序（持幣者優先）
    - [ ] 實時更新機制
    - [ ] 付費內容預覽
    - [ ] 骨架屏加載
    - [ ] IPFS內容加載優化
- [ ] **PostCard 組件**
    
    - [ ] 運動員信息顯示
    - [ ] 代幣價格實時顯示
    - [ ] 等級標識
    - [ ] 互動按鈕組
    - [ ] 分享功能
    - [ ] 舉報功能
- [ ] **PrivateMessage 組件**
    
    - [ ] 端到端加密實現（ethereum-cryptography）
    - [ ] ECDH密鑰交換
    - [ ] AES-256-GCM消息加密
    - [ ] 消息列表顯示
    - [ ] 已讀回執
    - [ ] 7天自動刪除
    - [ ] 公鑰管理
- [ ] **FeedAlgorithm 服務**
    
    - [ ] 持有代幣運動員優先
    - [ ] 關注運動員次之
    - [ ] 基於等級的內容權重
    - [ ] 互動數據分析
    - [ ] 個性化推薦

### Week 7: 進階社交功能

#### 🎯 高級功能開發

- [ ] **Stories 限時動態**
    
    - [ ] 24小時自動消失機制
    - [ ] IPFS臨時存儲策略
    - [ ] 文字、圖片、短視頻支援
    - [ ] 代幣持有者專屬設置
    - [ ] 觀看記錄追蹤
- [ ] **NotificationSystem 組件**
    
    - [ ] WebSocket實時推送
    - [ ] 交易通知
    - [ ] 社交互動通知
    - [ ] 價格變動提醒
    - [ ] 認證狀態更新
- [ ] **SearchFunction 組件**
    
    - [ ] 運動員搜索
    - [ ] 代幣搜索
    - [ ] 內容搜索（基於IPFS索引）
    - [ ] 話題標籤搜索
    - [ ] 搜索建議與自動完成

### Week 8: 數據分析與優化

#### 📊 分析系統

- [ ] **Analytics Dashboard**
    
    - [ ] 用戶行為分析
    - [ ] 代幣交易統計
    - [ ] 內容互動數據
    - [ ] 預言機數據監控
    - [ ] 系統性能指標
- [ ] **運動員數據面板**
    
    - [ ] 粉絲增長曲線
    - [ ] 代幣價格歷史
    - [ ] 內容表現分析
    - [ ] 收益統計
    - [ ] 比賽成績追蹤
	- [ ] 系統監控服務
    - [ ] 異常交易檢測（價格操控、洗盤）
    - [ ] IPFS節點健康檢查
    - [ ] 預言機數據準確性驗證
    - [ ] API性能監控
    - [ ] 智能合約事件監聽

---

## 🎨 Phase 3: 用戶體驗優化 (週 9-12)

### Week 9: 移動端適配與PWA

#### 📱 移動優化

- [ ] **響應式設計完善**
    
    - [ ] 移動端手勢操作
    - [ ] 觸摸優化按鈕大小
    - [ ] 移動端專屬導航
    - [ ] 橫豎屏適配
    - [ ] iOS/Android樣式差異處理
- [ ] **PWA 實現**
    
    - [ ] Service Worker配置
    - [ ] 離線內容緩存（IPFS本地緩存）
    - [ ] 推送通知實現
    - [ ] 應用圖標與啟動畫面
    - [ ] Web App Manifest配置
- [ ] **性能優化**
    
    - [ ] 移動端圖片壓縮
    - [ ] IPFS預加載策略
    - [ ] 減少API調用次數
    - [ ] WebSocket連接優化
    - [ ] 電池使用優化

### Week 10: 安全審計與測試

#### 🔒 安全實施

- [ ] **智能合約安全**
    
    - [ ] 第三方審計準備
    - [ ] 重入攻擊防護驗證
    - [ ] 整數溢出檢查
    - [ ] 權限控制測試
    - [ ] 緊急暫停機制測試
    - [ ] 預言機數據驗證
- [ ] **前端安全**
    
    - [ ] XSS防護實施
    - [ ] CSRF防護配置
    - [ ] CSP策略設置
    - [ ] 敏感數據加密存儲
    - [ ] 私鑰管理安全檢查
- [ ] **後端安全**
    
    - [ ] SQL注入防護
    - [ ] Rate Limiting實施
    - [ ] DDoS防護配置
    - [ ] API認證加固
    - [ ] 數據加密傳輸
- [ ] **私信加密測試**
    
    - [ ] 端到端加密驗證
    - [ ] 密鑰交換安全性
    - [ ] 消息完整性檢查
    - [ ] 自動刪除機制測試

#### 🧪 測試完善

- [ ] **單元測試**
    
    - [ ] 智能合約測試覆蓋 > 95%
    - [ ] API測試覆蓋 > 90%
    - [ ] 前端組件測試 > 85%
    - [ ] 聯合曲線計算測試
    - [ ] 預言機數據處理測試
- [ ] **集成測試**
    
    - [ ] 錢包連接流程
    - [ ] 完整交易流程
    - [ ] 社交媒體認證流程
    - [ ] IPFS上傳下載流程
    - [ ] 私信加密流程
- [ ] **壓力測試**
    
    - [ ] 10,000並發用戶測試
    - [ ] IPFS負載測試
    - [ ] 預言機更新壓力測試
    - [ ] WebSocket連接數測試
    - [ ] 數據庫查詢優化

### Week 11: Beta測試與優化

#### 🚀 Beta準備

- [ ] **測試環境部署**
    
    - [ ] Polygon zkEVM測試網部署
    - [ ] IPFS節點配置
    - [ ] CloudFlare CDN設置
    - [ ] 預言機服務部署
    - [ ] 監控系統配置
- [ ] **Beta用戶招募**
    
    - [ ] 50位種子運動員邀請
    - [ ] 測試指南編寫
    - [ ] 反饋收集系統
    - [ ] Bug追蹤系統
    - [ ] 獎勵機制設計
- [ ] **數據遷移準備**
    
    - [ ] 測試數據清理方案
    - [ ] 用戶資產遷移流程
    - [ ] IPFS內容遷移
    - [ ] 智能合約升級方案
    - [ ] 回滾計劃制定

#### 📋 文檔完善

- [ ] **用戶文檔**
    
    - [ ] 使用手冊編寫
    - [ ] FAQ整理
    - [ ] 視頻教程錄製
    - [ ] Web3入門指南
    - [ ] 風險提示說明
- [ ] **開發文檔**
    
    - [ ] API文檔（Swagger）
    - [ ] 智能合約文檔
    - [ ] 數據庫架構文檔
    - [ ] IPFS整合指南
    - [ ] 部署手冊
- [ ] **運營文檔**
    
    - [ ] 社群管理指南
    - [ ] 危機處理流程
    - [ ] 客服響應模板
    - [ ] 數據分析報告模板

### Week 12: 正式發布準備

#### 🎯 發布前檢查

- [ ] **主網部署準備**
    
    - [ ] Polygon zkEVM主網合約部署
    - [ ] 多簽錢包配置
    - [ ] 預言機主網服務
    - [ ] IPFS生產節點
    - [ ] DNS與域名配置
- [ ] **監控與告警**
    
    - [ ] Grafana監控面板
    - [ ] 異常交易告警
    - [ ] 系統健康檢查
    - [ ] 預言機數據異常檢測
    - [ ] 7×24小時值守計劃
- [ ] **營銷準備**
    
    - [ ] 社交媒體帳號建立
    - [ ] 新聞稿準備
    - [ ] KOL合作洽談
    - [ ] 空投計劃（如有）
    - [ ] 發布活動策劃
- [ ] **法務合規**
    
    - [ ] 用戶協議最終版
    - [ ] 隱私政策更新
    - [ ] 免責聲明完善
    - [ ] KYC/AML流程（預留）
    - [ ] 各地區合規檢查

#### 🚢 發布流程

- [ ] **階段性發布**
    
    - [ ] Alpha內測（50用戶）
    - [ ] Beta公測（500用戶）
    - [ ] 軟啟動（限量註冊）
    - [ ] 正式發布（開放註冊）
    - [ ] 後續迭代計劃
- [ ] **應急預案**
    
    - [ ] 重大bug修復流程
    - [ ] 智能合約暫停機制
    - [ ] 數據回滾方案
    - [ ] 用戶資產保護
    - [ ] 公關危機處理

---

## 📊 關鍵里程碑與交付物

### Phase 1 交付物（第4週末）

✅ 智能合約部署到測試網 ✅ 聯合曲線交易功能完成 ✅ 社交媒體認證系統上線 ✅ 基礎API服務可用 ✅ TradingView風格首頁完成 ✅ IPFS基礎設施搭建完成

### Phase 2 交付物（第8週末）

✅ 完整社交功能上線 ✅ 端到端加密私信系統 ✅ 預言機價格更新機制運行 ✅ 付費內容系統完成 ✅ 數據分析面板可用 ✅ 所有核心功能測試通過

### Phase 3 交付物（第12週末）

✅ 移動端完美適配 ✅ 安全審計通過 ✅ Beta測試完成 ✅ 所有文檔齊全 ✅ 主網部署就緒 ✅ MVP產品正式發布

---

## 🎯 成功指標追蹤

### 技術指標

- [ ] 智能合約Gas優化達標（<100k）
- [ ] API響應時間 < 500ms
- [ ] 頁面加載時間 < 2秒
- [ ] IPFS內容加載 < 3秒
- [ ] 系統可用性 > 99.9%

### 業務指標

- [ ] Alpha測試50位運動員參與
- [ ] Beta測試500+用戶註冊
- [ ] 至少100個代幣被創建
- [ ] 日均交易量達到目標
- [ ] 社交互動率達標

### 安全指標

- [ ] 0個高危漏洞
- [ ] 所有中危漏洞修復
- [ ] 智能合約審計通過
- [ ] 私信加密100%成功率
- [ ] 預言機數據準確率>99%

---

## 📝 注意事項

### 技術注意事項

1. **聯合曲線實現**：確保價格計算精度，避免精度丟失
2. **IPFS整合**：做好備份方案，確保內容可用性
3. **預言機安全**：多節點驗證，防止數據操縱
4. **私信加密**：密鑰管理方案要用戶友好
5. **Gas優化**：批量操作和Layer2充分利用

### 運營注意事項

1. **社群建設**：提前培養種子用戶
2. **內容審核**：建立審核機制（MVP後續完善）
3. **客服支援**：準備常見問題解答
4. **數據備份**：定期備份所有關鍵數據
5. **應急響應**：24小時內響應重大問題

### 合規注意事項

1. **代幣性質**：明確utility token定位
2. **用戶數據**：遵守GDPR等隱私法規
3. **內容版權**：IPFS內容版權聲明
4. **金融監管**：避免證券化描述
5. **國際化**：考慮不同地區法規差異

---

這份更新後的文檔整合了所有技術決策，包括：

- 混合模式的代幣價格調整
- 預言機從網站獲取比賽數據
- 社交媒體認證（100粉絲門檻）
- 聯合曲線交易機制
- 實用主義的數據存儲方案
- Farcaster風格的私信加密