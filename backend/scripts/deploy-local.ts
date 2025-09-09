import hre from "hardhat";
import { ethers as Ethers } from "ethers";

async function main() {
  console.log("🚀 开始部署 FrisbeDAO 合约到本地网络 (ethers + JsonRpcProvider 路线)...");

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

  // 部署参数
  const registrationFee = Ethers.parseEther("0.01");
  const creationFee = Ethers.parseEther("0.005");
  const platformFeePercentage = 250n; // 2.5%
  const submissionFee = Ethers.parseEther("0.001");
  const verificationReward = Ethers.parseEther("0.0005");

  console.log("\n📋 部署参数:");
  console.log("   注册费用:", Ethers.formatEther(registrationFee), "ETH");
  console.log("   创建费用:", Ethers.formatEther(creationFee), "ETH");
  console.log("   平台手续费:", String(platformFeePercentage / 100n) + "%");
  console.log("   提交费用:", Ethers.formatEther(submissionFee), "ETH");
  console.log("   验证奖励:", Ethers.formatEther(verificationReward), "ETH");

  // 读取合约 Artifact
  const AthleteRegistryArtifact = await hre.artifacts.readArtifact("AthleteRegistry");
  const PersonalTokenFactoryArtifact = await hre.artifacts.readArtifact("PersonalTokenFactory");
  const AchievementTrackerArtifact = await hre.artifacts.readArtifact("AchievementTracker");
  const ERC1967ProxyArtifact = await hre.artifacts.readArtifact("ERC1967ProxyWrapper");

  // 部署 AthleteRegistry 实现
  console.log("\n🏃 部署 AthleteRegistry 实现...");
  const AthleteRegistryFactory = new Ethers.ContractFactory(
    AthleteRegistryArtifact.abi,
    AthleteRegistryArtifact.bytecode,
    signer
  );
  const athleteImpl = await AthleteRegistryFactory.deploy({ nonce: nextNonce() });
  await athleteImpl.waitForDeployment();
  const athleteImplAddr = await athleteImpl.getAddress();
  console.log("   实现地址:", athleteImplAddr);

  // 部署 PersonalTokenFactory 实现
  console.log("🏭 部署 PersonalTokenFactory 实现...");
  const PersonalTokenFactoryFactory = new Ethers.ContractFactory(
    PersonalTokenFactoryArtifact.abi,
    PersonalTokenFactoryArtifact.bytecode,
    signer
  );
  const factoryImpl = await PersonalTokenFactoryFactory.deploy({ nonce: nextNonce() });
  await factoryImpl.waitForDeployment();
  const factoryImplAddr = await factoryImpl.getAddress();
  console.log("   实现地址:", factoryImplAddr);

  // 部署 AchievementTracker 实现
  console.log("🏆 部署 AchievementTracker 实现...");
  const AchievementTrackerFactory = new Ethers.ContractFactory(
    AchievementTrackerArtifact.abi,
    AchievementTrackerArtifact.bytecode,
    signer
  );
  const trackerImpl = await AchievementTrackerFactory.deploy({ nonce: nextNonce() });
  await trackerImpl.waitForDeployment();
  const trackerImplAddr = await trackerImpl.getAddress();
  console.log("   实现地址:", trackerImplAddr);

  // 代理部署 + 初始化数据
  const athleteIface = new Ethers.Interface(AthleteRegistryArtifact.abi);
  const athleteInitData = athleteIface.encodeFunctionData("initialize", [deployer, registrationFee]);

  const ProxyFactory = new Ethers.ContractFactory(
    ERC1967ProxyArtifact.abi,
    ERC1967ProxyArtifact.bytecode,
    signer
  );

  const athleteProxy = await ProxyFactory.deploy(athleteImplAddr, athleteInitData, { nonce: nextNonce() });
  await athleteProxy.waitForDeployment();
  const athleteProxyAddr = await athleteProxy.getAddress();
  console.log(`✅ AthleteRegistry 代理部署成功: ${athleteProxyAddr}`);

  const factoryIface = new Ethers.Interface(PersonalTokenFactoryArtifact.abi);
  const factoryInitData = factoryIface.encodeFunctionData("initialize", [
    deployer,
    athleteProxyAddr,
    creationFee,
    platformFeePercentage,
  ]);
  const factoryProxy = await ProxyFactory.deploy(factoryImplAddr, factoryInitData, { nonce: nextNonce() });
  await factoryProxy.waitForDeployment();
  const factoryProxyAddr = await factoryProxy.getAddress();
  console.log(`✅ PersonalTokenFactory 代理部署成功: ${factoryProxyAddr}`);

  const trackerIface = new Ethers.Interface(AchievementTrackerArtifact.abi);
  const trackerInitData = trackerIface.encodeFunctionData("initialize", [
    deployer,
    athleteProxyAddr,
    submissionFee,
    verificationReward,
  ]);
  const trackerProxy = await ProxyFactory.deploy(trackerImplAddr, trackerInitData, { nonce: nextNonce() });
  await trackerProxy.waitForDeployment();
  const trackerProxyAddr = await trackerProxy.getAddress();
  console.log(`✅ AchievementTracker 代理部署成功: ${trackerProxyAddr}`);

  // 绑定实例进行交互
  const athlete = new Ethers.Contract(athleteProxyAddr, AthleteRegistryArtifact.abi, signer);
  const factory = new Ethers.Contract(factoryProxyAddr, PersonalTokenFactoryArtifact.abi, signer);
  const tracker = new Ethers.Contract(trackerProxyAddr, AchievementTrackerArtifact.abi, signer);

  // 配置权限（也带上 nonce）
  console.log("\n🔐 配置权限...");
  let tx = await athlete.addVerifier(trackerProxyAddr, "AchievementTracker Contract", { nonce: nextNonce() });
  await tx.wait();
  tx = await athlete.addVerifier(deployer, "FrisbeDAO Team", { nonce: nextNonce() });
  await tx.wait();
  tx = await tracker.addVerifier(deployer, 5n, "General Sports", { nonce: nextNonce() });
  await tx.wait();
  console.log("   ✅ 权限配置完成");

  // 读取状态验证
  console.log("\n🔍 验证部署状态...");
  const registrationFeeRead = await athlete.registrationFee();
  const creationFeeRead = await factory.creationFee();
  const submissionFeeRead = await tracker.submissionFee();

  console.log("\n📄 合约地址:");
  console.log(`   AthleteRegistry: ${athleteProxyAddr}`);
  console.log(`   PersonalTokenFactory: ${factoryProxyAddr}`);
  console.log(`   AchievementTracker: ${trackerProxyAddr}`);

  console.log("\n📊 参数校验:");
  console.log(`   AthleteRegistry 注册费: ${Ethers.formatEther(registrationFeeRead)} ETH`);
  console.log(`   PersonalTokenFactory 创建费: ${Ethers.formatEther(creationFeeRead)} ETH`);
  console.log(`   AchievementTracker 提交费: ${Ethers.formatEther(submissionFeeRead)} ETH`);

  console.log("\n✨ 本地部署完成!");
}

main().catch((err) => {
  console.error("❌ 部署失败:", err);
  process.exit(1);
});