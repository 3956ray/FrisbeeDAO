import hre from "hardhat";
import { ethers as Ethers } from "ethers";

async function main() {
  console.log("🚀 开始部署 FrisbeDAO 核心合约...");

  // 直接连到本地 Hardhat 节点，避免 hre.ethers 注入问题
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const provider = new Ethers.JsonRpcProvider(rpcUrl);

  // 使用 Hardhat 本地节点默认助记词推导第一个账户
  const mnemonic = process.env.MNEMONIC || "test test test test test test test test test test test junk";
  const wallet = Ethers.Wallet.fromPhrase(mnemonic);
  const signer = wallet.connect(provider);

  const deployer = await signer.getAddress();
  let currentNonce = await provider.getTransactionCount(deployer, "latest");
  const nextNonce = () => currentNonce++;

  const balance = await provider.getBalance(deployer);
  console.log("📝 部署账户:", deployer);
  console.log("💰 账户余额:", Ethers.formatEther(balance), "ETH");

  // 读取合约 Artifact（ABI + bytecode）
  const AthleteRegistryArtifact = await hre.artifacts.readArtifact("AthleteRegistry");
  const PersonalTokenFactoryArtifact = await hre.artifacts.readArtifact("PersonalTokenFactory");
  const AchievementTrackerArtifact = await hre.artifacts.readArtifact("AchievementTracker");
  const PriceOracleArtifact = await hre.artifacts.readArtifact("PriceOracle");
  const ContentManagerArtifact = await hre.artifacts.readArtifact("ContentManager");
  const ERC1967ProxyArtifact = await hre.artifacts.readArtifact("ERC1967ProxyWrapper");

  // 部署参数配置
  const deployConfig = {
    athleteRegistry: {
      registrationFee: Ethers.parseEther("0.01"), // 0.01 ETH 注册费
    },
    personalTokenFactory: {
      creationFee: Ethers.parseEther("0.005"), // 0.005 ETH 创建费
      platformFeePercentage: 250, // 2.5% 平台手续费
    },
    achievementTracker: {
      submissionFee: Ethers.parseEther("0.001"), // 0.001 ETH 提交费
      verificationReward: Ethers.parseEther("0.0005"), // 0.0005 ETH 验证奖励
    },
    priceOracle: {
      // PriceOracle 配置
    },
    contentManager: {
      platformFeePercentage: 1500, // 15% 平台手续费
    },
  };

  try {
    // 1. 部署 AthleteRegistry 实现 + 代理
    console.log("\n📋 部署 AthleteRegistry 合约...");
    const AthleteRegistryFactory = new Ethers.ContractFactory(
      AthleteRegistryArtifact.abi,
      AthleteRegistryArtifact.bytecode,
      signer
    );

    const athleteImpl = await AthleteRegistryFactory.deploy({ nonce: nextNonce() });
    await athleteImpl.waitForDeployment();
    const athleteImplAddress = await athleteImpl.getAddress();
    console.log("实现合约部署成功:", athleteImplAddress);

    const athleteIface = new Ethers.Interface(AthleteRegistryArtifact.abi);
    const athleteInitData = athleteIface.encodeFunctionData("initialize", [
      await signer.getAddress(), // owner
      deployConfig.athleteRegistry.registrationFee,
    ]);

    const ProxyFactory = new Ethers.ContractFactory(
       ERC1967ProxyArtifact.abi,
       ERC1967ProxyArtifact.bytecode,
       signer
     );

    const athleteProxy = await ProxyFactory.deploy(athleteImplAddress, athleteInitData, { nonce: nextNonce() });
    await athleteProxy.waitForDeployment();
    const athleteRegistryAddress = await athleteProxy.getAddress();
    console.log("✅ AthleteRegistry 代理部署成功:", athleteRegistryAddress);

    const athleteRegistry = new Ethers.Contract(
      athleteRegistryAddress,
      AthleteRegistryArtifact.abi,
      signer
    );

    // 2. 部署 PersonalTokenFactory 实现 + 代理
    console.log("\n🏭 部署 PersonalTokenFactory 合约...");
    const PersonalTokenFactoryFactory = new Ethers.ContractFactory(
      PersonalTokenFactoryArtifact.abi,
      PersonalTokenFactoryArtifact.bytecode,
      signer
    );
    const factoryImpl = await PersonalTokenFactoryFactory.deploy({ nonce: nextNonce() });
    await factoryImpl.waitForDeployment();
    const factoryImplAddress = await factoryImpl.getAddress();
    console.log("实现合约部署成功:", factoryImplAddress);

    const factoryIface = new Ethers.Interface(PersonalTokenFactoryArtifact.abi);
    const personalTokenInitData = factoryIface.encodeFunctionData("initialize", [
      await signer.getAddress(), // owner
      athleteRegistryAddress, // athleteRegistry
      deployConfig.personalTokenFactory.creationFee,
      deployConfig.personalTokenFactory.platformFeePercentage,
    ]);

    const factoryProxy = await ProxyFactory.deploy(factoryImplAddress, personalTokenInitData, { nonce: nextNonce() });
    await factoryProxy.waitForDeployment();
    const personalTokenFactoryAddress = await factoryProxy.getAddress();
    console.log("✅ PersonalTokenFactory 代理部署成功:", personalTokenFactoryAddress);

    const personalTokenFactory = new Ethers.Contract(
      personalTokenFactoryAddress,
      PersonalTokenFactoryArtifact.abi,
      signer
    );

    // 3. 部署 AchievementTracker 实现 + 代理
    console.log("\n🏆 部署 AchievementTracker 合约...");
    const AchievementTrackerFactory = new Ethers.ContractFactory(
      AchievementTrackerArtifact.abi,
      AchievementTrackerArtifact.bytecode,
      signer
    );

    const trackerImpl = await AchievementTrackerFactory.deploy({ nonce: nextNonce() });
    await trackerImpl.waitForDeployment();
    const trackerImplAddress = await trackerImpl.getAddress();
    console.log("实现合约部署成功:", trackerImplAddress);

    const trackerIface = new Ethers.Interface(AchievementTrackerArtifact.abi);
    const achievementInitData = trackerIface.encodeFunctionData("initialize", [
      await signer.getAddress(), // owner
      athleteRegistryAddress, // athleteRegistry
      deployConfig.achievementTracker.submissionFee,
      deployConfig.achievementTracker.verificationReward,
    ]);

    const trackerProxy = await ProxyFactory.deploy(trackerImplAddress, achievementInitData, { nonce: nextNonce() });
    await trackerProxy.waitForDeployment();
    const achievementTrackerAddress = await trackerProxy.getAddress();
    console.log("✅ AchievementTracker 代理部署成功:", achievementTrackerAddress);

    const achievementTracker = new Ethers.Contract(
      achievementTrackerAddress,
      AchievementTrackerArtifact.abi,
      signer
    );

    // 4. 部署 PriceOracle 实现 + 代理
    console.log("\n📊 部署 PriceOracle 合约...");
    const PriceOracleFactory = new Ethers.ContractFactory(
      PriceOracleArtifact.abi,
      PriceOracleArtifact.bytecode,
      signer
    );
    const oracleImpl = await PriceOracleFactory.deploy({ nonce: nextNonce() });
    await oracleImpl.waitForDeployment();
    const oracleImplAddress = await oracleImpl.getAddress();
    console.log("实现合约部署成功:", oracleImplAddress);

    const oracleIface = new Ethers.Interface(PriceOracleArtifact.abi);
    const oracleInitData = oracleIface.encodeFunctionData("initialize", [
      await signer.getAddress(), // owner
    ]);

    const oracleProxy = await ProxyFactory.deploy(oracleImplAddress, oracleInitData, { nonce: nextNonce() });
    await oracleProxy.waitForDeployment();
    const priceOracleAddress = await oracleProxy.getAddress();
    console.log("✅ PriceOracle 代理部署成功:", priceOracleAddress);

    const priceOracle = new Ethers.Contract(
      priceOracleAddress,
      PriceOracleArtifact.abi,
      signer
    );

    // 5. 部署 ContentManager 实现 + 代理
    console.log("\n📝 部署 ContentManager 合约...");
    const ContentManagerFactory = new Ethers.ContractFactory(
      ContentManagerArtifact.abi,
      ContentManagerArtifact.bytecode,
      signer
    );
    const contentImpl = await ContentManagerFactory.deploy({ nonce: nextNonce() });
    await contentImpl.waitForDeployment();
    const contentImplAddress = await contentImpl.getAddress();
    console.log("实现合约部署成功:", contentImplAddress);

    const contentIface = new Ethers.Interface(ContentManagerArtifact.abi);
    const contentInitData = contentIface.encodeFunctionData("initialize", [
      await signer.getAddress(), // owner
      await signer.getAddress(), // feeRecipient
      deployConfig.contentManager.platformFeePercentage,
      athleteRegistryAddress, // athleteRegistry
    ]);

    const contentProxy = await ProxyFactory.deploy(contentImplAddress, contentInitData, { nonce: nextNonce() });
    await contentProxy.waitForDeployment();
    const contentManagerAddress = await contentProxy.getAddress();
    console.log("✅ ContentManager 代理部署成功:", contentManagerAddress);

    const contentManager = new Ethers.Contract(
      contentManagerAddress,
      ContentManagerArtifact.abi,
      signer
    );

    // 6. 初始化配置
    console.log("\n⚙️ 进行初始化配置...");
    // 添加初始验证者（部署者作为第一个验证者）
    console.log("添加初始验证者...");
    const deployerAddr = await signer.getAddress();
    await (await athleteRegistry.addVerifier(deployerAddr, "FrisbeDAO Team", { nonce: nextNonce() })).wait();
    await (await achievementTracker.addVerifier(deployerAddr, 5, "General Sports", { nonce: nextNonce() })).wait();
    
    console.log("✅ 初始化配置完成");

    // 7. 验证部署
    console.log("\n🔍 验证部署状态...");
    const registrationFee = await athleteRegistry.registrationFee();
    const creationFee = await personalTokenFactory.creationFee();
    const submissionFee = await achievementTracker.submissionFee();
    const oracleVersion = await priceOracle.getVersion();
    const contentVersion = await contentManager.getVersion();
    
    console.log("AthleteRegistry 注册费:", Ethers.formatEther(registrationFee), "ETH");
     console.log("PersonalTokenFactory 创建费:", Ethers.formatEther(creationFee), "ETH");
     console.log("AchievementTracker 提交费:", Ethers.formatEther(submissionFee), "ETH");
    console.log("PriceOracle 版本:", oracleVersion);
    console.log("ContentManager 版本:", contentVersion);

    // 8. 输出部署摘要
    console.log("\n📄 部署摘要:");
    console.log("==================================");
    console.log(`AthleteRegistry: ${athleteRegistryAddress}`);
    console.log(`PersonalTokenFactory: ${personalTokenFactoryAddress}`);
    console.log(`AchievementTracker: ${achievementTrackerAddress}`);
    console.log(`PriceOracle: ${priceOracleAddress}`);
    console.log(`ContentManager: ${contentManagerAddress}`);
    console.log("==================================");
    
    // 9. 生成配置文件
    const networkInfo = await provider.getNetwork();
    const deploymentConfig = {
      network: (networkInfo as any).name || "localhost",
      chainId: String(networkInfo.chainId),
      deployer: deployerAddr,
      timestamp: new Date().toISOString(),
      contracts: {
        AthleteRegistry: {
          address: athleteRegistryAddress,
          registrationFee: Ethers.formatEther(registrationFee),
        },
        PersonalTokenFactory: {
          address: personalTokenFactoryAddress,
          creationFee: Ethers.formatEther(creationFee),
          platformFeePercentage: deployConfig.personalTokenFactory.platformFeePercentage,
        },
        AchievementTracker: {
          address: achievementTrackerAddress,
          submissionFee: Ethers.formatEther(submissionFee),
           verificationReward: Ethers.formatEther(deployConfig.achievementTracker.verificationReward),
        },
        PriceOracle: {
          address: priceOracleAddress,
          version: oracleVersion,
        },
        ContentManager: {
          address: contentManagerAddress,
          platformFeePercentage: deployConfig.contentManager.platformFeePercentage,
          version: contentVersion,
        },
      },
    };
    
    // 保存部署配置
    const fs = await import("fs");
    const path = await import("path");
    const configPath = path.join(process.cwd(), "deployment-config.json");
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