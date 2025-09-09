# 部署指南

## 環境準備

### 1. 安裝依賴

```bash
npm install
```

### 2. 環境配置

複製 `.env.example` 到 `.env` 並配置以下變量：

```env
# 私鑰（用於部署）
PRIVATE_KEY=your_private_key_here

# RPC 端點
ETH_RPC_URL=https://mainnet.infura.io/v3/your_project_id
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_project_id
OPTIMISM_RPC_URL=https://mainnet.optimism.io

# Etherscan API 密鑰（用於驗證）
ETHERSCAN_API_KEY=your_etherscan_api_key
OPTIMISM_ETHERSCAN_API_KEY=your_optimism_etherscan_api_key

# IPFS 配置
IPFS_PROJECT_ID=your_infura_ipfs_project_id
IPFS_PROJECT_SECRET=your_infura_ipfs_secret
```

## 部署流程

### 1. 編譯合約

```bash
npx hardhat compile
```

### 2. 運行測試

```bash
npx hardhat test
```

### 3. 本地部署測試

```bash
# 啟動本地節點
npx hardhat node

# 在另一個終端部署
npx hardhat run scripts/deploy-local.ts --network localhost
```

### 4. 測試網部署

```bash
# 部署到 Sepolia 測試網
npx hardhat run scripts/deploy-testnet.ts --network sepolia

# 部署到 Optimism Sepolia
npx hardhat run scripts/deploy-testnet.ts --network optimism-sepolia
```

### 5. 主網部署

```bash
# 部署到以太坊主網
npx hardhat run scripts/deploy-frisbedao.ts --network mainnet

# 部署到 Optimism 主網
npx hardhat run scripts/deploy-frisbedao.ts --network optimism
```

## 驗證合約

部署完成後，驗證合約源碼：

```bash
npx hardhat run scripts/verify-contracts.ts --network <network_name>
```

## 部署後配置

### 1. 設置初始參數

- 配置等級系統參數
- 添加初始驗證者
- 設置手續費率
- 配置價格預言機數據源

### 2. 權限管理

- 轉移合約所有權
- 設置多重簽名錢包
- 配置角色權限

### 3. 監控設置

- 設置事件監聽
- 配置告警機制
- 部署監控儀表板

## 安全檢查清單

- [ ] 私鑰安全存儲
- [ ] 合約代碼審計
- [ ] 測試覆蓋率 > 90%
- [ ] 權限配置正確
- [ ] 緊急暫停機制測試
- [ ] 升級機制測試
- [ ] Gas 優化檢查
- [ ] 前端集成測試

## 故障排除

### 常見問題

1. **部署失敗**: 檢查 Gas 費用和網絡連接
2. **驗證失敗**: 確認編譯器版本和優化設置
3. **權限錯誤**: 檢查部署地址的權限配置
4. **交易失敗**: 檢查合約狀態和參數有效性

### 聯繫支持

如遇到問題，請提供以下信息：
- 網絡名稱
- 交易哈希
- 錯誤信息
- 部署配置

## 許可證

MIT License
