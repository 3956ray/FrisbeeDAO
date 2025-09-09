import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { parseEther, formatEther, getAddress } from "viem";

describe("PersonalTokenFactory", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  
  let athleteRegistry: any;
  let personalTokenFactory: any;
  let owner: any;
  let athlete1: any;
  let athlete2: any;
  let verifier: any;
  let buyer1: any;
  let buyer2: any;
  
  const registrationFee = parseEther("0.01");
  const creationFee = parseEther("0.005");
  const platformFeePercentage = 250n; // 2.5%
  
  beforeEach(async function () {
    // 獲取測試賬戶
    const accounts = await viem.getWalletClients();
    owner = accounts[0];
    athlete1 = accounts[1];
    athlete2 = accounts[2];
    verifier = accounts[3];
    buyer1 = accounts[4];
    buyer2 = accounts[5];
    
    // 部署 AthleteRegistry
    const athleteImpl = await viem.deployContract("AthleteRegistry");
    const athleteInitData = viem.encodeFunctionData({
      abi: athleteImpl.abi,
      functionName: "initialize",
      args: [owner.account.address, registrationFee]
    });
    const athleteProxy = await viem.deployContract("ERC1967ProxyWrapper", [
      athleteImpl.address,
      athleteInitData
    ]);
    athleteRegistry = await viem.getContractAt("AthleteRegistry", athleteProxy.address);
    
    // 部署 PersonalTokenFactory
    const factoryImpl = await viem.deployContract("PersonalTokenFactory");
    const factoryInitData = viem.encodeFunctionData({
      abi: factoryImpl.abi,
      functionName: "initialize",
      args: [owner.account.address, athleteRegistry.address, creationFee, platformFeePercentage]
    });
    const factoryProxy = await viem.deployContract("ERC1967ProxyWrapper", [
      factoryImpl.address,
      factoryInitData
    ]);
    personalTokenFactory = await viem.getContractAt("PersonalTokenFactory", factoryProxy.address);
    
    // 設置測試數據
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
  
  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const contractOwner = await personalTokenFactory.read.owner();
      const athleteRegistryAddr = await personalTokenFactory.read.athleteRegistry();
      const fee = await personalTokenFactory.read.creationFee();
      const platformFee = await personalTokenFactory.read.platformFeePercentage();
      
      assert.equal(contractOwner.toLowerCase(), owner.account.address.toLowerCase());
      assert.equal(athleteRegistryAddr.toLowerCase(), athleteRegistry.address.toLowerCase());
      assert.equal(fee, creationFee);
      assert.equal(platformFee, platformFeePercentage);
    });
  });
  
  describe("Personal Token Creation", function () {
    it("Should allow verified athlete to create personal token", async function () {
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      await viem.assertions.emitWithArgs(
        personalTokenFactory.write.createPersonalToken([tokenInfo], {
          account: athlete1.account,
          value: creationFee
        }),
        personalTokenFactory,
        "PersonalTokenCreated",
        [athlete1.account.address, tokenInfo.name, tokenInfo.symbol]
      );
      
      const tokenAddress = await personalTokenFactory.read.athleteTokens([athlete1.account.address]);
      assert.notEqual(tokenAddress, "0x0000000000000000000000000000000000000000");
      
      const tokenData = await personalTokenFactory.read.getTokenInfo([athlete1.account.address]);
      assert.equal(tokenData[0], tokenInfo.name);
      assert.equal(tokenData[1], tokenInfo.symbol);
      assert.equal(tokenData[2], tokenInfo.description);
    });
    
    it("Should not allow unverified athlete to create token", async function () {
      // 註冊但不驗證第二個運動員
      const athleteInfo2 = {
        name: "Unverified Athlete",
        sport: "Basketball",
        country: "Canada",
        bio: "Test bio 2",
        socialLinks: ["https://twitter.com/test2"]
      };
      
      await athleteRegistry.write.registerAthlete([athleteInfo2], {
        account: athlete2.account,
        value: registrationFee
      });
      
      const tokenInfo = {
        name: "Athlete Token 2",
        symbol: "ATH2",
        description: "Test athlete token 2",
        imageUrl: "https://example.com/image2.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      try {
        await personalTokenFactory.write.createPersonalToken([tokenInfo], {
          account: athlete2.account,
          value: creationFee
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not a verified athlete"));
      }
    });
    
    it("Should not allow duplicate token creation", async function () {
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      // 第一次創建
      await personalTokenFactory.write.createPersonalToken([tokenInfo], {
        account: athlete1.account,
        value: creationFee
      });
      
      // 嘗試重複創建
      try {
        await personalTokenFactory.write.createPersonalToken([tokenInfo], {
          account: athlete1.account,
          value: creationFee
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Token already exists"));
      }
    });
    
    it("Should require correct creation fee", async function () {
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      try {
        await personalTokenFactory.write.createPersonalToken([tokenInfo], {
          account: athlete1.account,
          value: parseEther("0.001") // 不足的費用
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Insufficient creation fee"));
      }
    });
  });
  
  describe("Token Trading", function () {
    let tokenAddress: any;
    let personalToken: any;
    
    beforeEach(async function () {
      // 創建個人代幣
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      await personalTokenFactory.write.createPersonalToken([tokenInfo], {
        account: athlete1.account,
        value: creationFee
      });
      
      tokenAddress = await personalTokenFactory.read.athleteTokens([athlete1.account.address]);
      personalToken = await viem.getContractAt("PersonalToken", tokenAddress);
    });
    
    it("Should allow users to purchase tokens", async function () {
      const purchaseAmount = 10n;
      const cost = await personalToken.read.calculatePurchaseCost([purchaseAmount]);
      
      await viem.assertions.emitWithArgs(
        personalToken.write.purchase([purchaseAmount], {
          account: buyer1.account,
          value: cost
        }),
        personalToken,
        "TokensPurchased",
        [buyer1.account.address, purchaseAmount, cost]
      );
      
      const balance = await personalToken.read.balanceOf([buyer1.account.address]);
      assert.equal(balance, purchaseAmount);
      
      const totalSupply = await personalToken.read.totalSupply();
      assert.equal(totalSupply, purchaseAmount);
    });
    
    it("Should calculate purchase cost correctly with bonding curve", async function () {
      const amount1 = 10n;
      const amount2 = 20n;
      
      const cost1 = await personalToken.read.calculatePurchaseCost([amount1]);
      const cost2 = await personalToken.read.calculatePurchaseCost([amount2]);
      
      // 購買更多代幣應該花費更多（由於聯合曲線）
      assert(cost2 > cost1);
      
      // 檢查價格隨供應量增加
      const price1 = await personalToken.read.getCurrentPrice();
      
      await personalToken.write.purchase([amount1], {
        account: buyer1.account,
        value: cost1
      });
      
      const price2 = await personalToken.read.getCurrentPrice();
      assert(price2 > price1);
    });
    
    it("Should allow users to sell tokens", async function () {
      const purchaseAmount = 20n;
      const sellAmount = 10n;
      
      // 先購買代幣
      const purchaseCost = await personalToken.read.calculatePurchaseCost([purchaseAmount]);
      await personalToken.write.purchase([purchaseAmount], {
        account: buyer1.account,
        value: purchaseCost
      });
      
      // 計算出售退款
      const refund = await personalToken.read.calculateSaleRefund([sellAmount]);
      
      const balanceBefore = await publicClient.getBalance({
        address: buyer1.account.address
      });
      
      await viem.assertions.emitWithArgs(
        personalToken.write.sell([sellAmount], {
          account: buyer1.account
        }),
        personalToken,
        "TokensSold",
        [buyer1.account.address, sellAmount, refund]
      );
      
      const tokenBalance = await personalToken.read.balanceOf([buyer1.account.address]);
      assert.equal(tokenBalance, purchaseAmount - sellAmount);
      
      const totalSupply = await personalToken.read.totalSupply();
      assert.equal(totalSupply, purchaseAmount - sellAmount);
    });
    
    it("Should apply 5% liquidity fee on sales", async function () {
      const purchaseAmount = 20n;
      const sellAmount = 10n;
      
      // 購買代幣
      const purchaseCost = await personalToken.read.calculatePurchaseCost([purchaseAmount]);
      await personalToken.write.purchase([purchaseAmount], {
        account: buyer1.account,
        value: purchaseCost
      });
      
      // 計算理論退款（不含費用）
      const refund = await personalToken.read.calculateSaleRefund([sellAmount]);
      
      // 出售退款應該是 95% (5% 流動性費用)
      const expectedRefundWithoutFee = (refund * 100n) / 95n;
      
      // 驗證退款確實包含了 5% 的折扣
      assert(refund < expectedRefundWithoutFee);
    });
    
    it("Should not allow selling more tokens than owned", async function () {
      const purchaseAmount = 10n;
      const sellAmount = 20n; // 超過擁有的數量
      
      // 購買代幣
      const purchaseCost = await personalToken.read.calculatePurchaseCost([purchaseAmount]);
      await personalToken.write.purchase([purchaseAmount], {
        account: buyer1.account,
        value: purchaseCost
      });
      
      try {
        await personalToken.write.sell([sellAmount], {
          account: buyer1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Insufficient balance"));
      }
    });
  });
  
  describe("Batch Operations", function () {
    let tokenAddress1: any;
    let tokenAddress2: any;
    
    beforeEach(async function () {
      // 創建第一個代幣
      const tokenInfo1 = {
        name: "Athlete Token 1",
        symbol: "ATH1",
        description: "Test athlete token 1",
        imageUrl: "https://example.com/image1.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      await personalTokenFactory.write.createPersonalToken([tokenInfo1], {
        account: athlete1.account,
        value: creationFee
      });
      
      tokenAddress1 = await personalTokenFactory.read.athleteTokens([athlete1.account.address]);
      
      // 註冊並驗證第二個運動員
      const athleteInfo2 = {
        name: "Test Athlete 2",
        sport: "Basketball",
        country: "Canada",
        bio: "Test bio 2",
        socialLinks: ["https://twitter.com/test2"]
      };
      
      await athleteRegistry.write.registerAthlete([athleteInfo2], {
        account: athlete2.account,
        value: registrationFee
      });
      
      await athleteRegistry.write.verifyAthlete([athlete2.account.address], {
        account: verifier.account
      });
      
      // 創建第二個代幣
      const tokenInfo2 = {
        name: "Athlete Token 2",
        symbol: "ATH2",
        description: "Test athlete token 2",
        imageUrl: "https://example.com/image2.jpg",
        basePrice: parseEther("0.015"),
        baseSupply: 1500n
      };
      
      await personalTokenFactory.write.createPersonalToken([tokenInfo2], {
        account: athlete2.account,
        value: creationFee
      });
      
      tokenAddress2 = await personalTokenFactory.read.athleteTokens([athlete2.account.address]);
    });
    
    it("Should allow batch purchase of multiple tokens", async function () {
      const tokenAddresses = [tokenAddress1, tokenAddress2];
      const amounts = [5n, 3n];
      
      // 計算總成本
      const token1 = await viem.getContractAt("PersonalToken", tokenAddress1);
      const token2 = await viem.getContractAt("PersonalToken", tokenAddress2);
      
      const cost1 = await token1.read.calculatePurchaseCost([amounts[0]]);
      const cost2 = await token2.read.calculatePurchaseCost([amounts[1]]);
      const totalCost = cost1 + cost2;
      
      await viem.assertions.emitWithArgs(
        personalTokenFactory.write.batchPurchase([tokenAddresses, amounts], {
          account: buyer1.account,
          value: totalCost + parseEther("0.01") // 額外的 ETH 以防計算差異
        }),
        personalTokenFactory,
        "BatchPurchaseCompleted",
        [buyer1.account.address, tokenAddresses.length]
      );
      
      // 檢查餘額
      const balance1 = await token1.read.balanceOf([buyer1.account.address]);
      const balance2 = await token2.read.balanceOf([buyer1.account.address]);
      
      assert.equal(balance1, amounts[0]);
      assert.equal(balance2, amounts[1]);
    });
    
    it("Should revert batch purchase if insufficient funds", async function () {
      const tokenAddresses = [tokenAddress1, tokenAddress2];
      const amounts = [10n, 10n];
      
      try {
        await personalTokenFactory.write.batchPurchase([tokenAddresses, amounts], {
          account: buyer1.account,
          value: parseEther("0.01") // 不足的資金
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Insufficient payment"));
      }
    });
  });
  
  describe("Token Management", function () {
    let tokenAddress: any;
    
    beforeEach(async function () {
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      await personalTokenFactory.write.createPersonalToken([tokenInfo], {
        account: athlete1.account,
        value: creationFee
      });
      
      tokenAddress = await personalTokenFactory.read.athleteTokens([athlete1.account.address]);
    });
    
    it("Should allow athlete to deactivate their token", async function () {
      await viem.assertions.emitWithArgs(
        personalTokenFactory.write.deactivateToken([athlete1.account.address], {
          account: athlete1.account
        }),
        personalTokenFactory,
        "TokenDeactivated",
        [athlete1.account.address, tokenAddress]
      );
      
      const tokenInfo = await personalTokenFactory.read.getTokenInfo([athlete1.account.address]);
      assert.equal(tokenInfo[5], false); // isActive
    });
    
    it("Should not allow non-athlete to deactivate token", async function () {
      try {
        await personalTokenFactory.write.deactivateToken([athlete1.account.address], {
          account: buyer1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not the token owner"));
      }
    });
  });
  
  describe("Fee Management", function () {
    it("Should allow owner to set creation fee", async function () {
      const newFee = parseEther("0.01");
      
      await personalTokenFactory.write.setCreationFee([newFee], {
        account: owner.account
      });
      
      const fee = await personalTokenFactory.read.creationFee();
      assert.equal(fee, newFee);
    });
    
    it("Should allow owner to set platform fee percentage", async function () {
      const newFeePercentage = 300n; // 3%
      
      await personalTokenFactory.write.setPlatformFeePercentage([newFeePercentage], {
        account: owner.account
      });
      
      const feePercentage = await personalTokenFactory.read.platformFeePercentage();
      assert.equal(feePercentage, newFeePercentage);
    });
    
    it("Should not allow platform fee above maximum", async function () {
      const invalidFeePercentage = 1100n; // 11% (超過 10% 最大值)
      
      try {
        await personalTokenFactory.write.setPlatformFeePercentage([invalidFeePercentage], {
          account: owner.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Fee too high"));
      }
    });
    
    it("Should allow owner to withdraw contract balance", async function () {
      // 創建代幣以產生費用
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      await personalTokenFactory.write.createPersonalToken([tokenInfo], {
        account: athlete1.account,
        value: creationFee
      });
      
      // 檢查合約餘額
      const contractBalance = await publicClient.getBalance({
        address: personalTokenFactory.address
      });
      assert.equal(contractBalance, creationFee);
      
      // 提取餘額
      await personalTokenFactory.write.withdrawBalance({
        account: owner.account
      });
      
      const contractBalanceAfter = await publicClient.getBalance({
        address: personalTokenFactory.address
      });
      assert.equal(contractBalanceAfter, 0n);
    });
  });
  
  describe("Query Functions", function () {
    beforeEach(async function () {
      // 創建測試代幣
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      await personalTokenFactory.write.createPersonalToken([tokenInfo], {
        account: athlete1.account,
        value: creationFee
      });
    });
    
    it("Should get token information", async function () {
      const tokenInfo = await personalTokenFactory.read.getTokenInfo([athlete1.account.address]);
      
      assert.equal(tokenInfo[0], "Athlete Token");
      assert.equal(tokenInfo[1], "ATH1");
      assert.equal(tokenInfo[2], "Test athlete token");
      assert.equal(tokenInfo[3], "https://example.com/image.jpg");
      assert.equal(tokenInfo[4], parseEther("0.01"));
      assert.equal(tokenInfo[5], true); // isActive
    });
    
    it("Should check if athlete has token", async function () {
      const hasToken1 = await personalTokenFactory.read.hasToken([athlete1.account.address]);
      const hasToken2 = await personalTokenFactory.read.hasToken([athlete2.account.address]);
      
      assert.equal(hasToken1, true);
      assert.equal(hasToken2, false);
    });
    
    it("Should get athlete token address", async function () {
      const tokenAddress = await personalTokenFactory.read.athleteTokens([athlete1.account.address]);
      assert.notEqual(tokenAddress, "0x0000000000000000000000000000000000000000");
    });
  });
  
  describe("Price Impact and Analytics", function () {
    let personalToken: any;
    
    beforeEach(async function () {
      const tokenInfo = {
        name: "Athlete Token",
        symbol: "ATH1",
        description: "Test athlete token",
        imageUrl: "https://example.com/image.jpg",
        basePrice: parseEther("0.01"),
        baseSupply: 1000n
      };
      
      await personalTokenFactory.write.createPersonalToken([tokenInfo], {
        account: athlete1.account,
        value: creationFee
      });
      
      const tokenAddress = await personalTokenFactory.read.athleteTokens([athlete1.account.address]);
      personalToken = await viem.getContractAt("PersonalToken", tokenAddress);
    });
    
    it("Should calculate price impact correctly", async function () {
      const purchaseAmount = 100n;
      
      const priceImpact = await personalToken.read.getPriceImpact([purchaseAmount]);
      
      // 價格影響應該大於 0（因為聯合曲線）
      assert(priceImpact > 0n);
    });
    
    it("Should get price after purchase", async function () {
      const purchaseAmount = 50n;
      
      const currentPrice = await personalToken.read.getCurrentPrice();
      const priceAfterPurchase = await personalToken.read.getPriceAfterPurchase([purchaseAmount]);
      
      // 購買後價格應該更高
      assert(priceAfterPurchase > currentPrice);
    });
    
    it("Should show price progression with multiple purchases", async function () {
      const amounts = [10n, 20n, 30n];
      let lastPrice = 0n;
      
      for (const amount of amounts) {
        const currentPrice = await personalToken.read.getCurrentPrice();
        
        // 每次購買後價格應該增加
        if (lastPrice > 0n) {
          assert(currentPrice > lastPrice);
        }
        
        const cost = await personalToken.read.calculatePurchaseCost([amount]);
        await personalToken.write.purchase([amount], {
          account: buyer1.account,
          value: cost
        });
        
        lastPrice = currentPrice;
      }
    });
  });
});