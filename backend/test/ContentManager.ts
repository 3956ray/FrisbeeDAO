import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { parseEther, formatEther, keccak256, toBytes } from "viem";

describe("ContentManager", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  
  let contentManager: any;
  let athleteRegistry: any;
  let owner: any;
  let athlete1: any;
  let athlete2: any;
  let verifier: any;
  let user1: any;
  let user2: any;
  
  const registrationFee = parseEther("0.01");
  const platformFeePercentage = 250n; // 2.5%
  
  beforeEach(async function () {
    // 獲取測試賬戶
    const accounts = await viem.getWalletClients();
    owner = accounts[0];
    athlete1 = accounts[1];
    athlete2 = accounts[2];
    verifier = accounts[3];
    user1 = accounts[4];
    user2 = accounts[5];
    
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
    
    // 部署 ContentManager
    const contentImpl = await viem.deployContract("ContentManager");
    const contentInitData = viem.encodeFunctionData({
      abi: contentImpl.abi,
      functionName: "initialize",
      args: [owner.account.address, athleteRegistry.address, platformFeePercentage]
    });
    const contentProxy = await viem.deployContract("ERC1967ProxyWrapper", [
      contentImpl.address,
      contentInitData
    ]);
    contentManager = await viem.getContractAt("ContentManager", contentProxy.address);
    
    // 設置測試數據
    await athleteRegistry.write.addVerifier([verifier.account.address, "Test Verifier"], {
      account: owner.account
    });
    
    const athleteInfo1 = {
      name: "Test Athlete 1",
      sport: "Football",
      country: "USA",
      bio: "Test bio 1",
      socialLinks: ["https://twitter.com/test1"]
    };
    
    const athleteInfo2 = {
      name: "Test Athlete 2",
      sport: "Basketball",
      country: "Canada",
      bio: "Test bio 2",
      socialLinks: ["https://twitter.com/test2"]
    };
    
    // 註冊並驗證運動員
    await athleteRegistry.write.registerAthlete([athleteInfo1], {
      account: athlete1.account,
      value: registrationFee
    });
    
    await athleteRegistry.write.registerAthlete([athleteInfo2], {
      account: athlete2.account,
      value: registrationFee
    });
    
    await athleteRegistry.write.verifyAthlete([athlete1.account.address], {
      account: verifier.account
    });
    
    await athleteRegistry.write.verifyAthlete([athlete2.account.address], {
      account: verifier.account
    });
  });
  
  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const contractOwner = await contentManager.read.owner();
      const athleteRegistryAddr = await contentManager.read.athleteRegistry();
      const platformFee = await contentManager.read.platformFeePercentage();
      
      assert.equal(contractOwner.toLowerCase(), owner.account.address.toLowerCase());
      assert.equal(athleteRegistryAddr.toLowerCase(), athleteRegistry.address.toLowerCase());
      assert.equal(platformFee, platformFeePercentage);
    });
  });
  
  describe("Content Creation", function () {
    const contentData = {
      title: "Training Video",
      description: "Professional football training session",
      contentType: 1n, // VIDEO
      price: parseEther("0.05"),
      metadataHash: keccak256(toBytes("metadata_hash")),
      previewUrl: "https://example.com/preview.jpg",
      tags: ["training", "football", "professional"]
    };
    
    it("Should allow verified athlete to create content", async function () {
      await viem.assertions.emitWithArgs(
        contentManager.write.createContent([contentData], {
          account: athlete1.account
        }),
        contentManager,
        "ContentCreated",
        [1n, athlete1.account.address, contentData.title, contentData.price]
      );
      
      const content = await contentManager.read.getContent([1n]);
      assert.equal(content[0], athlete1.account.address); // creator
      assert.equal(content[1], contentData.title);
      assert.equal(content[2], contentData.description);
      assert.equal(content[3], contentData.contentType);
      assert.equal(content[4], contentData.price);
      assert.equal(content[5], true); // isActive
    });
    
    it("Should not allow unverified user to create content", async function () {
      try {
        await contentManager.write.createContent([contentData], {
          account: user1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not a verified athlete"));
      }
    });
    
    it("Should increment content ID correctly", async function () {
      // 創建第一個內容
      await contentManager.write.createContent([contentData], {
        account: athlete1.account
      });
      
      // 創建第二個內容
      const contentData2 = {
        ...contentData,
        title: "Training Video 2"
      };
      
      await viem.assertions.emitWithArgs(
        contentManager.write.createContent([contentData2], {
          account: athlete2.account
        }),
        contentManager,
        "ContentCreated",
        [2n, athlete2.account.address, contentData2.title, contentData2.price]
      );
      
      const nextContentId = await contentManager.read.nextContentId();
      assert.equal(nextContentId, 3n);
    });
    
    it("Should store content metadata correctly", async function () {
      await contentManager.write.createContent([contentData], {
        account: athlete1.account
      });
      
      const metadata = await contentManager.read.getContentMetadata([1n]);
      assert.equal(metadata[0], contentData.metadataHash);
      assert.equal(metadata[1], contentData.previewUrl);
      assert.equal(metadata[2].length, contentData.tags.length);
      
      for (let i = 0; i < contentData.tags.length; i++) {
        assert.equal(metadata[2][i], contentData.tags[i]);
      }
    });
  });
  
  describe("Content Purchase", function () {
    let contentId: bigint;
    const contentPrice = parseEther("0.05");
    
    beforeEach(async function () {
      const contentData = {
        title: "Training Video",
        description: "Professional football training session",
        contentType: 1n, // VIDEO
        price: contentPrice,
        metadataHash: keccak256(toBytes("metadata_hash")),
        previewUrl: "https://example.com/preview.jpg",
        tags: ["training", "football"]
      };
      
      await contentManager.write.createContent([contentData], {
        account: athlete1.account
      });
      
      contentId = 1n;
    });
    
    it("Should allow users to purchase content", async function () {
      const platformFee = (contentPrice * platformFeePercentage) / 10000n;
      const creatorRevenue = contentPrice - platformFee;
      
      await viem.assertions.emitWithArgs(
        contentManager.write.purchaseContent([contentId], {
          account: user1.account,
          value: contentPrice
        }),
        contentManager,
        "ContentPurchased",
        [contentId, user1.account.address, contentPrice]
      );
      
      // 檢查用戶是否有訪問權限
      const hasAccess = await contentManager.read.hasAccess([user1.account.address, contentId]);
      assert.equal(hasAccess, true);
      
      // 檢查購買記錄
      const purchaseInfo = await contentManager.read.getPurchaseInfo([user1.account.address, contentId]);
      assert.equal(purchaseInfo[0], contentPrice);
      assert(purchaseInfo[1] > 0n); // purchaseTime should be > 0
    });
    
    it("Should distribute revenue correctly", async function () {
      const platformFee = (contentPrice * platformFeePercentage) / 10000n;
      const creatorRevenue = contentPrice - platformFee;
      
      const creatorBalanceBefore = await publicClient.getBalance({
        address: athlete1.account.address
      });
      
      const contractBalanceBefore = await publicClient.getBalance({
        address: contentManager.address
      });
      
      await contentManager.write.purchaseContent([contentId], {
        account: user1.account,
        value: contentPrice
      });
      
      const creatorBalanceAfter = await publicClient.getBalance({
        address: athlete1.account.address
      });
      
      const contractBalanceAfter = await publicClient.getBalance({
        address: contentManager.address
      });
      
      // 創作者應該收到扣除平台費用後的收入
      assert.equal(creatorBalanceAfter - creatorBalanceBefore, creatorRevenue);
      
      // 合約應該保留平台費用
      assert.equal(contractBalanceAfter - contractBalanceBefore, platformFee);
    });
    
    it("Should not allow purchase with insufficient payment", async function () {
      const insufficientPayment = parseEther("0.01");
      
      try {
        await contentManager.write.purchaseContent([contentId], {
          account: user1.account,
          value: insufficientPayment
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Insufficient payment"));
      }
    });
    
    it("Should not allow purchase of inactive content", async function () {
      // 停用內容
      await contentManager.write.deactivateContent([contentId], {
        account: athlete1.account
      });
      
      try {
        await contentManager.write.purchaseContent([contentId], {
          account: user1.account,
          value: contentPrice
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Content not active"));
      }
    });
    
    it("Should not allow duplicate purchases by same user", async function () {
      // 第一次購買
      await contentManager.write.purchaseContent([contentId], {
        account: user1.account,
        value: contentPrice
      });
      
      // 嘗試重複購買
      try {
        await contentManager.write.purchaseContent([contentId], {
          account: user1.account,
          value: contentPrice
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Already purchased"));
      }
    });
    
    it("Should allow creator to purchase their own content for free", async function () {
      await viem.assertions.emitWithArgs(
        contentManager.write.purchaseContent([contentId], {
          account: athlete1.account,
          value: 0n // 創作者不需要付費
        }),
        contentManager,
        "ContentPurchased",
        [contentId, athlete1.account.address, 0n]
      );
      
      const hasAccess = await contentManager.read.hasAccess([athlete1.account.address, contentId]);
      assert.equal(hasAccess, true);
    });
  });
  
  describe("Content Management", function () {
    let contentId: bigint;
    
    beforeEach(async function () {
      const contentData = {
        title: "Training Video",
        description: "Professional football training session",
        contentType: 1n,
        price: parseEther("0.05"),
        metadataHash: keccak256(toBytes("metadata_hash")),
        previewUrl: "https://example.com/preview.jpg",
        tags: ["training", "football"]
      };
      
      await contentManager.write.createContent([contentData], {
        account: athlete1.account
      });
      
      contentId = 1n;
    });
    
    it("Should allow creator to update content price", async function () {
      const newPrice = parseEther("0.08");
      
      await viem.assertions.emitWithArgs(
        contentManager.write.updateContentPrice([contentId, newPrice], {
          account: athlete1.account
        }),
        contentManager,
        "ContentPriceUpdated",
        [contentId, newPrice]
      );
      
      const content = await contentManager.read.getContent([contentId]);
      assert.equal(content[4], newPrice); // price
    });
    
    it("Should not allow non-creator to update content price", async function () {
      const newPrice = parseEther("0.08");
      
      try {
        await contentManager.write.updateContentPrice([contentId, newPrice], {
          account: user1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not the content creator"));
      }
    });
    
    it("Should allow creator to deactivate content", async function () {
      await viem.assertions.emitWithArgs(
        contentManager.write.deactivateContent([contentId], {
          account: athlete1.account
        }),
        contentManager,
        "ContentDeactivated",
        [contentId]
      );
      
      const content = await contentManager.read.getContent([contentId]);
      assert.equal(content[5], false); // isActive
    });
    
    it("Should allow creator to reactivate content", async function () {
      // 先停用
      await contentManager.write.deactivateContent([contentId], {
        account: athlete1.account
      });
      
      // 重新激活
      await viem.assertions.emitWithArgs(
        contentManager.write.reactivateContent([contentId], {
          account: athlete1.account
        }),
        contentManager,
        "ContentReactivated",
        [contentId]
      );
      
      const content = await contentManager.read.getContent([contentId]);
      assert.equal(content[5], true); // isActive
    });
  });
  
  describe("Batch Operations", function () {
    let contentIds: bigint[];
    const contentPrice = parseEther("0.03");
    
    beforeEach(async function () {
      contentIds = [];
      
      // 創建多個內容
      for (let i = 0; i < 3; i++) {
        const contentData = {
          title: `Training Video ${i + 1}`,
          description: `Training session ${i + 1}`,
          contentType: 1n,
          price: contentPrice,
          metadataHash: keccak256(toBytes(`metadata_hash_${i}`)),
          previewUrl: `https://example.com/preview${i}.jpg`,
          tags: [`training${i}`, "football"]
        };
        
        await contentManager.write.createContent([contentData], {
          account: athlete1.account
        });
        
        contentIds.push(BigInt(i + 1));
      }
    });
    
    it("Should allow batch purchase of multiple contents", async function () {
      const totalCost = contentPrice * BigInt(contentIds.length);
      
      await viem.assertions.emitWithArgs(
        contentManager.write.batchPurchaseContent([contentIds], {
          account: user1.account,
          value: totalCost
        }),
        contentManager,
        "BatchContentPurchased",
        [user1.account.address, contentIds.length]
      );
      
      // 檢查所有內容的訪問權限
      for (const contentId of contentIds) {
        const hasAccess = await contentManager.read.hasAccess([user1.account.address, contentId]);
        assert.equal(hasAccess, true);
      }
    });
    
    it("Should revert batch purchase if insufficient payment", async function () {
      const insufficientPayment = contentPrice * BigInt(contentIds.length - 1);
      
      try {
        await contentManager.write.batchPurchaseContent([contentIds], {
          account: user1.account,
          value: insufficientPayment
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Insufficient payment"));
      }
    });
    
    it("Should get user's purchased content list", async function () {
      // 購買部分內容
      const purchaseIds = contentIds.slice(0, 2);
      const totalCost = contentPrice * BigInt(purchaseIds.length);
      
      await contentManager.write.batchPurchaseContent([purchaseIds], {
        account: user1.account,
        value: totalCost
      });
      
      const userContent = await contentManager.read.getUserPurchasedContent([user1.account.address]);
      assert.equal(userContent.length, purchaseIds.length);
      
      for (const contentId of purchaseIds) {
        assert(userContent.includes(contentId));
      }
    });
  });
  
  describe("Content Discovery", function () {
    beforeEach(async function () {
      // 創建不同類型的內容
      const contentTypes = [1n, 2n, 3n]; // VIDEO, AUDIO, IMAGE
      const prices = [parseEther("0.05"), parseEther("0.03"), parseEther("0.02")];
      
      for (let i = 0; i < contentTypes.length; i++) {
        const contentData = {
          title: `Content ${i + 1}`,
          description: `Description ${i + 1}`,
          contentType: contentTypes[i],
          price: prices[i],
          metadataHash: keccak256(toBytes(`metadata_${i}`)),
          previewUrl: `https://example.com/preview${i}.jpg`,
          tags: [`tag${i}`, "common"]
        };
        
        await contentManager.write.createContent([contentData], {
          account: athlete1.account
        });
      }
    });
    
    it("Should get content by creator", async function () {
      const creatorContent = await contentManager.read.getContentByCreator([athlete1.account.address]);
      assert.equal(creatorContent.length, 3);
      
      // 檢查內容 ID 順序
      for (let i = 0; i < creatorContent.length; i++) {
        assert.equal(creatorContent[i], BigInt(i + 1));
      }
    });
    
    it("Should get content by type", async function () {
      const videoContent = await contentManager.read.getContentByType([1n]); // VIDEO
      assert.equal(videoContent.length, 1);
      assert.equal(videoContent[0], 1n);
      
      const audioContent = await contentManager.read.getContentByType([2n]); // AUDIO
      assert.equal(audioContent.length, 1);
      assert.equal(audioContent[0], 2n);
    });
    
    it("Should get content in price range", async function () {
      const minPrice = parseEther("0.02");
      const maxPrice = parseEther("0.04");
      
      const contentInRange = await contentManager.read.getContentByPriceRange([minPrice, maxPrice]);
      assert.equal(contentInRange.length, 2); // Content 2 and 3
      
      assert(contentInRange.includes(2n));
      assert(contentInRange.includes(3n));
    });
    
    it("Should get total content count", async function () {
      const totalCount = await contentManager.read.getTotalContentCount();
      assert.equal(totalCount, 3n);
      
      const activeCount = await contentManager.read.getActiveContentCount();
      assert.equal(activeCount, 3n);
      
      // 停用一個內容
      await contentManager.write.deactivateContent([1n], {
        account: athlete1.account
      });
      
      const activeCountAfter = await contentManager.read.getActiveContentCount();
      assert.equal(activeCountAfter, 2n);
    });
  });
  
  describe("Revenue Management", function () {
    let contentId: bigint;
    const contentPrice = parseEther("0.1");
    
    beforeEach(async function () {
      const contentData = {
        title: "Premium Training",
        description: "High-value training content",
        contentType: 1n,
        price: contentPrice,
        metadataHash: keccak256(toBytes("premium_metadata")),
        previewUrl: "https://example.com/premium.jpg",
        tags: ["premium", "training"]
      };
      
      await contentManager.write.createContent([contentData], {
        account: athlete1.account
      });
      
      contentId = 1n;
      
      // 模擬多次購買
      const buyers = [user1, user2];
      for (const buyer of buyers) {
        await contentManager.write.purchaseContent([contentId], {
          account: buyer.account,
          value: contentPrice
        });
      }
    });
    
    it("Should track creator revenue correctly", async function () {
      const revenue = await contentManager.read.getCreatorRevenue([athlete1.account.address]);
      
      const expectedRevenue = (contentPrice * 2n * (10000n - platformFeePercentage)) / 10000n;
      assert.equal(revenue, expectedRevenue);
    });
    
    it("Should track content statistics", async function () {
      const stats = await contentManager.read.getContentStats([contentId]);
      
      assert.equal(stats[0], 2n); // purchaseCount
      assert.equal(stats[1], contentPrice * 2n); // totalRevenue
    });
    
    it("Should allow owner to withdraw platform fees", async function () {
      const platformRevenue = (contentPrice * 2n * platformFeePercentage) / 10000n;
      
      const ownerBalanceBefore = await publicClient.getBalance({
        address: owner.account.address
      });
      
      await contentManager.write.withdrawPlatformFees({
        account: owner.account
      });
      
      const ownerBalanceAfter = await publicClient.getBalance({
        address: owner.account.address
      });
      
      // 檢查提取的金額（考慮 gas 費用）
      const balanceDiff = ownerBalanceAfter - ownerBalanceBefore;
      assert(balanceDiff > 0n);
      assert(balanceDiff <= platformRevenue); // 應該小於等於平台收入（因為 gas 費用）
    });
    
    it("Should not allow non-owner to withdraw platform fees", async function () {
      try {
        await contentManager.write.withdrawPlatformFees({
          account: user1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("OwnableUnauthorizedAccount"));
      }
    });
  });
  
  describe("Platform Fee Management", function () {
    it("Should allow owner to update platform fee percentage", async function () {
      const newFeePercentage = 300n; // 3%
      
      await contentManager.write.setPlatformFeePercentage([newFeePercentage], {
        account: owner.account
      });
      
      const feePercentage = await contentManager.read.platformFeePercentage();
      assert.equal(feePercentage, newFeePercentage);
    });
    
    it("Should not allow platform fee above maximum", async function () {
      const invalidFeePercentage = 1100n; // 11% (超過 10% 最大值)
      
      try {
        await contentManager.write.setPlatformFeePercentage([invalidFeePercentage], {
          account: owner.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Fee too high"));
      }
    });
    
    it("Should not allow non-owner to update platform fee", async function () {
      const newFeePercentage = 300n;
      
      try {
        await contentManager.write.setPlatformFeePercentage([newFeePercentage], {
          account: user1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("OwnableUnauthorizedAccount"));
      }
    });
  });
  
  describe("Access Control", function () {
    let contentId: bigint;
    
    beforeEach(async function () {
      const contentData = {
        title: "Access Test Content",
        description: "Content for access testing",
        contentType: 1n,
        price: parseEther("0.05"),
        metadataHash: keccak256(toBytes("access_test")),
        previewUrl: "https://example.com/access.jpg",
        tags: ["access", "test"]
      };
      
      await contentManager.write.createContent([contentData], {
        account: athlete1.account
      });
      
      contentId = 1n;
    });
    
    it("Should correctly check access permissions", async function () {
      // 用戶最初沒有訪問權限
      let hasAccess = await contentManager.read.hasAccess([user1.account.address, contentId]);
      assert.equal(hasAccess, false);
      
      // 購買後應該有訪問權限
      await contentManager.write.purchaseContent([contentId], {
        account: user1.account,
        value: parseEther("0.05")
      });
      
      hasAccess = await contentManager.read.hasAccess([user1.account.address, contentId]);
      assert.equal(hasAccess, true);
    });
    
    it("Should allow creator to grant free access", async function () {
      await viem.assertions.emitWithArgs(
        contentManager.write.grantAccess([user1.account.address, contentId], {
          account: athlete1.account
        }),
        contentManager,
        "AccessGranted",
        [contentId, user1.account.address]
      );
      
      const hasAccess = await contentManager.read.hasAccess([user1.account.address, contentId]);
      assert.equal(hasAccess, true);
      
      // 檢查購買信息（應該顯示免費獲得）
      const purchaseInfo = await contentManager.read.getPurchaseInfo([user1.account.address, contentId]);
      assert.equal(purchaseInfo[0], 0n); // price paid = 0
    });
    
    it("Should allow creator to revoke access", async function () {
      // 先授予訪問權限
      await contentManager.write.grantAccess([user1.account.address, contentId], {
        account: athlete1.account
      });
      
      // 撤銷訪問權限
      await viem.assertions.emitWithArgs(
        contentManager.write.revokeAccess([user1.account.address, contentId], {
          account: athlete1.account
        }),
        contentManager,
        "AccessRevoked",
        [contentId, user1.account.address]
      );
      
      const hasAccess = await contentManager.read.hasAccess([user1.account.address, contentId]);
      assert.equal(hasAccess, false);
    });
    
    it("Should not allow non-creator to grant or revoke access", async function () {
      try {
        await contentManager.write.grantAccess([user1.account.address, contentId], {
          account: user2.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not the content creator"));
      }
      
      try {
        await contentManager.write.revokeAccess([user1.account.address, contentId], {
          account: user2.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not the content creator"));
      }
    });
  });
});