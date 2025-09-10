import hre from "hardhat";
import { parseEther, formatEther, createWalletClient, http, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonZkEvmTestnet } from "viem/chains";
import fs from "fs";
import path from "path";

// Polygon zkEVM Testnet 配置
const POLYGON_ZKEVM_TESTNET_CONFIG = {
  chain: polygonZkEvmTestnet,
  rpcUrl: process.env.POLYGON_ZKEVM_TESTNET_RPC_URL || "https://rpc.public.zkevm-test.net",
  explorerUrl: "https://testnet-zkevm.polygonscan.com",
  chainId: 1442,
};

async function main() {
  console.log("🚀 開始部署 FrisbeDAO 合約到 Polygon zkEVM Testnet...");
  
  // 檢查私鑰
  if (!process.env.PRIVATE_KEY) {
    throw new Error("請在 .env 文件中設置 PRIVATE_KEY");
  }
  
  const { chain, rpcUrl, explorerUrl } = POLYGON_ZKEVM_TESTNET_CONFIG;
  
  // 創建帳戶和客戶端
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  
  console.log(`📝 部署帳戶: ${account.address}`);
  console.log(`🌐 網絡: Polygon zkEVM Testnet (Chain ID: ${chain.id})`);
  console.log(`🔗 RPC URL: ${rpcUrl}`);
  
  // 檢查餘額
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 帳戶餘額: ${formatEther(balance)} ETH`);
  
  if (balance < parseEther("0.1")) {
    console.warn("⚠️ 警告: 帳戶餘額較低，可能無法完成部署");
    console.log("💡 提示: 請前往 https://bridge.polygon.technology/ 獲取測試代幣");
  }
  
  // 部署參數
  const registrationFee = parseEther("0.01"); // 0.01 ETH
  const creationFee = parseEther("0.005"); // 0.005 ETH
  const platformFeePercentage = 250n; // 2.5%
  const submissionFee = parseEther("0.001"); // 0.001 ETH
  const verificationReward = parseEther("0.0005"); // 0.0005 ETH
  
  console.log("\n📋 部署參數:");
  console.log(`   註冊費用: ${formatEther(registrationFee)} ETH`);
  console.log(`   創建費用: ${formatEther(creationFee)} ETH`);
  console.log(`   平台手續費: ${platformFeePercentage / 100n}%`);
  console.log(`   提交費用: ${formatEther(submissionFee)} ETH`);
  console.log(`   驗證獎勵: ${formatEther(verificationReward)} ETH`);
  
  // 獲取合約工廠
  const AthleteRegistry = await hre.artifacts.readArtifact("AthleteRegistry");
  const PersonalTokenFactory = await hre.artifacts.readArtifact("PersonalTokenFactory");
  const AchievementTracker = await hre.artifacts.readArtifact("AchievementTracker");
  const PriceOracle = await hre.artifacts.readArtifact("PriceOracle");
  const ContentManager = await hre.artifacts.readArtifact("ContentManager");
  
  const deployedContracts: any = {};
  
  try {
    // 1. 部署 AthleteRegistry
    console.log("\n🏃 部署 AthleteRegistry...");
    const athleteRegistryHash = await walletClient.deployContract({
      abi: AthleteRegistry.abi,
      bytecode: AthleteRegistry.bytecode as `0x${string}`,
      args: [registrationFee],
    });
    
    const athleteRegistryReceipt = await publicClient.waitForTransactionReceipt({
      hash: athleteRegistryHash,
    });
    
    if (!athleteRegistryReceipt.contractAddress) {
      throw new Error("AthleteRegistry 部署失敗");
    }
    
    deployedContracts.athleteRegistry = athleteRegistryReceipt.contractAddress;
    console.log(`✅ AthleteRegistry 部署成功: ${athleteRegistryReceipt.contractAddress}`);
    console.log(`   Gas 使用: ${athleteRegistryReceipt.gasUsed}`);
    
    // 2. 部署 PersonalTokenFactory
    console.log("\n🏭 部署 PersonalTokenFactory...");
    const personalTokenFactoryHash = await walletClient.deployContract({
      abi: PersonalTokenFactory.abi,
      bytecode: PersonalTokenFactory.bytecode as `0x${string}`,
      args: [deployedContracts.athleteRegistry, creationFee, platformFeePercentage],
    });
    
    const personalTokenFactoryReceipt = await publicClient.waitForTransactionReceipt({
      hash: personalTokenFactoryHash,
    });
    
    if (!personalTokenFactoryReceipt.contractAddress) {
      throw new Error("PersonalTokenFactory 部署失敗");
    }
    
    deployedContracts.personalTokenFactory = personalTokenFactoryReceipt.contractAddress;
    console.log(`✅ PersonalTokenFactory 部署成功: ${personalTokenFactoryReceipt.contractAddress}`);
    console.log(`   Gas 使用: ${personalTokenFactoryReceipt.gasUsed}`);
    
    // 3. 部署 AchievementTracker
    console.log("\n🏆 部署 AchievementTracker...");
    const achievementTrackerHash = await walletClient.deployContract({
      abi: AchievementTracker.abi,
      bytecode: AchievementTracker.bytecode as `0x${string}`,
      args: [deployedContracts.athleteRegistry],
    });
    
    const achievementTrackerReceipt = await publicClient.waitForTransactionReceipt({
      hash: achievementTrackerHash,
    });
    
    if (!achievementTrackerReceipt.contractAddress) {
      throw new Error("AchievementTracker 部署失敗");
    }
    
    deployedContracts.achievementTracker = achievementTrackerReceipt.contractAddress;
    console.log(`✅ AchievementTracker 部署成功: ${achievementTrackerReceipt.contractAddress}`);
    console.log(`   Gas 使用: ${achievementTrackerReceipt.gasUsed}`);
    
    // 4. 部署 PriceOracle
    console.log("\n📊 部署 PriceOracle...");
    const priceOracleHash = await walletClient.deployContract({
      abi: PriceOracle.abi,
      bytecode: PriceOracle.bytecode as `0x${string}`,
      args: [submissionFee, verificationReward],
    });
    
    const priceOracleReceipt = await publicClient.waitForTransactionReceipt({
      hash: priceOracleHash,
    });
    
    if (!priceOracleReceipt.contractAddress) {
      throw new Error("PriceOracle 部署失敗");
    }
    
    deployedContracts.priceOracle = priceOracleReceipt.contractAddress;
    console.log(`✅ PriceOracle 部署成功: ${priceOracleReceipt.contractAddress}`);
    console.log(`   Gas 使用: ${priceOracleReceipt.gasUsed}`);
    
    // 5. 部署 ContentManager
    console.log("\n📄 部署 ContentManager...");
    const contentManagerHash = await walletClient.deployContract({
      abi: ContentManager.abi,
      bytecode: ContentManager.bytecode as `0x${string}`,
      args: [deployedContracts.athleteRegistry],
    });
    
    const contentManagerReceipt = await publicClient.waitForTransactionReceipt({
      hash: contentManagerHash,
    });
    
    if (!contentManagerReceipt.contractAddress) {
      throw new Error("ContentManager 部署失敗");
    }
    
    deployedContracts.contentManager = contentManagerReceipt.contractAddress;
    console.log(`✅ ContentManager 部署成功: ${contentManagerReceipt.contractAddress}`);
    console.log(`   Gas 使用: ${contentManagerReceipt.gasUsed}`);
    
    // 保存部署配置
    const deploymentConfig = {
      network: "polygonZkEVMTestnet",
      chainId: POLYGON_ZKEVM_TESTNET_CONFIG.chainId,
      deployer: account.address,
      timestamp: new Date().toISOString(),
      contracts: {
        athleteRegistry: {
          address: deployedContracts.athleteRegistry,
          constructorArgs: [registrationFee.toString()],
        },
        personalTokenFactory: {
          address: deployedContracts.personalTokenFactory,
          constructorArgs: [
            deployedContracts.athleteRegistry,
            creationFee.toString(),
            platformFeePercentage.toString(),
          ],
        },
        achievementTracker: {
          address: deployedContracts.achievementTracker,
          constructorArgs: [deployedContracts.athleteRegistry],
        },
        priceOracle: {
          address: deployedContracts.priceOracle,
          constructorArgs: [submissionFee.toString(), verificationReward.toString()],
        },
        contentManager: {
          address: deployedContracts.contentManager,
          constructorArgs: [deployedContracts.athleteRegistry],
        },
      },
      parameters: {
        registrationFee: formatEther(registrationFee),
        creationFee: formatEther(creationFee),
        platformFeePercentage: (Number(platformFeePercentage) / 100).toString() + "%",
        submissionFee: formatEther(submissionFee),
        verificationReward: formatEther(verificationReward),
      },
    };
    
    // 保存配置文件
    const configPath = path.join(__dirname, "..", "deployment-config-polygon-zkevm.json");
    fs.writeFileSync(configPath, JSON.stringify(deploymentConfig, null, 2));
    
    console.log("\n🎉 所有合約部署完成!");
    console.log("\n📄 合約地址:");
    console.log(`   AthleteRegistry: ${deployedContracts.athleteRegistry}`);
    console.log(`   PersonalTokenFactory: ${deployedContracts.personalTokenFactory}`);
    console.log(`   AchievementTracker: ${deployedContracts.achievementTracker}`);
    console.log(`   PriceOracle: ${deployedContracts.priceOracle}`);
    console.log(`   ContentManager: ${deployedContracts.contentManager}`);
    
    console.log("\n🔗 區塊鏈瀏覽器鏈接:");
    Object.entries(deployedContracts).forEach(([name, address]) => {
      console.log(`   ${name}: ${explorerUrl}/address/${address}`);
    });
    
    console.log(`\n💾 部署配置已保存到: ${configPath}`);
    
    console.log("\n🔧 下一步操作:");
    console.log("1. 驗證合約 (可選): npx hardhat verify --network polygonZkEVMTestnet <合約地址> <構造函數參數>");
    console.log("2. 初始化合約: 調用各合約的初始化函數");
    console.log("3. 設置合約間的關聯關係");
    console.log("4. 更新前端配置文件中的合約地址");
    
    return deployedContracts;
    
  } catch (error) {
    console.error("❌ 部署過程中發生錯誤:", error);
    
    // 如果部分合約已部署，顯示已部署的合約
    if (Object.keys(deployedContracts).length > 0) {
      console.log("\n📋 已部署的合約:");
      Object.entries(deployedContracts).forEach(([name, address]) => {
        console.log(`   ${name}: ${address}`);
      });
    }
    
    throw error;
  }
}

// 運行部署腳本
main()
  .then((result) => {
    console.log("\n🎯 部署結果:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 部署失敗:", error);
    process.exit(1);
  });