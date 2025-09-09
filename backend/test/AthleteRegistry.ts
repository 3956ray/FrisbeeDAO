import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { parseEther, formatEther, getAddress } from "viem";

describe("AthleteRegistry", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  
  let athleteRegistry: any;
  let owner: any;
  let athlete1: any;
  let athlete2: any;
  let verifier: any;
  let investor: any;
  
  const registrationFee = parseEther("0.01");
  
  beforeEach(async function () {
    // 獲取測試賬戶
    const accounts = await viem.getWalletClients();
    owner = accounts[0];
    athlete1 = accounts[1];
    athlete2 = accounts[2];
    verifier = accounts[3];
    investor = accounts[4];
    
    // 部署 AthleteRegistry 實現合約
    const implementation = await viem.deployContract("AthleteRegistry");
    
    // 準備初始化數據
    const initData = viem.encodeFunctionData({
      abi: implementation.abi,
      functionName: "initialize",
      args: [owner.account.address, registrationFee]
    });
    
    // 部署代理合約
    const proxy = await viem.deployContract("ERC1967ProxyWrapper", [
      implementation.address,
      initData
    ]);
    
    // 創建代理合約實例
    athleteRegistry = await viem.getContractAt("AthleteRegistry", proxy.address);
  });
  
  describe("Initialization", function () {
    it("Should initialize with correct owner and registration fee", async function () {
      const contractOwner = await athleteRegistry.read.owner();
      const fee = await athleteRegistry.read.registrationFee();
      
      assert.equal(contractOwner.toLowerCase(), owner.account.address.toLowerCase());
      assert.equal(fee, registrationFee);
    });
    
    it("Should have correct initial level configurations", async function () {
      const levelConfig = await athleteRegistry.read.getLevelConfig([1n]);
      
      assert.equal(levelConfig[0], parseEther("0.1")); // requiredInvestment
      assert.equal(levelConfig[1], 500n); // discountPercentage (5%)
      assert.equal(levelConfig[2], "Bronze"); // levelName
      assert.equal(levelConfig[3], true); // isActive
    });
  });
  
  describe("Verifier Management", function () {
    it("Should allow owner to add verifier", async function () {
      await viem.assertions.emitWithArgs(
        athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
          account: owner.account
        }),
        athleteRegistry,
        "VerifierAdded",
        [verifier.account.address, "Test Verifier"]
      );
      
      const isVerifier = await athleteRegistry.read.verifiers([verifier.account.address]);
      assert.equal(isVerifier, true);
    });
    
    it("Should not allow non-owner to add verifier", async function () {
      try {
        await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
          account: athlete1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("OwnableUnauthorizedAccount"));
      }
    });
    
    it("Should allow owner to remove verifier", async function () {
      // 先添加驗證者
      await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
        account: owner.account
      });
      
      // 然後移除
      await viem.assertions.emitWithArgs(
        athleteRegistry.write.removeVerifier([verifier.account.address], {
          account: owner.account
        }),
        athleteRegistry,
        "VerifierRemoved",
        [verifier.account.address]
      );
      
      const isVerifier = await athleteRegistry.read.verifiers([verifier.account.address]);
      assert.equal(isVerifier, false);
    });
  });
  
  describe("Athlete Registration", function () {
    beforeEach(async function () {
      // 添加驗證者
      await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
        account: owner.account
      });
    });
    
    it("Should allow athlete registration with correct fee", async function () {
      const athleteInfo = {
        name: "Test Athlete",
        sport: "Football",
        country: "USA",
        bio: "Test bio",
        socialLinks: ["https://twitter.com/test"]
      };
      
      await viem.assertions.emitWithArgs(
        athleteRegistry.write.registerAthlete([athleteInfo], {
          account: athlete1.account,
          value: registrationFee
        }),
        athleteRegistry,
        "AthleteRegistered",
        [athlete1.account.address, athleteInfo.name, athleteInfo.sport]
      );
      
      const athlete = await athleteRegistry.read.athletes([athlete1.account.address]);
      assert.equal(athlete[0], athleteInfo.name);
      assert.equal(athlete[1], athleteInfo.sport);
      assert.equal(athlete[2], athleteInfo.country);
      assert.equal(athlete[6], 0n); // AthleteStatus.PENDING
    });
    
    it("Should reject registration with insufficient fee", async function () {
      const athleteInfo = {
        name: "Test Athlete",
        sport: "Football",
        country: "USA",
        bio: "Test bio",
        socialLinks: ["https://twitter.com/test"]
      };
      
      try {
        await athleteRegistry.write.registerAthlete([athleteInfo], {
          account: athlete1.account,
          value: parseEther("0.005") // 不足的費用
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Insufficient registration fee"));
      }
    });
    
    it("Should not allow duplicate registration", async function () {
      const athleteInfo = {
        name: "Test Athlete",
        sport: "Football",
        country: "USA",
        bio: "Test bio",
        socialLinks: ["https://twitter.com/test"]
      };
      
      // 第一次註冊
      await athleteRegistry.write.registerAthlete([athleteInfo], {
        account: athlete1.account,
        value: registrationFee
      });
      
      // 嘗試重複註冊
      try {
        await athleteRegistry.write.registerAthlete([athleteInfo], {
          account: athlete1.account,
          value: registrationFee
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Already registered"));
      }
    });
  });
  
  describe("Athlete Verification", function () {
    beforeEach(async function () {
      // 添加驗證者
      await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
        account: owner.account
      });
      
      // 註冊運動員
      const athleteInfo = {
        name: "Test Athlete",
        sport: "Football",
        country: "USA",
        bio: "Test bio",
        socialLinks: ["https://twitter.com/test"]
      };
      
      await athleteRegistry.write.registerAthlete([athleteInfo], {
        account: athlete1.account,
        value: registrationFee
      });
    });
    
    it("Should allow verifier to verify athlete", async function () {
      await viem.assertions.emitWithArgs(
        athleteRegistry.write.verifyAthlete([athlete1.account.address], {
          account: verifier.account
        }),
        athleteRegistry,
        "AthleteVerified",
        [athlete1.account.address, verifier.account.address]
      );
      
      const athlete = await athleteRegistry.read.athletes([athlete1.account.address]);
      assert.equal(athlete[6], 1n); // AthleteStatus.VERIFIED
    });
    
    it("Should not allow non-verifier to verify athlete", async function () {
      try {
        await athleteRegistry.write.verifyAthlete([athlete1.account.address], {
          account: athlete2.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not a verifier"));
      }
    });
  });
  
  describe("Level System", function () {
    beforeEach(async function () {
      // 添加驗證者並註冊運動員
      await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
        account: owner.account
      });
      
      const athleteInfo = {
        name: "Test Athlete",
        sport: "Football",
        country: "USA",
        bio: "Test bio",
        socialLinks: ["https://twitter.com/test"]
      };
      
      await athleteRegistry.write.registerAthlete([athleteInfo], {
        account: athlete1.account,
        value: registrationFee
      });
      
      await athleteRegistry.write.verifyAthlete([athlete1.account.address], {
        account: verifier.account
      });
    });
    
    it("Should record investment and update user level", async function () {
      const investmentAmount = parseEther("0.15"); // 足夠升到 Level 2
      
      await viem.assertions.emitWithArgs(
        athleteRegistry.write.recordInvestment([athlete1.account.address, investmentAmount], {
          account: owner.account
        }),
        athleteRegistry,
        "InvestmentRecorded",
        [athlete1.account.address, investmentAmount]
      );
      
      const userLevel = await athleteRegistry.read.getUserLevel([athlete1.account.address]);
      assert.equal(userLevel, 2n);
      
      const totalInvestment = await athleteRegistry.read.getAthleteTotalInvestment([athlete1.account.address]);
      assert.equal(totalInvestment, investmentAmount);
    });
    
    it("Should provide correct discount based on user level", async function () {
      // 記錄投資以升級到 Level 2
      const investmentAmount = parseEther("0.15");
      await athleteRegistry.write.recordInvestment([athlete1.account.address, investmentAmount], {
        account: owner.account
      });
      
      const discount = await athleteRegistry.read.getUserDiscount([athlete1.account.address]);
      assert.equal(discount, 750n); // Level 2 的 7.5% 折扣
    });
    
    it("Should allow owner to update level configuration", async function () {
      const newConfig = {
        requiredInvestment: parseEther("0.2"),
        discountPercentage: 600n, // 6%
        levelName: "Updated Bronze",
        isActive: true
      };
      
      await viem.assertions.emitWithArgs(
        athleteRegistry.write.updateLevelConfig([1n, newConfig], {
          account: owner.account
        }),
        athleteRegistry,
        "LevelConfigUpdated",
        [1n, newConfig.requiredInvestment, newConfig.discountPercentage]
      );
      
      const levelConfig = await athleteRegistry.read.getLevelConfig([1n]);
      assert.equal(levelConfig[0], newConfig.requiredInvestment);
      assert.equal(levelConfig[1], newConfig.discountPercentage);
      assert.equal(levelConfig[2], newConfig.levelName);
    });
    
    it("Should get all level configurations", async function () {
      const allConfigs = await athleteRegistry.read.getAllLevelConfigs();
      assert.equal(allConfigs.length, 10); // 應該有 10 個等級
      
      // 檢查第一個等級配置
      assert.equal(allConfigs[0][0], parseEther("0.1")); // requiredInvestment
      assert.equal(allConfigs[0][1], 500n); // discountPercentage
      assert.equal(allConfigs[0][2], "Bronze"); // levelName
    });
  });
  
  describe("Reputation System", function () {
    beforeEach(async function () {
      // 添加驗證者並註冊運動員
      await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
        account: owner.account
      });
      
      const athleteInfo = {
        name: "Test Athlete",
        sport: "Football",
        country: "USA",
        bio: "Test bio",
        socialLinks: ["https://twitter.com/test"]
      };
      
      await athleteRegistry.write.registerAthlete([athleteInfo], {
        account: athlete1.account,
        value: registrationFee
      });
      
      await athleteRegistry.write.verifyAthlete([athlete1.account.address], {
        account: verifier.account
      });
    });
    
    it("Should update athlete reputation score", async function () {
      const newScore = 85n;
      
      await viem.assertions.emitWithArgs(
        athleteRegistry.write.updateReputationScore([athlete1.account.address, newScore], {
          account: owner.account
        }),
        athleteRegistry,
        "ReputationUpdated",
        [athlete1.account.address, newScore]
      );
      
      const athlete = await athleteRegistry.read.athletes([athlete1.account.address]);
      assert.equal(athlete[4], newScore); // reputationScore
    });
    
    it("Should not allow reputation score above 100", async function () {
      try {
        await athleteRegistry.write.updateReputationScore([athlete1.account.address, 150n], {
          account: owner.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Invalid reputation score"));
      }
    });
  });
  
  describe("Fee Management", function () {
    it("Should allow owner to set registration fee", async function () {
      const newFee = parseEther("0.02");
      
      await athleteRegistry.write.setRegistrationFee([newFee], {
        account: owner.account
      });
      
      const fee = await athleteRegistry.read.registrationFee();
      assert.equal(fee, newFee);
    });
    
    it("Should allow owner to withdraw contract balance", async function () {
      // 先註冊一個運動員以產生費用
      await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
        account: owner.account
      });
      
      const athleteInfo = {
        name: "Test Athlete",
        sport: "Football",
        country: "USA",
        bio: "Test bio",
        socialLinks: ["https://twitter.com/test"]
      };
      
      await athleteRegistry.write.registerAthlete([athleteInfo], {
        account: athlete1.account,
        value: registrationFee
      });
      
      // 檢查合約餘額
      const contractBalance = await publicClient.getBalance({
        address: athleteRegistry.address
      });
      assert.equal(contractBalance, registrationFee);
      
      // 提取餘額
      const ownerBalanceBefore = await publicClient.getBalance({
        address: owner.account.address
      });
      
      await athleteRegistry.write.withdrawBalance({
        account: owner.account
      });
      
      const contractBalanceAfter = await publicClient.getBalance({
        address: athleteRegistry.address
      });
      assert.equal(contractBalanceAfter, 0n);
    });
  });
  
  describe("Query Functions", function () {
    beforeEach(async function () {
      // 設置測試數據
      await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
        account: owner.account
      });
      
      const athleteInfo1 = {
        name: "Athlete 1",
        sport: "Football",
        country: "USA",
        bio: "Test bio 1",
        socialLinks: ["https://twitter.com/athlete1"]
      };
      
      const athleteInfo2 = {
        name: "Athlete 2",
        sport: "Basketball",
        country: "Canada",
        bio: "Test bio 2",
        socialLinks: ["https://twitter.com/athlete2"]
      };
      
      await athleteRegistry.write.registerAthlete([athleteInfo1], {
        account: athlete1.account,
        value: registrationFee
      });
      
      await athleteRegistry.write.registerAthlete([athleteInfo2], {
        account: athlete2.account,
        value: registrationFee
      });
    });
    
    it("Should get athlete information", async function () {
      const athlete = await athleteRegistry.read.getAthleteInfo([athlete1.account.address]);
      assert.equal(athlete[0], "Athlete 1");
      assert.equal(athlete[1], "Football");
      assert.equal(athlete[2], "USA");
    });
    
    it("Should check if address is registered athlete", async function () {
      const isRegistered1 = await athleteRegistry.read.isRegisteredAthlete([athlete1.account.address]);
      const isRegistered2 = await athleteRegistry.read.isRegisteredAthlete([investor.account.address]);
      
      assert.equal(isRegistered1, true);
      assert.equal(isRegistered2, false);
    });
    
    it("Should get verifier list", async function () {
      const verifierList = await athleteRegistry.read.getVerifierList();
      assert.equal(verifierList.length, 1);
      assert.equal(verifierList[0].toLowerCase(), verifier.account.address.toLowerCase());
    });
  });
});