# FrisbeDAO 测试网部署指南

## 环境配置

### 1. 创建环境变量文件

复制 `.env.example` 文件并重命名为 `.env`：

```bash
cp .env.example .env
```

### 2. 配置环境变量

编辑 `.env` 文件，填入以下信息：

```env
# 私钥配置 (不要提交真实私钥到代码库)
PRIVATE_KEY=0x你的私钥

# RPC 节点配置
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/你的INFURA_KEY
GOERLI_RPC_URL=https://goerli.infura.io/v3/你的INFURA_KEY
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
OP_SEPOLIA_RPC_URL=https://sepolia.optimism.io

# API 密钥配置 (用于合约验证)
ETHERSCAN_API_KEY=你的etherscan_api_key
BASESCAN_API_KEY=你的basescan_api_key
OPTIMISTIC_ETHERSCAN_API_KEY=你的optimistic_etherscan_api_key
```

### 3. 获取测试网代币

#### Sepolia 测试网
- 水龙头: https://sepoliafaucet.com/
- 或者: https://faucet.quicknode.com/ethereum/sepolia

#### Base Sepolia 测试网
- 水龙头: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

#### Optimism Sepolia 测试网
- 水龙头: https://app.optimism.io/faucet

## 部署步骤

### 1. 编译合约

```bash
npx hardhat compile
```

### 2. 部署到测试网

#### 部署到 Sepolia
```bash
npx hardhat run scripts/deploy-testnet.ts --network sepolia
```

#### 部署到 Base Sepolia
```bash
npx hardhat run scripts/deploy-testnet.ts --network baseSepolia
```

#### 部署到 Optimism Sepolia
```bash
npx hardhat run scripts/deploy-testnet.ts --network optimismSepolia
```

### 3. 验证合约 (可选)

部署完成后，可以验证合约源码：

#### Sepolia
```bash
npx hardhat verify --network sepolia 合约地址 构造函数参数
```

#### Base Sepolia
```bash
npx hardhat verify --network baseSepolia 合约地址 构造函数参数
```

#### Optimism Sepolia
```bash
npx hardhat verify --network optimismSepolia 合约地址 构造函数参数
```

## 部署配置

当前部署脚本使用以下配置：

- **AthleteRegistry**
  - 注册费: 0.01 ETH
  
- **PersonalTokenFactory**
  - 创建费: 0.005 ETH
  - 平台手续费: 2.5%
  
- **AchievementTracker**
  - 提交费: 0.001 ETH
  - 验证奖励: 0.0005 ETH

## 注意事项

1. **私钥安全**: 永远不要将真实的私钥提交到代码库中
2. **测试网代币**: 确保部署账户有足够的测试网代币 (建议至少 0.1 ETH)
3. **Gas 费用**: 测试网部署大约需要 0.05-0.1 ETH 的 gas 费用
4. **网络确认**: 部署后请确认所有交易都已被网络确认

## 故障排除

### 常见错误

1. **余额不足**
   - 确保账户有足够的测试网代币
   - 使用水龙头获取更多测试代币

2. **RPC 连接失败**
   - 检查 RPC URL 是否正确
   - 确认 Infura 或其他 RPC 提供商的 API 密钥有效

3. **私钥格式错误**
   - 确保私钥以 `0x` 开头
   - 私钥应该是 64 个字符的十六进制字符串

4. **合约验证失败**
   - 确保 API 密钥正确
   - 等待几分钟后再尝试验证
   - 检查构造函数参数是否正确

## 部署后验证

部署完成后，可以通过以下方式验证部署是否成功：

1. 在区块链浏览器中查看合约地址
2. 调用合约的只读函数确认配置正确
3. 运行测试脚本验证合约功能

```bash
npx hardhat run scripts/verify-contracts.ts --network sepolia
```