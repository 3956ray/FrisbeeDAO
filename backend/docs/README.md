# FrisbeDAO 智能合約文檔

## 概述

FrisbeDAO 是一個去中心化的運動員代幣化平台，允許用戶投資運動員並獲得相應的代幣回報。本項目包含以下核心智能合約：

## 核心合約

### 1. AthleteRegistry.sol
**功能**: 運動員註冊和管理系統
- 運動員註冊和驗證
- 等級系統管理
- 聲譽評分追蹤
- 投資記錄管理

**主要功能**:
- `registerAthlete()`: 註冊新運動員
- `verifyAthlete()`: 驗證運動員身份
- `updateReputationScore()`: 更新聲譽評分
- `recordInvestment()`: 記錄投資
- `updateUserLevel()`: 更新用戶等級

**安全特性**:
- 重入攻擊防護 (ReentrancyGuard)
- 暫停功能 (Pausable)
- 所有者權限控制 (Ownable)
- 安全的ETH轉賬 (Address.sendValue)

### 2. PersonalTokenFactory.sol
**功能**: 個人代幣創建和交易工廠
- 基於聯合曲線的代幣定價
- 代幣創建和管理
- 批量購買功能
- 平台手續費管理

**主要功能**:
- `createPersonalToken()`: 創建個人代幣
- `batchBuyTokens()`: 批量購買代幣
- `buyTokens()`: 購買代幣
- `sellTokens()`: 出售代幣
- `calculatePurchaseCost()`: 計算購買成本
- `calculateSaleRefund()`: 計算出售退款

**安全特性**:
- 重入攻擊防護
- 暫停功能
- 供應量檢查
- 數量驗證
- 安全的資金轉移

### 3. PriceOracle.sol
**功能**: 價格預言機服務
- Chainlink價格源集成
- 批量價格更新
- 價格數據驗證
- 自動更新配置

**主要功能**:
- `addPriceFeed()`: 添加價格源
- `updatePrice()`: 更新單個價格
- `batchUpdatePrices()`: 批量更新價格
- `getLatestPrice()`: 獲取最新價格
- `isPriceStale()`: 檢查價格是否過期

**安全特性**:
- 授權更新者機制
- 價格數據驗證
- 心跳檢查
- 暫停功能

### 4. ContentManager.sol
**功能**: 內容和版權管理
- 內容創建和管理
- 版權保護
- 付費內容訪問
- 創作者收益分配

**主要功能**:
- `createContent()`: 創建內容
- `purchaseContent()`: 購買內容
- `updateContentPrice()`: 更新內容價格
- `setContentActive()`: 設置內容狀態
- `withdrawEarnings()`: 提取收益

**安全特性**:
- 重入攻擊防護
- 安全的資金轉移
- 權限控制

### 5. AchievementTracker.sol
**功能**: 成就追蹤系統
- 成就定義和管理
- 用戶成就追蹤
- 獎勵分配
- 進度監控

**主要功能**:
- `createAchievement()`: 創建成就
- `unlockAchievement()`: 解鎖成就
- `updateProgress()`: 更新進度
- `claimReward()`: 領取獎勵

## 部署信息

所有合約都使用OpenZeppelin的可升級代理模式部署，支持未來的功能升級和bug修復。

### 部署腳本
- `deploy.js`: 主要部署腳本
- `upgrade.js`: 升級腳本

## 安全特性

### 通用安全機制
1. **重入攻擊防護**: 所有涉及資金轉移的函數都使用ReentrancyGuard
2. **暫停功能**: 緊急情況下可暫停合約操作
3. **權限控制**: 使用Ownable和自定義修飾符控制訪問
4. **安全轉賬**: 使用Address.sendValue進行安全的ETH轉賬
5. **數據驗證**: 對所有輸入參數進行嚴格驗證
6. **供應量控制**: 防止代幣超發
7. **價格驗證**: 防止價格操縱

### 升級安全
- 使用UUPS代理模式
- 只有合約所有者可以授權升級
- 升級前需要充分測試

## Gas 優化

1. **批量操作**: 支持批量購買和價格更新
2. **緊湊存儲**: 使用緊湊的數據結構
3. **循環優化**: 使用unchecked塊優化循環
4. **事件優化**: 合理使用事件記錄

## 測試

運行測試:
```bash
npx hardhat test
```

編譯合約:
```bash
npx hardhat compile
```

## ABI 文件位置

編譯後的ABI文件位於 `artifacts/contracts/` 目錄下：
- `AthleteRegistry.sol/AthleteRegistry.json`
- `PersonalTokenFactory.sol/PersonalTokenFactory.json`
- `PersonalTokenFactory.sol/PersonalToken.json`
- `PriceOracle.sol/PriceOracle.json`
- `ContentManager.sol/ContentManager.json`
- `AchievementTracker.sol/AchievementTracker.json`

## 版本信息

- Solidity版本: 0.8.28
- OpenZeppelin版本: 5.1.0
- Hardhat版本: 2.22.17

## 許可證

MIT License