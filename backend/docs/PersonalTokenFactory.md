# PersonalTokenFactory

## 概述

個人代幣工廠合約，為每個運動員創建和管理個人代幣

## 主要功能

- 個人代幣創建
- 聯合曲線定價機制
- 交易手續費管理
- 價格預言機集成
- 等級折扣系統

## 合約接口

### 函數

#### `MAX_PLATFORM_FEE()`

- **可見性**: view
- **返回值**: uint256
- **描述**: 待補充描述

#### `UPGRADE_INTERFACE_VERSION()`

- **可見性**: view
- **返回值**: string
- **描述**: 待補充描述

#### `allTokens(: uint256)`

- **可見性**: view
- **返回值**: address
- **描述**: 待補充描述

#### `athleteRegistry()`

- **可見性**: view
- **返回值**: address
- **描述**: 待補充描述

#### `athleteTokens(: address)`

- **可見性**: view
- **返回值**: address, string, string, uint256, uint256, uint256, bool
- **描述**: 待補充描述

#### `batchBuyTokens(_tokenAddress: address, _amount: uint256)`

- **可見性**: payable
- **返回值**: void
- **描述**: 待補充描述

#### `createPersonalToken(_name: string, _symbol: string, _basePrice: uint256, _baseSupply: uint256)`

- **可見性**: payable
- **返回值**: void
- **描述**: 待補充描述

#### `creationFee()`

- **可見性**: view
- **返回值**: uint256
- **描述**: 待補充描述

#### `deactivateToken(_athlete: address)`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 待補充描述

#### `emergencyPause()`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 暫停合約功能

#### `getAllTokens()`

- **可見性**: view
- **返回值**: address[]
- **描述**: 待補充描述

#### `getAthleteToken(_athlete: address)`

- **可見性**: view
- **返回值**: tuple
- **描述**: 待補充描述

#### `getTokenAthlete(_token: address)`

- **可見性**: view
- **返回值**: address
- **描述**: 待補充描述

#### `getTokenCount()`

- **可見性**: view
- **返回值**: uint256
- **描述**: 待補充描述

#### `initialize(_owner: address, _athleteRegistry: address, _creationFee: uint256, _platformFeePercentage: uint256)`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 初始化合約，設置初始參數

#### `isTokenActive(_athlete: address)`

- **可見性**: view
- **返回值**: bool
- **描述**: 待補充描述

#### `owner()`

- **可見性**: view
- **返回值**: address
- **描述**: 待補充描述

#### `paused()`

- **可見性**: view
- **返回值**: bool
- **描述**: 暫停合約功能

#### `platformFeePercentage()`

- **可見性**: view
- **返回值**: uint256
- **描述**: 待補充描述

#### `proxiableUUID()`

- **可見性**: view
- **返回值**: bytes32
- **描述**: 待補充描述

#### `renounceOwnership()`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 待補充描述

#### `setCreationFee(_newCreationFee: uint256)`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 待補充描述

#### `setPlatformFeePercentage(_newFeePercentage: uint256)`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 待補充描述

#### `tokenToAthlete(: address)`

- **可見性**: view
- **返回值**: address
- **描述**: 待補充描述

#### `transferOwnership(newOwner: address)`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 轉移資產

#### `unpause()`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 暫停合約功能

#### `upgradeToAndCall(newImplementation: address, data: bytes)`

- **可見性**: payable
- **返回值**: void
- **描述**: 待補充描述

#### `withdraw()`

- **可見性**: nonpayable
- **返回值**: void
- **描述**: 提取資金


### 事件

#### `CreationFeeUpdated(oldFee: uint256, newFee: uint256)`

當數據更新時觸發

#### `Initialized(version: uint64)`

待補充描述

#### `OwnershipTransferred(previousOwner: address indexed, newOwner: address indexed)`

當資產轉移時觸發

#### `Paused(account: address)`

當合約暫停時觸發

#### `PlatformFeeUpdated(oldFee: uint256, newFee: uint256)`

當數據更新時觸發

#### `TokenCreated(athlete: address indexed, tokenAddress: address indexed, name: string, symbol: string, basePrice: uint256, baseSupply: uint256)`

待補充描述

#### `TokenDeactivated(athlete: address indexed, tokenAddress: address indexed)`

待補充描述

#### `Unpaused(account: address)`

當合約恢復時觸發

#### `Upgraded(implementation: address indexed)`

待補充描述


### 錯誤

#### `AddressEmptyCode(target: address)`

自定義錯誤，用於優化 Gas 消耗

#### `ERC1967InvalidImplementation(implementation: address)`

自定義錯誤，用於優化 Gas 消耗

#### `ERC1967NonPayable()`

自定義錯誤，用於優化 Gas 消耗

#### `EnforcedPause()`

自定義錯誤，用於優化 Gas 消耗

#### `ExpectedPause()`

自定義錯誤，用於優化 Gas 消耗

#### `FailedCall()`

自定義錯誤，用於優化 Gas 消耗

#### `InsufficientBalance(balance: uint256, needed: uint256)`

自定義錯誤，用於優化 Gas 消耗

#### `InvalidInitialization()`

自定義錯誤，用於優化 Gas 消耗

#### `NotInitializing()`

自定義錯誤，用於優化 Gas 消耗

#### `OwnableInvalidOwner(owner: address)`

自定義錯誤，用於優化 Gas 消耗

#### `OwnableUnauthorizedAccount(account: address)`

自定義錯誤，用於優化 Gas 消耗

#### `ReentrancyGuardReentrantCall()`

自定義錯誤，用於優化 Gas 消耗

#### `UUPSUnauthorizedCallContext()`

自定義錯誤，用於優化 Gas 消耗

#### `UUPSUnsupportedProxiableUUID(slot: bytes32)`

自定義錯誤，用於優化 Gas 消耗


## 使用示例

```javascript
// 部署合約
const PersonalTokenFactory = await ethers.getContractFactory("PersonalTokenFactory");
const personaltokenfactory = await PersonalTokenFactory.deploy();

// 調用函數示例
// TODO: 添加具體的使用示例
```

## 安全考慮

- 使用 OpenZeppelin 的安全庫
- 實現訪問控制機制
- 包含重入保護
- 支持緊急暫停功能

## 許可證

MIT License
