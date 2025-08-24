import { network } from "hardhat";
import { encodeFunctionData, formatEther, parseEther } from "viem";

async function main() {
  console.log("🚀 开始部署 FrisbeDAO 合约到本地网络...");

  const connection = await network.connect({ network: "hardhat", chainType: "l1" });
  // 调试：打印连接对象的键，确认 viem 是否挂载
  console.log("connection keys:", Object.keys(connection as any));
  // @ts-ignore
  const viem = (connection as any).viem;
  console.log("viem present?", !!viem);
  if (!viem) {
    throw new Error("hardhat-viem 插件未生效：无法获取 viem 连接。请确认 hardhat.config.ts 已导入 @nomicfoundation/hardhat-toolbox-viem，并使用 Hardhat v3 运行。");
  }

  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const deployer = walletClient.account!.address as `0x${string}`;

  console.log(`📝 部署账户: ${deployer}`);
  const balance = await publicClient.getBalance({ address: deployer });
  console.log(`💰 账户余额: ${formatEther(balance)} ETH`);

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

  // 1) 部署实现合约
  console.log("\n🏃 部署 AthleteRegistry 实现...");
  const athleteImpl = await viem.deployContract("AthleteRegistry");
  console.log(`   实现地址: ${athleteImpl.address}`);

  console.log("🏭 部署 PersonalTokenFactory 实现...");
  const factoryImpl = await viem.deployContract("PersonalTokenFactory");
  console.log(`   实现地址: ${factoryImpl.address}`);

  console.log("🏆 部署 AchievementTracker 实现...");
  const trackerImpl = await viem.deployContract("AchievementTracker");
  console.log(`   实现地址: ${trackerImpl.address}`);

  // 2) 通过 ERC1967Proxy 部署代理并初始化
  console.log("\n🧩 通过 ERC1967Proxy 部署并初始化...");

  const athleteInitData = encodeFunctionData({
    abi: athleteImpl.abi,
    functionName: "initialize",
    args: [deployer, registrationFee],
  });
  const athleteProxy = await viem.deployContract("ERC1967Proxy", [athleteImpl.address, athleteInitData]);
  console.log(`✅ AthleteRegistry 代理部署成功: ${athleteProxy.address}`);

  const factoryInitData = encodeFunctionData({
    abi: factoryImpl.abi,
    functionName: "initialize",
    args: [deployer, athleteProxy.address, creationFee, platformFeePercentage],
  });
  const factoryProxy = await viem.deployContract("ERC1967Proxy", [factoryImpl.address, factoryInitData]);
  console.log(`✅ PersonalTokenFactory 代理部署成功: ${factoryProxy.address}`);

  const trackerInitData = encodeFunctionData({
    abi: trackerImpl.abi,
    functionName: "initialize",
    args: [deployer, athleteProxy.address, submissionFee, verificationReward],
  });
  const trackerProxy = await viem.deployContract("ERC1967Proxy", [trackerImpl.address, trackerInitData]);
  console.log(`✅ AchievementTracker 代理部署成功: ${trackerProxy.address}`);

  // 3) 配置权限：将 AchievementTracker 添加为 AthleteRegistry 验证者；将部署者设为初始验证者
  console.log("\n🔐 配置权限...");
  // 与代理交互时，使用实现 ABI + 代理地址
  await walletClient.writeContract({
    address: athleteProxy.address,
    abi: athleteImpl.abi,
    functionName: "addVerifier",
    args: [trackerProxy.address, "AchievementTracker Contract"],
    account: walletClient.account,
  });
  console.log("   ✅ AchievementTracker 已添加为 AthleteRegistry 验证者");

  await walletClient.writeContract({
    address: athleteProxy.address,
    abi: athleteImpl.abi,
    functionName: "addVerifier",
    args: [deployer, "FrisbeDAO Team"],
    account: walletClient.account,
  });
  await walletClient.writeContract({
    address: trackerProxy.address,
    abi: trackerImpl.abi,
    functionName: "addVerifier",
    args: [deployer, 5n, "General Sports"],
    account: walletClient.account,
  });
  console.log("   ✅ 部署者已配置为验证者");

  // 4) 读取状态验证
  console.log("\n🔍 验证部署状态...");
  const registrationFeeRead = await publicClient.readContract({
    address: athleteProxy.address,
    abi: athleteImpl.abi,
    functionName: "registrationFee",
  });
  const creationFeeRead = await publicClient.readContract({
    address: factoryProxy.address,
    abi: factoryImpl.abi,
    functionName: "creationFee",
  });
  const submissionFeeRead = await publicClient.readContract({
    address: trackerProxy.address,
    abi: trackerImpl.abi,
    functionName: "submissionFee",
  });

  console.log("\n📄 合约地址:");
  console.log(`   AthleteRegistry: ${athleteProxy.address}`);
  console.log(`   PersonalTokenFactory: ${factoryProxy.address}`);
  console.log(`   AchievementTracker: ${trackerProxy.address}`);

  console.log("\n📊 参数校验:");
  console.log(`   AthleteRegistry 注册费: ${formatEther(registrationFeeRead as bigint)} ETH`);
  console.log(`   PersonalTokenFactory 创建费: ${formatEther(creationFeeRead as bigint)} ETH`);
  console.log(`   AchievementTracker 提交费: ${formatEther(submissionFeeRead as bigint)} ETH`);

  console.log("\n✨ 本地部署完成!");
}

main().catch((err) => {
  console.error("❌ 部署失败:", err);
  process.exit(1);
});