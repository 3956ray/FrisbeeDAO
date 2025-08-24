import { ethers, upgrades } from "hardhat";
import { AthleteRegistry, PersonalTokenFactory, AchievementTracker } from "../typechain-types";

async function main() {
  console.log("🚀 开始部署 FrisbeDAO 核心合约...");
  
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);
  console.log("账户余额:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  // 部署参数配置
  const deployConfig = {
    athleteRegistry: {
      registrationFee: ethers.parseEther("0.01"), // 0.01 ETH 注册费
    },
    personalTokenFactory: {
      creationFee: ethers.parseEther("0.005"), // 0.005 ETH 创建费
      platformFeePercentage: 250, // 2.5% 平台手续费
    },
    achievementTracker: {
      submissionFee: ethers.parseEther("0.001"), // 0.001 ETH 提交费
      verificationReward: ethers.parseEther("0.0005"), // 0.0005 ETH 验证奖励
    },
  };

  try {
    // 1. 部署 AthleteRegistry
    console.log("\n📋 部署 AthleteRegistry 合约...");
    const AthleteRegistryFactory = await ethers.getContractFactory("AthleteRegistry");
    const athleteRegistry = await upgrades.deployProxy(
      AthleteRegistryFactory,
      [
        deployer.address, // owner
        deployConfig.athleteRegistry.registrationFee,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    ) as unknown as AthleteRegistry;
    
    await athleteRegistry.waitForDeployment();
    const athleteRegistryAddress = await athleteRegistry.getAddress();
    console.log("✅ AthleteRegistry 部署成功:", athleteRegistryAddress);

    // 2. 部署 PersonalTokenFactory
    console.log("\n🏭 部署 PersonalTokenFactory 合约...");
    const PersonalTokenFactoryFactory = await ethers.getContractFactory("PersonalTokenFactory");
    const personalTokenFactory = await upgrades.deployProxy(
      PersonalTokenFactoryFactory,
      [
        deployer.address, // owner
        athleteRegistryAddress, // athleteRegistry
        deployConfig.personalTokenFactory.creationFee,
        deployConfig.personalTokenFactory.platformFeePercentage,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    ) as unknown as PersonalTokenFactory;
    
    await personalTokenFactory.waitForDeployment();
    const personalTokenFactoryAddress = await personalTokenFactory.getAddress();
    console.log("✅ PersonalTokenFactory 部署成功:", personalTokenFactoryAddress);

    // 3. 部署 AchievementTracker
    console.log("\n🏆 部署 AchievementTracker 合约...");
    const AchievementTrackerFactory = await ethers.getContractFactory("AchievementTracker");
    const achievementTracker = await upgrades.deployProxy(
      AchievementTrackerFactory,
      [
        deployer.address, // owner
        athleteRegistryAddress, // athleteRegistry
        deployConfig.achievementTracker.submissionFee,
        deployConfig.achievementTracker.verificationReward,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    ) as unknown as AchievementTracker;
    
    await achievementTracker.waitForDeployment();
    const achievementTrackerAddress = await achievementTracker.getAddress();
    console.log("✅ AchievementTracker 部署成功:", achievementTrackerAddress);

    // 4. 初始化配置
    console.log("\n⚙️ 进行初始化配置...");
    
    // 添加初始验证者（部署者作为第一个验证者）
    console.log("添加初始验证者...");
    await athleteRegistry.addVerifier(deployer.address, "FrisbeDAO Team");
    await achievementTracker.addVerifier(deployer.address, 5, "General Sports");
    
    console.log("✅ 初始化配置完成");

    // 5. 验证部署
    console.log("\n🔍 验证部署状态...");
    
    const registrationFee = await athleteRegistry.registrationFee();
    const creationFee = await personalTokenFactory.creationFee();
    const submissionFee = await achievementTracker.submissionFee();
    
    console.log("AthleteRegistry 注册费:", ethers.formatEther(registrationFee), "ETH");
    console.log("PersonalTokenFactory 创建费:", ethers.formatEther(creationFee), "ETH");
    console.log("AchievementTracker 提交费:", ethers.formatEther(submissionFee), "ETH");

    // 6. 输出部署摘要
    console.log("\n📄 部署摘要:");
    console.log("==================================");
    console.log(`AthleteRegistry: ${athleteRegistryAddress}`);
    console.log(`PersonalTokenFactory: ${personalTokenFactoryAddress}`);
    console.log(`AchievementTracker: ${achievementTrackerAddress}`);
    console.log("==================================");
    
    // 7. 生成配置文件
    const deploymentConfig = {
      network: (await ethers.provider.getNetwork()).name,
      chainId: (await ethers.provider.getNetwork()).chainId.toString(),
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: {
        AthleteRegistry: {
          address: athleteRegistryAddress,
          registrationFee: ethers.formatEther(registrationFee),
        },
        PersonalTokenFactory: {
          address: personalTokenFactoryAddress,
          creationFee: ethers.formatEther(creationFee),
          platformFeePercentage: deployConfig.personalTokenFactory.platformFeePercentage,
        },
        AchievementTracker: {
          address: achievementTrackerAddress,
          submissionFee: ethers.formatEther(submissionFee),
          verificationReward: ethers.formatEther(deployConfig.achievementTracker.verificationReward),
        },
      },
    };
    
    // 保存部署配置
    const fs = await import("fs");
    const path = await import("path");
    const configPath = path.join(__dirname, "..", "deployment-config.json");
    fs.writeFileSync(configPath, JSON.stringify(deploymentConfig, null, 2));
    console.log(`\n💾 部署配置已保存到: ${configPath}`);
    
    console.log("\n🎉 FrisbeDAO 核心合约部署完成!");
    
  } catch (error) {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  }
}

// 错误处理
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 脚本执行失败:", error);
    process.exit(1);
  });