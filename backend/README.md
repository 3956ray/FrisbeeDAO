# FrisbeDAO 智能合约

## 项目概述

FrisbeDAO 是一个去中心化的运动员管理平台，包含三个核心智能合约：

1. **AthleteRegistry.sol** - 运动员注册管理合约
2. **PersonalTokenFactory.sol** - 个人代币工厂合约
3. **AchievementTracker.sol** - 成就追踪合约

## 合约功能

### AthleteRegistry（运动员注册管理）

- ✅ 运动员身份验证和注册
- ✅ 个人资料存储（链上/链下混合）
- ✅ 声誉评分系统（0-1000分）
- ✅ 验证者管理
- ✅ 可升级合约设计

**主要功能：**
- `registerAthlete()` - 运动员注册
- `verifyAthlete()` - 验证运动员身份
- `updateReputationScore()` - 更新声誉评分
- `addVerifier()` - 添加验证者

### PersonalTokenFactory（个人代币工厂）

- ✅ 为每个运动员创建ERC-20代币
- ✅ 联合曲线定价机制：`price = basePrice * (supply/baseSupply)^2`
- ✅ 代币买卖功能
- ✅ 平台手续费机制

**定价公式：**
```
价格 = 基础价格 * (当前供应量/基础供应量)^2
成本 = ∫[当前供应量 到 当前供应量+购买量] 价格函数 dx
```

**主要功能：**
- `createPersonalToken()` - 创建个人代币
- `buyTokens()` - 购买代币
- `sellTokens()` - 出售代币
- `calculatePurchaseCost()` - 计算购买成本

### AchievementTracker（成就追踪）

- ✅ 记录重要成就到链上
- ✅ 自动铸造成就NFT（ERC-721）
- ✅ 社区验证机制
- ✅ 多类型成就支持
- ✅ 争议处理机制

**成就类型：**
- Competition（比赛成就）
- Training（训练成就）
- Record（记录成就）
- Community（社区成就）
- Special（特殊成就）

**主要功能：**
- `submitAchievement()` - 提交成就
- `verifyAchievement()` - 验证成就
- `raiseDispute()` - 提起争议
- `addVerifier()` - 添加验证者

## 技术特性

### 安全性
- ✅ 使用 OpenZeppelin 库确保安全
- ✅ ReentrancyGuard 防重入攻击
- ✅ Access Control 权限控制
- ✅ 输入验证和错误处理

### Gas 优化
- ✅ 编译器优化启用
- ✅ 高效的数据结构
- ✅ 批量操作支持
- ✅ 事件日志优化

### 可升级性
- ✅ UUPS 代理模式
- ✅ 存储布局兼容性
- ✅ 初始化函数保护

## 安装和部署

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- Hardhat

### 安装依赖

```bash
npm install
```

### 编译合约

```bash
npx hardhat compile
```

### 运行测试

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试文件
npx hardhat test test/FrisbeDAO.test.ts

# 生成测试覆盖率报告
npx hardhat coverage
```

### 部署到本地网络

```bash
# 启动本地 Hardhat 网络
npx hardhat node

# 在新终端中部署合约
npx hardhat run scripts/deploy-frisbedao.ts --network localhost
```

### 测试合约功能

```bash
# 运行功能测试脚本
npx hardhat run scripts/test-contracts.ts --network localhost
```

## 使用示例

### 1. 运动员注册流程

```typescript
// 1. 运动员注册
await athleteRegistry.connect(athlete).registerAthlete(
  "张三",
  "篮球",
  "QmIPFSHash...",
  { value: ethers.parseEther("0.01") }
);

// 2. 验证者验证
await athleteRegistry.connect(verifier).verifyAthlete(athleteAddress);
```

### 2. 创建个人代币

```typescript
// 创建个人代币
await personalTokenFactory.connect(athlete).createPersonalToken(
  "张三代币",
  "ZS",
  ethers.parseEther("0.001"), // 基础价格
  ethers.parseUnits("1000", 18), // 基础供应量
  { value: ethers.parseEther("0.005") }
);
```

### 3. 代币交易

```typescript
// 计算购买成本
const cost = await personalToken.calculatePurchaseCost(
  ethers.parseUnits("10", 18)
);

// 购买代币
await personalToken.connect(buyer).buyTokens(
  ethers.parseUnits("10", 18),
  { value: cost }
);

// 出售代币
await personalToken.connect(seller).sellTokens(
  ethers.parseUnits("5", 18)
);
```

### 4. 成就提交和验证

```typescript
// 提交成就
await achievementTracker.connect(athlete).submitAchievement(
  0, // AchievementType.Competition
  "市级篮球比赛冠军",
  "在2024年市级篮球比赛中获得冠军",
  "QmAchievementMetadata...",
  timestamp,
  ["QmEvidence1...", "QmEvidence2..."],
  { value: ethers.parseEther("0.001") }
);

// 验证成就
await achievementTracker.connect(verifier).verifyAchievement(
  tokenId,
  true,
  "成就真实有效"
);
```

## 快速开始

```shell
# 安装依赖
npm install

# 编译合约
npx hardhat compile

# 运行测试
npx hardhat test

# 启动本地网络
npx hardhat node

# 部署合约（在新终端）
npx hardhat run scripts/deploy-frisbedao.ts --network localhost

# 测试合约功能
npx hardhat run scripts/test-contracts.ts --network localhost
```
