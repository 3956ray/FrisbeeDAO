# FrisbeDAO 合約部署和使用指南

## 快速開始

### 1. 環境準備

```bash
# 安裝依賴
npm install

# 複製環境變量文件
cp .env.example .env
```

### 2. 配置環境變量

編輯 `.env` 文件：

```env
# 網絡配置
INFURA_API_KEY=your_infura_api_key
PRIVATE_KEY=your_private_key

# 合約驗證
ETHERSCAN_API_KEY=your_etherscan_api_key

# IPFS配置（可選）
IPFS_API_URL=https://api.pinata.cloud
IPFS_API_KEY=your_pinata_api_key
IPFS_SECRET_KEY=your_pinata_secret_key
```

### 3. 編譯合約

```bash
npx hardhat compile
```

### 4. 運行測試

```bash
npx hardhat test
```

## 部署指南

### 本地部署

```bash
# 啟動本地節點
npx hardhat node

# 在新終端中部署
npx hardhat run scripts/deploy-local.ts --network localhost
```

### 測試網部署

```bash
# 部署到 Sepolia 測試網
npx hardhat run scripts/deploy-testnet.ts --network sepolia

# 部署到 OP Sepolia 測試網
npx hardhat run scripts/deploy-testnet.ts --network op-sepolia
```

### 主網部署

```bash
# 部署到以太坊主網
npx hardhat run scripts/deploy-frisbedao.ts --network mainnet

# 部署到 Optimism 主網
npx hardhat run scripts/deploy-frisbedao.ts --network optimism
```

## 合約交互

### 使用 ABI 文件

所有合約的 ABI 文件都位於 `abis/` 目錄：

```javascript
// 導入統一的 ABI 文件
import contractABIs from './abis/all-contracts.json';

// 或導入單個合約 ABI
import athleteRegistryABI from './abis/AthleteRegistry.json';
```

### TypeScript 支持

```typescript
import { ContractABIs, CONTRACT_NAMES } from './abis/types';

// 使用類型安全的合約名稱
const contractName = CONTRACT_NAMES.ATHLETEREGISTRY;
```

### Web3.js 示例

```javascript
const Web3 = require('web3');
const contractABIs = require('./abis/all-contracts.json');

const web3 = new Web3('http://localhost:8545');

// 創建合約實例
const athleteRegistry = new web3.eth.Contract(
  contractABIs.AthleteRegistry.abi,
  'CONTRACT_ADDRESS'
);

// 調用合約方法
async function registerAthlete() {
  const accounts = await web3.eth.getAccounts();
  
  await athleteRegistry.methods
    .registerAthlete('John Doe', 'Basketball', 'ipfs_hash')
    .send({ 
      from: accounts[0], 
      value: web3.utils.toWei('0.01', 'ether') 
    });
}
```

### Ethers.js 示例

```javascript
const { ethers } = require('ethers');
const contractABIs = require('./abis/all-contracts.json');

// 連接到提供者
const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
const signer = provider.getSigner();

// 創建合約實例
const athleteRegistry = new ethers.Contract(
  'CONTRACT_ADDRESS',
  contractABIs.AthleteRegistry.abi,
  signer
);

// 調用合約方法
async function registerAthlete() {
  const tx = await athleteRegistry.registerAthlete(
    'John Doe',
    'Basketball', 
    'ipfs_hash',
    { value: ethers.utils.parseEther('0.01') }
  );
  
  await tx.wait();
  console.log('運動員註冊成功!');
}
```

## 合約升級

所有合約都使用 OpenZeppelin 的 UUPS 代理模式，支持升級：

```bash
# 升級合約
npx hardhat run scripts/upgrade-contracts.ts --network <network>
```

### 升級步驟

1. 修改合約代碼
2. 編譯新版本
3. 運行升級腳本
4. 驗證升級結果

## 合約驗證

```bash
# 驗證合約源碼
npx hardhat run scripts/verify-contracts.ts --network <network>
```

## 常用操作

### 運動員註冊流程

1. 用戶支付註冊費用調用 `AthleteRegistry.registerAthlete()`
2. 驗證者調用 `AthleteRegistry.verifyAthlete()` 驗證身份
3. 運動員可以創建個人代幣 `PersonalTokenFactory.createPersonalToken()`

### 代幣交易流程

1. 用戶調用 `PersonalTokenFactory.batchBuyTokens()` 購買代幣
2. 系統根據聯合曲線計算價格
3. 代幣自動鑄造並轉移給用戶
4. 用戶可以調用 `PersonalToken.sellTokens()` 出售代幣

### 內容管理流程

1. 創作者調用 `ContentManager.createContent()` 創建內容
2. 用戶調用 `ContentManager.purchaseContent()` 購買內容
3. 創作者可以調用 `ContentManager.withdrawEarnings()` 提取收益

## 安全注意事項

1. **私鑰安全**: 永遠不要在代碼中硬編碼私鑰
2. **合約升級**: 升級前務必進行充分測試
3. **權限管理**: 合理設置合約所有者和管理員權限
4. **資金安全**: 使用多重簽名錢包管理大額資金
5. **審計**: 主網部署前進行專業安全審計

## 監控和維護

### 事件監聽

```javascript
// 監聽運動員註冊事件
athletRegistry.events.AthleteRegistered({
  fromBlock: 'latest'
}, (error, event) => {
  if (error) {
    console.error('事件監聽錯誤:', error);
  } else {
    console.log('新運動員註冊:', event.returnValues);
  }
});
```

### 合約狀態檢查

```javascript
// 檢查合約是否暫停
const isPaused = await athleteRegistry.paused();

// 檢查合約餘額
const balance = await web3.eth.getBalance(contractAddress);
```

## 故障排除

### 常見問題

1. **Gas 費用不足**: 增加 gas limit
2. **交易失敗**: 檢查合約狀態和參數
3. **權限錯誤**: 確認調用者有相應權限
4. **網絡問題**: 檢查網絡連接和 RPC 端點

### 緊急操作

```javascript
// 緊急暫停合約
await contract.emergencyPause();

// 恢復合約運行
await contract.unpause();

// 緊急提取資金
await contract.emergencyWithdraw();
```

## 支持和社區

- GitHub: [FrisbeDAO Repository]
- 文檔: [Documentation Site]
- 社區: [Discord/Telegram]
- 問題反饋: [GitHub Issues]

---

**注意**: 本指南僅供參考，實際部署時請根據具體需求調整配置。