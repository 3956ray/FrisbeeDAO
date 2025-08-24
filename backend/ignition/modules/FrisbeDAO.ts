import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const FrisbeDAOModule = buildModule("FrisbeDAO", (m) => {
  // 部署参数
  const owner = m.getAccount(0);
  const registrationFee = parseEther("0.01"); // 0.01 ETH
  const creationFee = parseEther("0.005"); // 0.005 ETH
  const platformFeePercentage = 250n; // 2.5%
  const submissionFee = parseEther("0.001"); // 0.001 ETH
  const verificationReward = parseEther("0.0005"); // 0.0005 ETH

  // 1. 部署 AthleteRegistry
  const athleteRegistry = m.contract("AthleteRegistry");
  
  // 2. 部署 PersonalTokenFactory
  const personalTokenFactory = m.contract("PersonalTokenFactory");
  
  // 3. 部署 AchievementTracker
  const achievementTracker = m.contract("AchievementTracker");

  // 4. 初始化合约
  m.call(athleteRegistry, "initialize", [owner, registrationFee]);
  
  m.call(personalTokenFactory, "initialize", [
    owner,
    athleteRegistry,
    creationFee,
    platformFeePercentage,
  ]);
  
  m.call(achievementTracker, "initialize", [
    owner,
    athleteRegistry,
    submissionFee,
    verificationReward,
  ]);

  // 5. 配置权限
  m.call(athleteRegistry, "addVerifier", [
    achievementTracker,
    "AchievementTracker Contract"
  ]);

  return {
    athleteRegistry,
    personalTokenFactory,
    achievementTracker,
  };
});

export default FrisbeDAOModule;