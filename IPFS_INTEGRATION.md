# FrisbeDAO IPFS 集成指南

本文档详细介绍如何在 FrisbeDAO 项目中集成和使用 Pinata IPFS 存储服务。

## 📋 目录

- [概述](#概述)
- [Pinata 配置](#pinata-配置)
- [前端集成](#前端集成)
- [后端集成](#后端集成)
- [智能合约集成](#智能合约集成)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)
- [故障排除](#故障排除)

## 🎯 概述

FrisbeDAO 使用 IPFS (InterPlanetary File System) 来存储去中心化数据，包括：

- 运动员个人资料和详细信息
- 成就证明和元数据
- NFT 代币元数据
- 文件和图片资源
- 部署配置和合约元数据

我们选择 [Pinata](https://pinata.cloud/) 作为 IPFS 固定服务提供商，确保数据的持久性和可访问性。

## 🔧 Pinata 配置

### 1. 创建 Pinata 账户

1. 访问 [Pinata.cloud](https://pinata.cloud/)
2. 注册免费账户
3. 验证邮箱地址

### 2. 获取 API 密钥

#### 方法一：使用 API Key (推荐用于开发)

1. 登录 Pinata 控制台
2. 进入 **API Keys** 页面
3. 点击 **New Key**
4. 设置权限：
   - ✅ `pinFileToIPFS`
   - ✅ `pinJSONToIPFS`
   - ✅ `unpin`
   - ✅ `pinList`
5. 复制 **API Key** 和 **API Secret**

#### 方法二：使用 JWT Token (推荐用于生产)

1. 在 Pinata 控制台创建 JWT Token
2. 设置适当的权限范围
3. 复制生成的 JWT Token

### 3. 配置环境变量

#### 前端配置 (`frontend/.env.local`)

```bash
# 使用 API Key
NEXT_PUBLIC_PINATA_API_KEY=your_api_key_here
NEXT_PUBLIC_PINATA_SECRET_KEY=your_secret_key_here

# 或使用 JWT Token
NEXT_PUBLIC_PINATA_JWT=your_jwt_token_here

# IPFS 网关 (可选)
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

#### 后端配置 (`backend/.env`)

```bash
# 使用 API Key
PINATA_API_KEY=your_api_key_here
PINATA_SECRET_KEY=your_secret_key_here

# 或使用 JWT Token
PINATA_JWT=your_jwt_token_here

# IPFS 网关 (可选)
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

## 🌐 前端集成

### 核心文件

- `frontend/src/lib/pinata.ts` - Pinata 服务类
- `frontend/src/hooks/usePinata.ts` - React Hooks
- `frontend/src/components/IPFSUploader.tsx` - 上传组件示例

### 基本使用

```typescript
import { usePinata } from '@/hooks/usePinata';

function MyComponent() {
  const { uploadJSON, uploadFile, uploadState } = usePinata();

  const handleUpload = async () => {
    const data = { name: "张三", sport: "飞盘" };
    const hash = await uploadJSON(data);
    console.log('IPFS Hash:', hash);
  };

  return (
    <div>
      <button onClick={handleUpload} disabled={uploadState.loading}>
        {uploadState.loading ? '上传中...' : '上传数据'}
      </button>
      {uploadState.error && <p>错误: {uploadState.error}</p>}
      {uploadState.ipfsHash && <p>成功: {uploadState.ipfsHash}</p>}
    </div>
  );
}
```

### 运动员专用 Hook

```typescript
import { useAthleteIPFS } from '@/hooks/usePinata';

function AthleteProfile() {
  const { uploadAthleteProfile, uploadAchievement } = useAthleteIPFS();

  const saveProfile = async () => {
    const profileData = {
      name: "李四",
      sport: "飞盘",
      bio: "专业运动员",
      achievements: ["全国冠军", "亚洲亚军"]
    };
    
    const hash = await uploadAthleteProfile(profileData);
    // 将 hash 保存到智能合约
  };
}
```

## 🔧 后端集成

### 核心文件

- `backend/scripts/ipfs-utils.ts` - IPFS 工具类
- `backend/scripts/deploy-with-ipfs.ts` - 集成 IPFS 的部署脚本

### 基本使用

```typescript
import { createPinataInstance, uploadAthleteProfile } from './ipfs-utils';

// 创建 Pinata 实例
const pinata = createPinataInstance();

// 上传运动员数据
const athleteData = {
  name: "王五",
  sport: "飞盘",
  bio: "职业运动员"
};

const hash = await uploadAthleteProfile(pinata, athleteData);
console.log('IPFS Hash:', hash);
```

### 部署时集成 IPFS

```bash
# 运行集成 IPFS 的部署脚本
npx hardhat run scripts/deploy-with-ipfs.ts --network localhost
```

## 📜 智能合约集成

### AthleteRegistry 合约

合约已经内置了 IPFS 支持：

```solidity
struct AthleteProfile {
    string name;
    string sport;
    string ipfsHash;  // 存储 IPFS 哈希
    // ... 其他字段
}

// 注册时提供 IPFS 哈希
function registerAthlete(
    string calldata _name,
    string calldata _sport,
    string calldata _ipfsHash
) external payable;

// 更新 IPFS 数据
function updateProfile(string calldata _ipfsHash) external;
```

### 使用流程

1. **前端上传数据到 IPFS**
   ```typescript
   const profileData = { /* 详细资料 */ };
   const ipfsHash = await uploadAthleteProfile(profileData);
   ```

2. **调用智能合约存储哈希**
   ```typescript
   await athleteRegistry.registerAthlete(name, sport, ipfsHash);
   ```

3. **从合约读取并获取 IPFS 数据**
   ```typescript
   const profile = await athleteRegistry.athletes(address);
   const detailData = await pinata.getData(profile.ipfsHash);
   ```

## 💡 使用示例

### 1. 运动员注册流程

```typescript
// 1. 准备运动员数据
const athleteData = {
  name: "张三",
  sport: "飞盘",
  bio: "专业飞盘运动员，拥有5年比赛经验",
  avatar: "https://example.com/avatar.jpg",
  achievements: [
    {
      title: "全国飞盘锦标赛冠军",
      date: "2023-08-15",
      description: "在2023年全国飞盘锦标赛中获得冠军"
    }
  ],
  stats: {
    matchesPlayed: 45,
    winRate: 0.78
  }
};

// 2. 上传到 IPFS
const ipfsHash = await uploadAthleteProfile(athleteData);

// 3. 注册到智能合约
const tx = await athleteRegistry.registerAthlete(
  athleteData.name,
  athleteData.sport,
  ipfsHash,
  { value: ethers.parseEther("0.01") }
);

const receipt = await tx.wait();
console.log('注册成功:', receipt.transactionHash);
```

### 2. 成就记录流程

```typescript
// 1. 准备成就数据
const achievementData = {
  title: "亚洲飞盘公开赛亚军",
  description: "在2023年亚洲飞盘公开赛中获得亚军",
  date: "2023-06-20",
  athleteAddress: "0x...",
  evidence: "https://example.com/certificate.pdf",
  metadata: {
    competition: "亚洲飞盘公开赛",
    rank: 2,
    participants: 64
  }
};

// 2. 上传到 IPFS
const ipfsHash = await uploadAchievement(achievementData);

// 3. 记录到智能合约
const tx = await achievementTracker.recordAchievement(
  achievementData.athleteAddress,
  achievementData.title,
  ipfsHash
);
```

### 3. NFT 元数据创建

```typescript
// 1. 准备 NFT 元数据
const tokenMetadata = {
  name: "张三成就徽章 #001",
  description: "张三在全国飞盘锦标赛中获得冠军的成就徽章",
  image: "https://gateway.pinata.cloud/ipfs/QmImageHash",
  attributes: [
    { trait_type: "运动项目", value: "飞盘" },
    { trait_type: "成就类型", value: "冠军" },
    { trait_type: "比赛级别", value: "全国" },
    { trait_type: "年份", value: 2023 }
  ],
  external_url: "https://frisbedao.com/achievement/001"
};

// 2. 上传元数据到 IPFS
const metadataHash = await uploadTokenMetadata(tokenMetadata);

// 3. 铸造 NFT
const tokenURI = `https://gateway.pinata.cloud/ipfs/${metadataHash}`;
const tx = await achievementTracker.mintAchievementNFT(
  athleteAddress,
  tokenURI
);
```

## 🎯 最佳实践

### 1. 数据结构设计

```typescript
// 推荐的运动员数据结构
interface AthleteProfileData {
  // 基本信息
  name: string;
  sport: string;
  bio?: string;
  avatar?: string;
  
  // 详细信息
  personalInfo?: {
    birthDate?: string;
    nationality?: string;
    height?: number;
    weight?: number;
  };
  
  // 成就列表
  achievements?: Achievement[];
  
  // 统计数据
  stats?: {
    matchesPlayed?: number;
    winRate?: number;
    totalPoints?: number;
  };
  
  // 社交链接
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    website?: string;
  };
  
  // 元数据
  metadata: {
    version: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

### 2. 错误处理

```typescript
try {
  const hash = await uploadAthleteProfile(data);
  // 成功处理
} catch (error) {
  if (error.response?.status === 401) {
    console.error('Pinata API 认证失败');
  } else if (error.response?.status === 429) {
    console.error('API 请求频率限制');
  } else {
    console.error('上传失败:', error.message);
  }
}
```

### 3. 数据验证

```typescript
import { isValidIPFSHash } from '@/lib/pinata';

// 验证 IPFS 哈希格式
if (!isValidIPFSHash(hash)) {
  throw new Error('无效的 IPFS 哈希格式');
}

// 验证数据完整性
const retrievedData = await pinata.getData(hash);
if (!retrievedData.name || !retrievedData.sport) {
  throw new Error('数据不完整');
}
```

### 4. 性能优化

```typescript
// 使用缓存避免重复请求
const cache = new Map<string, any>();

const getCachedData = async (hash: string) => {
  if (cache.has(hash)) {
    return cache.get(hash);
  }
  
  const data = await pinata.getData(hash);
  cache.set(hash, data);
  return data;
};
```

## 🔍 故障排除

### 常见问题

#### 1. API 认证失败

**错误**: `401 Unauthorized`

**解决方案**:
- 检查 API Key 和 Secret 是否正确
- 确认环境变量名称正确
- 验证 JWT Token 是否过期

#### 2. 文件上传失败

**错误**: `413 Payload Too Large`

**解决方案**:
- 检查文件大小限制 (免费账户限制 100MB)
- 压缩图片或文件
- 考虑升级 Pinata 计划

#### 3. IPFS 数据获取失败

**错误**: `404 Not Found`

**解决方案**:
- 验证 IPFS 哈希格式
- 检查网关是否可用
- 尝试使用不同的 IPFS 网关

#### 4. 网络连接问题

**错误**: `Network Error`

**解决方案**:
- 检查网络连接
- 验证防火墙设置
- 尝试使用代理或 VPN

### 调试技巧

```typescript
// 启用详细日志
const pinata = new PinataService(config);
pinata.enableDebugMode = true;

// 测试连接
const testConnection = async () => {
  try {
    const result = await pinata.getPinnedFiles(1, 0);
    console.log('连接成功:', result);
  } catch (error) {
    console.error('连接失败:', error);
  }
};
```

## 📚 相关资源

- [Pinata 官方文档](https://docs.pinata.cloud/)
- [IPFS 官方网站](https://ipfs.io/)
- [Ethereum IPFS 最佳实践](https://ethereum.org/en/developers/docs/storage/)
- [OpenZeppelin 合约库](https://openzeppelin.com/contracts/)

## 🤝 贡献

如果您发现问题或有改进建议，请：

1. 创建 Issue 描述问题
2. 提交 Pull Request
3. 更新相关文档

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。