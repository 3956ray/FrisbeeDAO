# Polygon zkEVM Testnet 部署指南

本指南將幫助您在 Polygon zkEVM Testnet 上部署和驗證 FrisbeDAO 智能合約。

## 📋 前置要求

### 1. 環境準備

確保您已安裝以下工具：
- Node.js (v18 或更高版本)
- npm 或 yarn
- Git

### 2. 獲取測試代幣

在部署之前，您需要在 Polygon zkEVM Testnet 上獲取測試 ETH：

1. **訪問 Polygon zkEVM Bridge**
   - 前往：https://bridge.polygon.technology/
   - 選擇 "zkEVM Testnet"
   - 連接您的錢包
   - 從 Goerli 測試網橋接 ETH 到 zkEVM Testnet

2. **或使用水龍頭**
   - 前往：https://faucet.polygon.technology/
   - 選擇 "zkEVM Testnet"
   - 輸入您的錢包地址
   - 請求測試代幣

**建議餘額：** 至少 0.1 ETH 用於合約部署

### 3. 獲取 API 密鑰

為了驗證合約，您需要獲取 Polygon zkEVM API 密鑰：

1. 訪問：https://testnet-zkevm.polygonscan.com/apis
2. 註冊帳戶
3. 創建 API 密鑰
4. 複製 API 密鑰備用

## ⚙️ 配置設置

### 1. 環境變量配置

在 `backend/.env` 文件中設置以下變量：

```bash
# 您的私鑰 (不要分享給任何人!)
PRIVATE_KEY=0x你的私鑰

# Polygon zkEVM Testnet RPC URL
POLYGON_ZKEVM_TESTNET_RPC_URL=https://rpc.public.zkevm-test.net

# Polygon zkEVM API 密鑰 (用於合約驗證)
POLYGON_ZKEVM_API_KEY=你的API密鑰
```

**⚠️ 安全提醒：**
- 永遠不要將真實的私鑰提交到代碼庫
- 使用測試錢包進行部署
- 確保 `.env` 文件在 `.gitignore` 中

### 2. 網絡配置驗證

確認 `hardhat.config.ts` 中包含 Polygon zkEVM Testnet 配置：

```typescript
polygonZkEVMTestnet: {
  type: "http",
  chainType: "l2",
  url: process.env.POLYGON_ZKEVM_TESTNET_RPC_URL || "https://rpc.public.zkevm-test.net",
  accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  chainId: 1442,
},
```

## 🚀 部署流程

### 1. 安裝依賴

```bash
cd backend
npm install
```

### 2. 編譯合約

```bash
npm run compile
```

### 3. 部署合約

```bash
npm run deploy:polygon-zkevm
```

部署腳本將會：
1. 檢查帳戶餘額
2. 按順序部署所有合約：
   - AthleteRegistry
   - PersonalTokenFactory
   - AchievementTracker
   - PriceOracle
   - ContentManager
3. 保存部署配置到 `deployment-config-polygon-zkevm.json`
4. 顯示合約地址和區塊鏈瀏覽器鏈接

### 4. 驗證合約 (可選但推薦)

```bash
npm run verify:polygon-zkevm
```

驗證腳本將會：
1. 讀取部署配置文件
2. 逐個驗證所有合約
3. 顯示驗證結果

## 📊 部署參數

當前部署使用的參數：

| 參數 | 值 | 說明 |
|------|----|---------|
| 註冊費用 | 0.01 ETH | 運動員註冊費用 |
| 創建費用 | 0.005 ETH | 代幣創建費用 |
| 平台手續費 | 2.5% | 交易手續費百分比 |
| 提交費用 | 0.001 ETH | 預言機數據提交費用 |
| 驗證獎勵 | 0.0005 ETH | 數據驗證獎勵 |

## 🔍 驗證部署結果

### 1. 檢查部署配置

部署完成後，檢查 `deployment-config-polygon-zkevm.json` 文件：

```json
{
  "network": "polygonZkEVMTestnet",
  "chainId": 1442,
  "deployer": "0x...",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "contracts": {
    "athleteRegistry": {
      "address": "0x...",
      "constructorArgs": [...]
    },
    // ... 其他合約
  }
}
```

### 2. 在區塊鏈瀏覽器中驗證

訪問 https://testnet-zkevm.polygonscan.com 並搜索合約地址，確認：
- 合約已成功部署
- 交易狀態為成功
- 合約代碼已驗證（如果運行了驗證腳本）

### 3. 測試合約功能

您可以通過區塊鏈瀏覽器的 "Read Contract" 和 "Write Contract" 功能測試合約：

1. **AthleteRegistry**
   - 檢查 `registrationFee()` 函數
   - 測試 `registerAthlete()` 函數

2. **PersonalTokenFactory**
   - 檢查 `creationFee()` 函數
   - 檢查 `platformFeePercentage()` 函數

## 🔧 故障排除

### 常見問題

#### 1. 餘額不足錯誤
```
⚠️ 警告: 帳戶餘額較低，可能無法完成部署
```
**解決方案：** 獲取更多測試 ETH（參見前置要求部分）

#### 2. RPC 連接錯誤
```
Error: could not detect network
```
**解決方案：**
- 檢查 `POLYGON_ZKEVM_TESTNET_RPC_URL` 是否正確設置
- 嘗試使用備用 RPC URL：`https://rpc.polygon-zkevm.gateway.tenderly.co`

#### 3. 私鑰格式錯誤
```
Error: invalid private key
```
**解決方案：**
- 確保私鑰以 `0x` 開頭
- 確保私鑰長度為 66 個字符（包括 0x）

#### 4. 合約驗證失敗
```
❌ 驗證失敗: Invalid API Key
```
**解決方案：**
- 檢查 `POLYGON_ZKEVM_API_KEY` 是否正確設置
- 確認 API 密鑰來自 testnet-zkevm.polygonscan.com

### 手動驗證合約

如果自動驗證失敗，您可以手動驗證：

```bash
npx hardhat verify --network polygonZkEVMTestnet <合約地址> <構造函數參數>
```

例如：
```bash
npx hardhat verify --network polygonZkEVMTestnet 0x123... "10000000000000000"
```

## 📚 後續步驟

部署完成後，您需要：

1. **初始化合約**
   - 調用各合約的初始化函數
   - 設置合約間的關聯關係

2. **更新前端配置**
   - 將合約地址更新到前端配置文件
   - 更新 ABI 文件

3. **測試集成**
   - 測試前端與合約的交互
   - 驗證所有功能正常工作

## 🔗 有用鏈接

- **Polygon zkEVM Testnet 瀏覽器：** https://testnet-zkevm.polygonscan.com
- **Bridge：** https://bridge.polygon.technology/
- **水龍頭：** https://faucet.polygon.technology/
- **RPC 端點：** https://rpc.public.zkevm-test.net
- **Chain ID：** 1442
- **官方文檔：** https://wiki.polygon.technology/docs/zkEVM/

## 📞 支援

如果遇到問題，請：
1. 檢查本指南的故障排除部分
2. 查看 Hardhat 和 Polygon zkEVM 官方文檔
3. 在項目 GitHub 上創建 issue

---

**⚠️ 重要提醒：**
- 這是測試網部署，不要使用真實資金
- 保護好您的私鑰
- 定期備份部署配置文件