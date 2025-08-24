import hre from "hardhat";
import { parseEther, formatEther, createWalletClient, http, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, baseSepolia } from "viem/chains";

// 获取网络配置
function getNetworkConfig(networkName: string) {
  switch (networkName) {
    case "sepolia":
      return {
        chain: sepolia,
        rpcUrl: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      };
    case "baseSepolia":
      return {
        chain: baseSepolia,
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      };
    default:
      throw new Error(`不支持的网络: ${networkName}`);
  }
}

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "sepolia";
  console.log(`🚀 开始部署 FrisbeDAO 合约到 ${networkName} 测试网...`);
  
  // 检查私钥
  if (!process.env.PRIVATE_KEY) {
    throw new Error("请在 .env 文件中设置 PRIVATE_KEY");
  }
  
  const { chain, rpcUrl } = getNetworkConfig(networkName);
  
  // 创建账户和客户端
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
  
  console.log(`📝 部署账户: ${account.address}`);
  
  // 检查余额
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 账户余额: ${formatEther(balance)} ETH`);
  
  if (balance < parseEther("0.1")) {
    console.warn("⚠️ 警告: 账户余额较低，可能无法完成部署");
  }
  
  // 部署参数
  const registrationFee = parseEther("0.01"); // 0.01 ETH
  const creationFee = parseEther("0.005"); // 0.005 ETH
  const platformFeePercentage = 250n; // 2.5%
  const submissionFee = parseEther("0.001"); // 0.001 ETH
  const verificationReward = parseEther("0.0005"); // 0.0005 ETH
  
  console.log("\n📋 部署参数:");
  console.log(`   注册费用: ${formatEther(registrationFee)} ETH`);
  console.log(`   创建费用: ${formatEther(creationFee)} ETH`);
  console.log(`   平台手续费: ${platformFeePercentage / 100n}%`);
  console.log(`   提交费用: ${formatEther(submissionFee)} ETH`);
  console.log(`   验证奖励: ${formatEther(verificationReward)} ETH`);
  
  // 获取合约工厂
  const AthleteRegistry = await hre.artifacts.readArtifact("AthleteRegistry");
  const PersonalTokenFactory = await hre.artifacts.readArtifact("PersonalTokenFactory");
  const AchievementTracker = await hre.artifacts.readArtifact("AchievementTracker");
  
  // 1. 部署 AthleteRegistry
  console.log("\n🏃 部署 AthleteRegistry...");
  const athleteRegistryHash = await walletClient.deployContract({
    abi: AthleteRegistry.abi,
    bytecode: AthleteRegistry.bytecode as `0x${string}`,
  });
  
  const athleteRegistryReceipt = await publicClient.waitForTransactionReceipt({
    hash: athleteRegistryHash,
  });
  
  if (!athleteRegistryReceipt.contractAddress) {
    throw new Error("AthleteRegistry 部署失败");
  }
  
  console.log(`✅ AthleteRegistry 部署成功: ${athleteRegistryReceipt.contractAddress}`);
  
  // 2. 部署 PersonalTokenFactory
  console.log("\n🏭 部署 PersonalTokenFactory...");
  const personalTokenFactoryHash = await walletClient.deployContract({
    abi: PersonalTokenFactory.abi,
    bytecode: PersonalTokenFactory.bytecode as `0x${string}`,
  });
  
  const personalTokenFactoryReceipt = await publicClient.waitForTransactionReceipt({
    hash: personalTokenFactoryHash,
  });
  
  if (!personalTokenFactoryReceipt.contractAddress) {
    throw new Error("PersonalTokenFactory 部署失败");
  }
  
  console.log(`✅ PersonalTokenFactory 部署成功: ${personalTokenFactoryReceipt.contractAddress}`);
  
  // 3. 部署 AchievementTracker
  console.log("\n🏆 部署 AchievementTracker...");
  const achievementTrackerHash = await walletClient.deployContract({
    abi: AchievementTracker.abi,
    bytecode: AchievementTracker.bytecode as `0x${string}`,
  });
  
  const achievementTrackerReceipt = await publicClient.waitForTransactionReceipt({
    hash: achievementTrackerHash,
  });
  
  if (!achievementTrackerReceipt.contractAddress) {
    throw new Error("AchievementTracker 部署失败");
  }
  
  console.log(`✅ AchievementTracker 部署成功: ${achievementTrackerReceipt.contractAddress}`);
  
  console.log("\n🎉 基础合约部署完成!");
  console.log("\n📄 合约地址:");
  console.log(`   AthleteRegistry: ${athleteRegistryReceipt.contractAddress}`);
  console.log(`   PersonalTokenFactory: ${personalTokenFactoryReceipt.contractAddress}`);
  console.log(`   AchievementTracker: ${achievementTrackerReceipt.contractAddress}`);
  
  console.log("\n💡 提示: 合约已部署但尚未初始化，请手动调用初始化函数。");
  console.log("\n🔗 区块链浏览器链接:");
  
  if (networkName === "sepolia") {
    console.log(`   AthleteRegistry: https://sepolia.etherscan.io/address/${athleteRegistryReceipt.contractAddress}`);
    console.log(`   PersonalTokenFactory: https://sepolia.etherscan.io/address/${personalTokenFactoryReceipt.contractAddress}`);
    console.log(`   AchievementTracker: https://sepolia.etherscan.io/address/${achievementTrackerReceipt.contractAddress}`);
  } else if (networkName === "baseSepolia") {
    console.log(`   AthleteRegistry: https://sepolia.basescan.org/address/${athleteRegistryReceipt.contractAddress}`);
    console.log(`   PersonalTokenFactory: https://sepolia.basescan.org/address/${personalTokenFactoryReceipt.contractAddress}`);
    console.log(`   AchievementTracker: https://sepolia.basescan.org/address/${achievementTrackerReceipt.contractAddress}`);
  }
  
  return {
    network: networkName,
    athleteRegistry: athleteRegistryReceipt.contractAddress,
    personalTokenFactory: personalTokenFactoryReceipt.contractAddress,
    achievementTracker: achievementTrackerReceipt.contractAddress,
  };
}

// 运行部署脚本
main()
  .then((result) => {
    console.log("\n🎯 部署结果:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });