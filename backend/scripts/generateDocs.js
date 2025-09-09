import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 生成合約文檔
 */
async function generateDocs() {
    const contractsDir = path.join(__dirname, '../contracts');
    const docsDir = path.join(__dirname, '../docs');
    const abisDir = path.join(__dirname, '../abis');
    
    // 確保文檔目錄存在
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }
    
    const contracts = [
        {
            name: 'AthleteRegistry',
            description: '運動員註冊管理合約，支持身份驗證、個人資料存儲和等級系統',
            features: [
                '運動員註冊和身份驗證',
                '等級系統管理',
                '投資記錄追蹤',
                '驗證者管理',
                '可升級代理模式'
            ]
        },
        {
            name: 'PersonalTokenFactory',
            description: '個人代幣工廠合約，為每個運動員創建和管理個人代幣',
            features: [
                '個人代幣創建',
                '聯合曲線定價機制',
                '交易手續費管理',
                '價格預言機集成',
                '等級折扣系統'
            ]
        },
        {
            name: 'AchievementTracker',
            description: '成就追蹤合約，管理運動員成就的提交、驗證和 NFT 鑄造',
            features: [
                '成就提交和驗證',
                'NFT 成就證書',
                '多重驗證機制',
                '爭議處理系統',
                '驗證者權重管理'
            ]
        },
        {
            name: 'ContentManager',
            description: '內容管理合約，處理內容存儲、版權保護和收益分配',
            features: [
                'IPFS 內容存儲',
                '版權保護機制',
                '收益分配系統',
                '內容訪問控制',
                '版稅管理'
            ]
        },
        {
            name: 'PriceOracle',
            description: '價格預言機合約，提供可靠的價格數據源',
            features: [
                '多數據源聚合',
                '價格偏差檢測',
                '緊急暫停機制',
                '歷史價格記錄',
                '可信數據源管理'
            ]
        }
    ];
    
    // 生成總覽文檔
    const overviewContent = generateOverviewDoc(contracts);
    fs.writeFileSync(path.join(docsDir, 'CONTRACTS_OVERVIEW.md'), overviewContent);
    
    // 為每個合約生成詳細文檔
    for (const contract of contracts) {
        try {
            const contractDoc = await generateContractDoc(contract, abisDir);
            fs.writeFileSync(
                path.join(docsDir, `${contract.name}.md`),
                contractDoc
            );
            console.log(`✅ 生成 ${contract.name} 文檔成功`);
        } catch (error) {
            console.error(`❌ 生成 ${contract.name} 文檔失敗:`, error.message);
        }
    }
    
    // 生成部署指南
    const deploymentGuide = generateDeploymentGuide();
    fs.writeFileSync(path.join(docsDir, 'DEPLOYMENT_GUIDE.md'), deploymentGuide);
    
    console.log('\n🎉 合約文檔生成完成!');
    console.log(`📁 文檔目錄: ${docsDir}`);
    console.log('📄 生成文件:');
    console.log('   - CONTRACTS_OVERVIEW.md (合約總覽)');
    console.log('   - DEPLOYMENT_GUIDE.md (部署指南)');
    contracts.forEach(contract => {
        console.log(`   - ${contract.name}.md`);
    });
}

/**
 * 生成合約總覽文檔
 */
function generateOverviewDoc(contracts) {
    return `# FrisbeDAO 智能合約總覽

## 項目簡介

FrisbeDAO 是一個去中心化的運動員經濟平台，通過智能合約實現運動員個人代幣化、成就追蹤、內容管理等功能。

## 合約架構

### 核心合約

${contracts.map(contract => `#### ${contract.name}
${contract.description}

**主要功能:**
${contract.features.map(feature => `- ${feature}`).join('\n')}
`).join('\n')}

## 合約交互流程

1. **運動員註冊**: 通過 \`AthleteRegistry\` 合約註冊並驗證身份
2. **代幣創建**: 使用 \`PersonalTokenFactory\` 為運動員創建個人代幣
3. **成就記錄**: 通過 \`AchievementTracker\` 提交和驗證成就
4. **內容管理**: 使用 \`ContentManager\` 存儲和管理內容
5. **價格查詢**: \`PriceOracle\` 提供實時價格數據

## 安全特性

- **可升級性**: 使用 OpenZeppelin 的 UUPS 代理模式
- **訪問控制**: 基於角色的權限管理
- **重入保護**: 防止重入攻擊
- **暫停機制**: 緊急情況下可暫停合約
- **多重驗證**: 重要操作需要多方驗證

## 技術棧

- **Solidity**: ^0.8.28
- **OpenZeppelin**: 安全的智能合約庫
- **Hardhat**: 開發和測試框架
- **IPFS**: 去中心化存儲
- **Chainlink**: 價格預言機（可選）

## 部署信息

詳細的部署指南請參考 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

## 許可證

MIT License
`;
}

/**
 * 生成單個合約的詳細文檔
 */
async function generateContractDoc(contract, abisDir) {
    const abiPath = path.join(abisDir, `${contract.name}.json`);
    let abi = [];
    
    if (fs.existsSync(abiPath)) {
        abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    }
    
    const functions = abi.filter(item => item.type === 'function');
    const events = abi.filter(item => item.type === 'event');
    const errors = abi.filter(item => item.type === 'error');
    
    return `# ${contract.name}

## 概述

${contract.description}

## 主要功能

${contract.features.map(feature => `- ${feature}`).join('\n')}

## 合約接口

### 函數

${functions.map(func => {
    const inputs = func.inputs?.map(input => `${input.name}: ${input.type}`).join(', ') || '';
    const outputs = func.outputs?.map(output => `${output.type}`).join(', ') || 'void';
    const visibility = func.stateMutability || 'nonpayable';
    
    return `#### \`${func.name}(${inputs})\`

- **可見性**: ${visibility}
- **返回值**: ${outputs}
- **描述**: ${getFunctionDescription(func.name)}
`;
}).join('\n')}

### 事件

${events.map(event => {
    const inputs = event.inputs?.map(input => {
        const indexed = input.indexed ? ' indexed' : '';
        return `${input.name}: ${input.type}${indexed}`;
    }).join(', ') || '';
    
    return `#### \`${event.name}(${inputs})\`

${getEventDescription(event.name)}
`;
}).join('\n')}

${errors.length > 0 ? `### 錯誤

${errors.map(error => {
    const inputs = error.inputs?.map(input => `${input.name}: ${input.type}`).join(', ') || '';
    return `#### \`${error.name}(${inputs})\`

${getErrorDescription(error.name)}
`;
}).join('\n')}` : ''}

## 使用示例

\`\`\`javascript
// 部署合約
const ${contract.name} = await ethers.getContractFactory("${contract.name}");
const ${contract.name.toLowerCase()} = await ${contract.name}.deploy();

// 調用函數示例
// TODO: 添加具體的使用示例
\`\`\`

## 安全考慮

- 使用 OpenZeppelin 的安全庫
- 實現訪問控制機制
- 包含重入保護
- 支持緊急暫停功能

## 許可證

MIT License
`;
}

/**
 * 獲取函數描述
 */
function getFunctionDescription(functionName) {
    const descriptions = {
        'initialize': '初始化合約，設置初始參數',
        'register': '註冊新用戶或實體',
        'verify': '驗證用戶或數據',
        'update': '更新數據或狀態',
        'withdraw': '提取資金',
        'pause': '暫停合約功能',
        'unpause': '恢復合約功能',
        'setFee': '設置手續費',
        'addVerifier': '添加驗證者',
        'removeVerifier': '移除驗證者',
        'getPrice': '獲取價格信息',
        'mint': '鑄造代幣或 NFT',
        'burn': '銷毀代幣',
        'transfer': '轉移資產',
        'approve': '授權操作',
        'stake': '質押資產',
        'unstake': '取消質押',
        'claim': '領取獎勵'
    };
    
    for (const [key, desc] of Object.entries(descriptions)) {
        if (functionName.toLowerCase().includes(key.toLowerCase())) {
            return desc;
        }
    }
    
    return '待補充描述';
}

/**
 * 獲取事件描述
 */
function getEventDescription(eventName) {
    const descriptions = {
        'Registered': '當新實體註冊時觸發',
        'Verified': '當驗證完成時觸發',
        'Updated': '當數據更新時觸發',
        'Transfer': '當資產轉移時觸發',
        'Approval': '當授權操作時觸發',
        'Paused': '當合約暫停時觸發',
        'Unpaused': '當合約恢復時觸發',
        'FeeUpdated': '當手續費更新時觸發',
        'PriceUpdated': '當價格更新時觸發'
    };
    
    for (const [key, desc] of Object.entries(descriptions)) {
        if (eventName.includes(key)) {
            return desc;
        }
    }
    
    return '待補充描述';
}

/**
 * 獲取錯誤描述
 */
function getErrorDescription(errorName) {
    return '自定義錯誤，用於優化 Gas 消耗';
}

/**
 * 生成部署指南
 */
function generateDeploymentGuide() {
    return `# 部署指南

## 環境準備

### 1. 安裝依賴

\`\`\`bash
npm install
\`\`\`

### 2. 環境配置

複製 \`.env.example\` 到 \`.env\` 並配置以下變量：

\`\`\`env
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
\`\`\`

## 部署流程

### 1. 編譯合約

\`\`\`bash
npx hardhat compile
\`\`\`

### 2. 運行測試

\`\`\`bash
npx hardhat test
\`\`\`

### 3. 本地部署測試

\`\`\`bash
# 啟動本地節點
npx hardhat node

# 在另一個終端部署
npx hardhat run scripts/deploy-local.ts --network localhost
\`\`\`

### 4. 測試網部署

\`\`\`bash
# 部署到 Sepolia 測試網
npx hardhat run scripts/deploy-testnet.ts --network sepolia

# 部署到 Optimism Sepolia
npx hardhat run scripts/deploy-testnet.ts --network optimism-sepolia
\`\`\`

### 5. 主網部署

\`\`\`bash
# 部署到以太坊主網
npx hardhat run scripts/deploy-frisbedao.ts --network mainnet

# 部署到 Optimism 主網
npx hardhat run scripts/deploy-frisbedao.ts --network optimism
\`\`\`

## 驗證合約

部署完成後，驗證合約源碼：

\`\`\`bash
npx hardhat run scripts/verify-contracts.ts --network <network_name>
\`\`\`

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
`;
}

// 如果直接運行此腳本
if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'))) {
    generateDocs().catch(console.error);
}

export { generateDocs };