import hre from "hardhat";
import { ethers as Ethers } from "ethers";
import { createPinataInstance, uploadAthleteProfile, uploadTokenMetadata } from "./ipfs-utils";
import "@nomicfoundation/hardhat-ethers";
import * as fs from "fs";
import * as path from "path";

// 部署配置接口
interface DeploymentConfig {
  network: string;
  contracts: {
    athleteRegistry: {
      address: string;
      proxy: string;
      implementation: string;
    };
    personalTokenFactory: {
      address: string;
      proxy: string;
      implementation: string;
    };
    achievementTracker: {
      address: string;
      proxy: string;
      implementation: string;
    };
  };
  ipfs: {
    deploymentMetadata: string;
    contractsMetadata: string;
  };
  timestamp: string;
  deployer: string;
}

async function main() {
  console.log("🚀 开始部署 FrisbeDAO 合约并集成 IPFS...");
  
  // 通过 Hardhat v3 的 network.connect 获取连接与 Provider
  const connection = await hre.network.connect({ network: "hardhat", chainType: "l1" } as any);
  const hhProvider: any = (connection as any).provider;
  if (!hhProvider) {
    throw new Error("Hardhat connection.provider 未找到");
  }
  // 使用 BrowserProvider 包装 EIP-1193 provider（ethers v6 支持）
  const provider = new Ethers.BrowserProvider(hhProvider as any);
  const deployer = await provider.getSigner();

  console.log("📝 部署者地址:", await deployer.getAddress());
  console.log("💰 部署者余额:", Ethers.formatEther(await provider.getBalance(await deployer.getAddress())), "ETH");

  // 初始化 Pinata IPFS 服务
  let pinata;
  try {
    pinata = createPinataInstance();
    console.log("✅ Pinata IPFS 服务初始化成功");
  } catch (error) {
    console.warn("⚠️  Pinata 配置未找到，跳过 IPFS 集成");
    console.warn("请设置环境变量: PINATA_API_KEY, PINATA_SECRET_KEY 或 PINATA_JWT");
  }

  // 部署实现合约
  console.log("\n📦 部署实现合约...");
  
  // 读取合约 artifact
  const athleteRegistryArtifact = await hre.artifacts.readArtifact("AthleteRegistry");
  const achievementTrackerArtifact = await hre.artifacts.readArtifact("AchievementTracker");
  const personalTokenFactoryArtifact = await hre.artifacts.readArtifact("PersonalTokenFactory");
  const proxyArtifact = await hre.artifacts.readArtifact("ERC1967ProxyWrapper");
  
  // 创建合约工厂
  const AthleteRegistryFactory = new Ethers.ContractFactory(
    athleteRegistryArtifact.abi,
    athleteRegistryArtifact.bytecode,
    deployer
  );
  
  const AchievementTrackerFactory = new Ethers.ContractFactory(
    achievementTrackerArtifact.abi,
    achievementTrackerArtifact.bytecode,
    deployer
  );
  
  const PersonalTokenFactoryFactory = new Ethers.ContractFactory(
    personalTokenFactoryArtifact.abi,
    personalTokenFactoryArtifact.bytecode,
    deployer
  );
  
  const ProxyFactory = new Ethers.ContractFactory(
    proxyArtifact.abi,
    proxyArtifact.bytecode,
    deployer
  );

  // 部署实现合约
  const athleteRegistryImpl = await AthleteRegistryFactory.deploy();
  await athleteRegistryImpl.waitForDeployment();
  console.log("✅ AthleteRegistry 实现合约:", await athleteRegistryImpl.getAddress());

  const personalTokenFactoryImpl = await PersonalTokenFactoryFactory.deploy();
  await personalTokenFactoryImpl.waitForDeployment();
  console.log("✅ PersonalTokenFactory 实现合约:", await personalTokenFactoryImpl.getAddress());

  const achievementTrackerImpl = await AchievementTrackerFactory.deploy();
  await achievementTrackerImpl.waitForDeployment();
  console.log("✅ AchievementTracker 实现合约:", await achievementTrackerImpl.getAddress());

  // 部署代理合约
  console.log("\n🔗 部署代理合约...");
  
  // 部署代理合约
  
  // AthleteRegistry 代理
  const athleteRegistryInterface = new Ethers.Interface(athleteRegistryArtifact.abi);
  const athleteRegistryInitData = athleteRegistryInterface.encodeFunctionData("initialize", [
    deployer.address,
    Ethers.parseEther("0.01") // 注册费用 0.01 ETH
  ]);
  const athleteRegistryProxy = await ProxyFactory.deploy(
    await athleteRegistryImpl.getAddress(),
    athleteRegistryInitData
  );
  await athleteRegistryProxy.waitForDeployment();
  console.log("✅ AthleteRegistry 代理:", await athleteRegistryProxy.getAddress());

  // PersonalTokenFactory 代理
  const personalTokenFactoryInterface = new Ethers.Interface(personalTokenFactoryArtifact.abi);
  const personalTokenFactoryInitData = personalTokenFactoryInterface.encodeFunctionData("initialize", [
    await deployer.getAddress(), // owner
    await athleteRegistryProxy.getAddress(), // athleteRegistry
    Ethers.parseEther("0.005"), // creationFee
    250 // platformFeePercentage (2.5%)
  ]);
  const personalTokenFactoryProxy = await ProxyFactory.deploy(
    await personalTokenFactoryImpl.getAddress(),
    personalTokenFactoryInitData
  );
  await personalTokenFactoryProxy.waitForDeployment();
  console.log("✅ PersonalTokenFactory 代理:", await personalTokenFactoryProxy.getAddress());

  // AchievementTracker 代理
  const achievementTrackerInterface = new Ethers.Interface(achievementTrackerArtifact.abi);
  const achievementTrackerInitData = achievementTrackerInterface.encodeFunctionData("initialize", [
    await deployer.getAddress(), // owner
    await athleteRegistryProxy.getAddress(), // athleteRegistry
    Ethers.parseEther("0.001"), // submissionFee
    Ethers.parseEther("0.0005") // verificationReward
  ]);
   const achievementTrackerProxy = await ProxyFactory.deploy(
    await achievementTrackerImpl.getAddress(),
    achievementTrackerInitData
  );
  await achievementTrackerProxy.waitForDeployment();
  console.log("✅ AchievementTracker 代理:", await achievementTrackerProxy.getAddress());

  // 准备部署配置
  const deploymentConfig: DeploymentConfig = {
    network: "localhost",
    contracts: {
      athleteRegistry: {
        address: await athleteRegistryProxy.getAddress(),
        proxy: await athleteRegistryProxy.getAddress(),
        implementation: await athleteRegistryImpl.getAddress()
      },
      personalTokenFactory: {
        address: await personalTokenFactoryProxy.getAddress(),
        proxy: await personalTokenFactoryProxy.getAddress(),
        implementation: await personalTokenFactoryImpl.getAddress()
      },
      achievementTracker: {
        address: await achievementTrackerProxy.getAddress(),
        proxy: await achievementTrackerProxy.getAddress(),
        implementation: await achievementTrackerImpl.getAddress()
      }
    },
    ipfs: {
      deploymentMetadata: "",
      contractsMetadata: ""
    },
    timestamp: new Date().toISOString(),
    deployer: deployer.address
  };

  // 上传部署信息到 IPFS
  if (pinata) {
    console.log("\n📤 上传部署信息到 IPFS...");
    
    try {
      // 上传部署元数据
      const deploymentMetadata = {
        projectName: "FrisbeDAO",
        version: "1.0.0",
        description: "去中心化运动员身份验证和成就追踪平台",
        deploymentConfig,
        features: [
          "运动员身份注册和验证",
          "个人代币发行",
          "成就追踪和NFT铸造",
          "声誉评分系统",
          "IPFS数据存储"
        ],
        contracts: {
          AthleteRegistry: {
            description: "运动员注册管理合约",
            features: ["身份验证", "个人资料存储", "声誉评分"]
          },
          PersonalTokenFactory: {
            description: "个人代币工厂合约",
            features: ["ERC20代币发行", "代币管理"]
          },
          AchievementTracker: {
            description: "成就追踪合约",
            features: ["成就记录", "NFT铸造", "验证系统"]
          }
        }
      };
      
      const deploymentHash = await pinata.uploadJSON(deploymentMetadata, {
        name: `frisbedao-deployment-${Date.now()}`,
        keyvalues: {
          type: "deployment-metadata",
          project: "FrisbeDAO",
          network: deploymentConfig.network,
          deployer: deployer.address
        }
      });
      
      deploymentConfig.ipfs.deploymentMetadata = deploymentHash;
      console.log("✅ 部署元数据 IPFS 哈希:", deploymentHash);
      
      // 上传合约 ABI 和元数据
      const contractsMetadata = {
        AthleteRegistry: {
          abi: JSON.stringify(athleteRegistryArtifact.abi),
          address: await athleteRegistryProxy.getAddress(),
          implementation: await athleteRegistryImpl.getAddress()
        },
        PersonalTokenFactory: {
          abi: JSON.stringify(personalTokenFactoryArtifact.abi),
          address: await personalTokenFactoryProxy.getAddress(),
          implementation: await personalTokenFactoryImpl.getAddress()
        },
        AchievementTracker: {
          abi: JSON.stringify(achievementTrackerArtifact.abi),
          address: await achievementTrackerProxy.getAddress(),
          implementation: await achievementTrackerImpl.getAddress()
        }
      };
      
      const contractsHash = await pinata.uploadJSON(contractsMetadata, {
        name: `frisbedao-contracts-${Date.now()}`,
        keyvalues: {
          type: "contracts-metadata",
          project: "FrisbeDAO",
          network: deploymentConfig.network
        }
      });
      
      deploymentConfig.ipfs.contractsMetadata = contractsHash;
      console.log("✅ 合约元数据 IPFS 哈希:", contractsHash);
      
    } catch (error) {
      console.error("❌ IPFS 上传失败:", error);
    }
  }

  // 保存部署配置到本地文件
  const configPath = path.join(process.cwd(), "deployment-config-ipfs.json");
  fs.writeFileSync(configPath, JSON.stringify(deploymentConfig, null, 2));
  console.log("\n💾 部署配置已保存到:", configPath);

  // 显示部署摘要
  console.log("\n🎉 部署完成!");
  console.log("📋 部署摘要:");
  console.log("├── AthleteRegistry:", deploymentConfig.contracts.athleteRegistry.address);
  console.log("├── PersonalTokenFactory:", deploymentConfig.contracts.personalTokenFactory.address);
  console.log("├── AchievementTracker:", deploymentConfig.contracts.achievementTracker.address);
  
  if (deploymentConfig.ipfs.deploymentMetadata) {
    console.log("├── 部署元数据 IPFS:", `https://gateway.pinata.cloud/ipfs/${deploymentConfig.ipfs.deploymentMetadata}`);
  }
  if (deploymentConfig.ipfs.contractsMetadata) {
    console.log("└── 合约元数据 IPFS:", `https://gateway.pinata.cloud/ipfs/${deploymentConfig.ipfs.contractsMetadata}`);
  }

  // 创建示例运动员数据并上传到 IPFS
  if (pinata) {
    console.log("\n📤 创建示例运动员数据...");
    
    try {
      const sampleAthleteData = {
        name: "张三",
        sport: "飞盘",
        bio: "专业飞盘运动员，拥有5年比赛经验",
        avatar: "https://example.com/avatar.jpg",
        achievements: [
          {
            title: "全国飞盘锦标赛冠军",
            date: "2023-08-15",
            description: "在2023年全国飞盘锦标赛中获得冠军"
          },
          {
            title: "亚洲飞盘公开赛亚军",
            date: "2023-06-20",
            description: "在亚洲飞盘公开赛中获得亚军"
          }
        ],
        stats: {
          matchesPlayed: 45,
          winRate: 0.78,
          totalPoints: 1250
        },
        socialLinks: {
          twitter: "@zhangsan_frisbee",
          instagram: "@zhangsan_ultimate"
        }
      };
      
      const athleteHash = await uploadAthleteProfile(pinata, sampleAthleteData);
      console.log("✅ 示例运动员数据 IPFS 哈希:", athleteHash);
      console.log("🔗 查看数据:", `https://gateway.pinata.cloud/ipfs/${athleteHash}`);
      
      // 创建示例代币元数据
      const sampleTokenMetadata = {
        name: "张三个人代币",
        description: "张三的个人运动员代币，代表其在飞盘运动中的成就和价值",
        image: "https://gateway.pinata.cloud/ipfs/QmSampleImageHash",
        attributes: [
          {
            trait_type: "运动项目",
            value: "飞盘"
          },
          {
            trait_type: "经验年限",
            value: 5
          },
          {
            trait_type: "声誉评分",
            value: 850
          },
          {
            trait_type: "成就数量",
            value: 2
          }
        ],
        external_url: "https://frisbedao.com/athlete/zhangsan",
        background_color: "#1E40AF"
      };
      
      const tokenHash = await uploadTokenMetadata(pinata, sampleTokenMetadata);
      console.log("✅ 示例代币元数据 IPFS 哈希:", tokenHash);
      console.log("🔗 查看元数据:", `https://gateway.pinata.cloud/ipfs/${tokenHash}`);
      
    } catch (error) {
      console.error("❌ 示例数据上传失败:", error);
    }
  }

  console.log("\n🔧 下一步:");
  console.log("1. 设置 Pinata 环境变量以启用 IPFS 功能");
  console.log("2. 在前端配置合约地址");
  console.log("3. 测试运动员注册和数据上传功能");
  console.log("4. 部署到测试网或主网");
}

// 错误处理
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });