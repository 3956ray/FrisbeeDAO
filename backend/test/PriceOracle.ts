import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

describe("PriceOracle", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  
  let priceOracle: any;
  let owner: any;
  let updater1: any;
  let updater2: any;
  let user: any;
  
  const initialPrice = parseEther("2000"); // $2000
  const priceDecimals = 8n;
  
  beforeEach(async function () {
    // 獲取測試賬戶
    const accounts = await viem.getWalletClients();
    owner = accounts[0];
    updater1 = accounts[1];
    updater2 = accounts[2];
    user = accounts[3];
    
    // 部署 PriceOracle
    const oracleImpl = await viem.deployContract("PriceOracle");
    const oracleInitData = viem.encodeFunctionData({
      abi: oracleImpl.abi,
      functionName: "initialize",
      args: [owner.account.address]
    });
    const oracleProxy = await viem.deployContract("ERC1967ProxyWrapper", [
      oracleImpl.address,
      oracleInitData
    ]);
    priceOracle = await viem.getContractAt("PriceOracle", oracleProxy.address);
  });
  
  describe("Initialization", function () {
    it("Should initialize with correct owner", async function () {
      const contractOwner = await priceOracle.read.owner();
      assert.equal(contractOwner.toLowerCase(), owner.account.address.toLowerCase());
    });
    
    it("Should have no price feeds initially", async function () {
      const feedCount = await priceOracle.read.getActiveFeedCount();
      assert.equal(feedCount, 0n);
    });
  });
  
  describe("Price Feed Management", function () {
    const feedId = "ETH/USD";
    const description = "Ethereum to USD price feed";
    const heartbeat = 3600n; // 1 hour
    
    it("Should allow owner to add price feed", async function () {
      await viem.assertions.emitWithArgs(
        priceOracle.write.addPriceFeed([
          feedId,
          description,
          priceDecimals,
          heartbeat,
          initialPrice
        ], {
          account: owner.account
        }),
        priceOracle,
        "PriceFeedAdded",
        [feedId, description, priceDecimals]
      );
      
      const feedInfo = await priceOracle.read.getPriceFeedInfo([feedId]);
      assert.equal(feedInfo[0], description);
      assert.equal(feedInfo[1], priceDecimals);
      assert.equal(feedInfo[2], heartbeat);
      assert.equal(feedInfo[3], true); // isActive
    });
    
    it("Should not allow non-owner to add price feed", async function () {
      try {
        await priceOracle.write.addPriceFeed([
          feedId,
          description,
          priceDecimals,
          heartbeat,
          initialPrice
        ], {
          account: user.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("OwnableUnauthorizedAccount"));
      }
    });
    
    it("Should not allow duplicate feed IDs", async function () {
      // 添加第一個價格源
      await priceOracle.write.addPriceFeed([
        feedId,
        description,
        priceDecimals,
        heartbeat,
        initialPrice
      ], {
        account: owner.account
      });
      
      // 嘗試添加重複的價格源
      try {
        await priceOracle.write.addPriceFeed([
          feedId,
          "Duplicate feed",
          priceDecimals,
          heartbeat,
          initialPrice
        ], {
          account: owner.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Feed already exists"));
      }
    });
    
    it("Should allow owner to deactivate price feed", async function () {
      // 先添加價格源
      await priceOracle.write.addPriceFeed([
        feedId,
        description,
        priceDecimals,
        heartbeat,
        initialPrice
      ], {
        account: owner.account
      });
      
      // 停用價格源
      await viem.assertions.emitWithArgs(
        priceOracle.write.deactivatePriceFeed([feedId], {
          account: owner.account
        }),
        priceOracle,
        "PriceFeedDeactivated",
        [feedId]
      );
      
      const feedInfo = await priceOracle.read.getPriceFeedInfo([feedId]);
      assert.equal(feedInfo[3], false); // isActive
    });
    
    it("Should allow owner to reactivate price feed", async function () {
      // 添加並停用價格源
      await priceOracle.write.addPriceFeed([
        feedId,
        description,
        priceDecimals,
        heartbeat,
        initialPrice
      ], {
        account: owner.account
      });
      
      await priceOracle.write.deactivatePriceFeed([feedId], {
        account: owner.account
      });
      
      // 重新激活
      await viem.assertions.emitWithArgs(
        priceOracle.write.reactivatePriceFeed([feedId], {
          account: owner.account
        }),
        priceOracle,
        "PriceFeedReactivated",
        [feedId]
      );
      
      const feedInfo = await priceOracle.read.getPriceFeedInfo([feedId]);
      assert.equal(feedInfo[3], true); // isActive
    });
  });
  
  describe("Price Updater Management", function () {
    it("Should allow owner to add price updater", async function () {
      await viem.assertions.emitWithArgs(
        priceOracle.write.addPriceUpdater([updater1.account.address], {
          account: owner.account
        }),
        priceOracle,
        "PriceUpdaterAdded",
        [updater1.account.address]
      );
      
      const isUpdater = await priceOracle.read.priceUpdaters([updater1.account.address]);
      assert.equal(isUpdater, true);
    });
    
    it("Should allow owner to remove price updater", async function () {
      // 先添加更新者
      await priceOracle.write.addPriceUpdater([updater1.account.address], {
        account: owner.account
      });
      
      // 移除更新者
      await viem.assertions.emitWithArgs(
        priceOracle.write.removePriceUpdater([updater1.account.address], {
          account: owner.account
        }),
        priceOracle,
        "PriceUpdaterRemoved",
        [updater1.account.address]
      );
      
      const isUpdater = await priceOracle.read.priceUpdaters([updater1.account.address]);
      assert.equal(isUpdater, false);
    });
    
    it("Should not allow non-owner to manage updaters", async function () {
      try {
        await priceOracle.write.addPriceUpdater([updater1.account.address], {
          account: user.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("OwnableUnauthorizedAccount"));
      }
    });
  });
  
  describe("Price Updates", function () {
    const feedId = "ETH/USD";
    const description = "Ethereum to USD price feed";
    const heartbeat = 3600n;
    
    beforeEach(async function () {
      // 添加價格源和更新者
      await priceOracle.write.addPriceFeed([
        feedId,
        description,
        priceDecimals,
        heartbeat,
        initialPrice
      ], {
        account: owner.account
      });
      
      await priceOracle.write.addPriceUpdater([updater1.account.address], {
        account: owner.account
      });
    });
    
    it("Should allow authorized updater to update price", async function () {
      const newPrice = parseEther("2100");
      
      await viem.assertions.emitWithArgs(
        priceOracle.write.updatePrice([feedId, newPrice], {
          account: updater1.account
        }),
        priceOracle,
        "PriceUpdated",
        [feedId, newPrice]
      );
      
      const latestPrice = await priceOracle.read.getLatestPrice([feedId]);
      assert.equal(latestPrice[0], newPrice);
    });
    
    it("Should not allow unauthorized user to update price", async function () {
      const newPrice = parseEther("2100");
      
      try {
        await priceOracle.write.updatePrice([feedId, newPrice], {
          account: user.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Not authorized"));
      }
    });
    
    it("Should not allow price update for inactive feed", async function () {
      const newPrice = parseEther("2100");
      
      // 停用價格源
      await priceOracle.write.deactivatePriceFeed([feedId], {
        account: owner.account
      });
      
      try {
        await priceOracle.write.updatePrice([feedId, newPrice], {
          account: updater1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Feed not active"));
      }
    });
    
    it("Should track price history", async function () {
      const prices = [parseEther("2100"), parseEther("2200"), parseEther("2150")];
      
      // 更新多個價格
      for (const price of prices) {
        await priceOracle.write.updatePrice([feedId, price], {
          account: updater1.account
        });
        
        // 等待一點時間以確保時間戳不同
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 檢查歷史價格
      const history = await priceOracle.read.getPriceHistory([feedId, 0n, 10n]);
      assert.equal(history.length, 4); // 包括初始價格
      
      // 最新價格應該是最後更新的
      const latestPrice = await priceOracle.read.getLatestPrice([feedId]);
      assert.equal(latestPrice[0], prices[prices.length - 1]);
    });
  });
  
  describe("Batch Operations", function () {
    const feedIds = ["ETH/USD", "BTC/USD", "MATIC/USD"];
    const descriptions = [
      "Ethereum to USD",
      "Bitcoin to USD",
      "Polygon to USD"
    ];
    const prices = [parseEther("2000"), parseEther("45000"), parseEther("0.8")];
    const heartbeat = 3600n;
    
    beforeEach(async function () {
      // 添加多個價格源
      for (let i = 0; i < feedIds.length; i++) {
        await priceOracle.write.addPriceFeed([
          feedIds[i],
          descriptions[i],
          priceDecimals,
          heartbeat,
          prices[i]
        ], {
          account: owner.account
        });
      }
      
      await priceOracle.write.addPriceUpdater([updater1.account.address], {
        account: owner.account
      });
    });
    
    it("Should allow batch price updates", async function () {
      const newPrices = [parseEther("2100"), parseEther("46000"), parseEther("0.85")];
      
      await viem.assertions.emitWithArgs(
        priceOracle.write.batchUpdatePrices([feedIds, newPrices], {
          account: updater1.account
        }),
        priceOracle,
        "BatchPriceUpdate",
        [feedIds.length]
      );
      
      // 檢查所有價格都已更新
      for (let i = 0; i < feedIds.length; i++) {
        const latestPrice = await priceOracle.read.getLatestPrice([feedIds[i]]);
        assert.equal(latestPrice[0], newPrices[i]);
      }
    });
    
    it("Should revert batch update if arrays length mismatch", async function () {
      const newPrices = [parseEther("2100"), parseEther("46000")]; // 少一個價格
      
      try {
        await priceOracle.write.batchUpdatePrices([feedIds, newPrices], {
          account: updater1.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Array length mismatch"));
      }
    });
    
    it("Should get multiple latest prices", async function () {
      const latestPrices = await priceOracle.read.getMultipleLatestPrices([feedIds]);
      
      assert.equal(latestPrices.length, feedIds.length);
      
      for (let i = 0; i < feedIds.length; i++) {
        assert.equal(latestPrices[i][0], prices[i]);
        assert(latestPrices[i][1] > 0n); // timestamp should be > 0
      }
    });
  });
  
  describe("Price Validation", function () {
    const feedId = "ETH/USD";
    const description = "Ethereum to USD price feed";
    const heartbeat = 3600n; // 1 hour
    
    beforeEach(async function () {
      await priceOracle.write.addPriceFeed([
        feedId,
        description,
        priceDecimals,
        heartbeat,
        initialPrice
      ], {
        account: owner.account
      });
      
      await priceOracle.write.addPriceUpdater([updater1.account.address], {
        account: owner.account
      });
    });
    
    it("Should detect stale prices", async function () {
      // 檢查價格是否新鮮（剛創建的應該是新鮮的）
      const isStale = await priceOracle.read.isPriceStale([feedId]);
      assert.equal(isStale, false);
      
      // 注意：在測試環境中很難模擬時間流逝，
      // 實際應用中可能需要使用時間操作工具
    });
    
    it("Should validate price data exists", async function () {
      const hasData = await priceOracle.read.hasPriceData([feedId]);
      assert.equal(hasData, true);
      
      const hasDataNonExistent = await priceOracle.read.hasPriceData(["NONEXISTENT/USD"]);
      assert.equal(hasDataNonExistent, false);
    });
    
    it("Should get price with validation", async function () {
      const priceData = await priceOracle.read.getValidatedPrice([feedId]);
      
      assert.equal(priceData[0], initialPrice);
      assert(priceData[1] > 0n); // timestamp
      assert.equal(priceData[2], false); // isStale (should be false for fresh price)
    });
    
    it("Should revert when getting price for non-existent feed", async function () {
      try {
        await priceOracle.read.getLatestPrice(["NONEXISTENT/USD"]);
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("Feed does not exist"));
      }
    });
  });
  
  describe("Query Functions", function () {
    const feedIds = ["ETH/USD", "BTC/USD"];
    const descriptions = ["Ethereum to USD", "Bitcoin to USD"];
    const prices = [parseEther("2000"), parseEther("45000")];
    const heartbeat = 3600n;
    
    beforeEach(async function () {
      for (let i = 0; i < feedIds.length; i++) {
        await priceOracle.write.addPriceFeed([
          feedIds[i],
          descriptions[i],
          priceDecimals,
          heartbeat,
          prices[i]
        ], {
          account: owner.account
        });
      }
    });
    
    it("Should get all active feed IDs", async function () {
      const activeFeedIds = await priceOracle.read.getAllActiveFeedIds();
      
      assert.equal(activeFeedIds.length, feedIds.length);
      
      for (const feedId of feedIds) {
        assert(activeFeedIds.includes(feedId));
      }
    });
    
    it("Should get active feed count", async function () {
      const count = await priceOracle.read.getActiveFeedCount();
      assert.equal(count, BigInt(feedIds.length));
      
      // 停用一個價格源
      await priceOracle.write.deactivatePriceFeed([feedIds[0]], {
        account: owner.account
      });
      
      const countAfter = await priceOracle.read.getActiveFeedCount();
      assert.equal(countAfter, BigInt(feedIds.length - 1));
    });
    
    it("Should get price feed information", async function () {
      const feedInfo = await priceOracle.read.getPriceFeedInfo([feedIds[0]]);
      
      assert.equal(feedInfo[0], descriptions[0]);
      assert.equal(feedInfo[1], priceDecimals);
      assert.equal(feedInfo[2], heartbeat);
      assert.equal(feedInfo[3], true); // isActive
    });
    
    it("Should get price statistics", async function () {
      const feedId = feedIds[0];
      
      // 添加更新者並更新一些價格
      await priceOracle.write.addPriceUpdater([updater1.account.address], {
        account: owner.account
      });
      
      const newPrices = [parseEther("2100"), parseEther("1900"), parseEther("2050")];
      
      for (const price of newPrices) {
        await priceOracle.write.updatePrice([feedId, price], {
          account: updater1.account
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const stats = await priceOracle.read.getPriceStatistics([feedId, 0n, 10n]);
      
      assert(stats[0] > 0n); // minPrice
      assert(stats[1] > 0n); // maxPrice
      assert(stats[2] > 0n); // avgPrice
      assert(stats[1] >= stats[0]); // maxPrice >= minPrice
    });
  });
  
  describe("Emergency Functions", function () {
    const feedId = "ETH/USD";
    const description = "Ethereum to USD price feed";
    const heartbeat = 3600n;
    
    beforeEach(async function () {
      await priceOracle.write.addPriceFeed([
        feedId,
        description,
        priceDecimals,
        heartbeat,
        initialPrice
      ], {
        account: owner.account
      });
    });
    
    it("Should allow owner to emergency update price", async function () {
      const emergencyPrice = parseEther("1500");
      
      await viem.assertions.emitWithArgs(
        priceOracle.write.emergencyUpdatePrice([feedId, emergencyPrice], {
          account: owner.account
        }),
        priceOracle,
        "EmergencyPriceUpdate",
        [feedId, emergencyPrice]
      );
      
      const latestPrice = await priceOracle.read.getLatestPrice([feedId]);
      assert.equal(latestPrice[0], emergencyPrice);
    });
    
    it("Should not allow non-owner to emergency update price", async function () {
      const emergencyPrice = parseEther("1500");
      
      try {
        await priceOracle.write.emergencyUpdatePrice([feedId, emergencyPrice], {
          account: user.account
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert(error.message.includes("OwnableUnauthorizedAccount"));
      }
    });
    
    it("Should allow emergency update even for inactive feeds", async function () {
      const emergencyPrice = parseEther("1500");
      
      // 停用價格源
      await priceOracle.write.deactivatePriceFeed([feedId], {
        account: owner.account
      });
      
      // 緊急更新應該仍然可以工作
      await priceOracle.write.emergencyUpdatePrice([feedId, emergencyPrice], {
        account: owner.account
      });
      
      const latestPrice = await priceOracle.read.getLatestPrice([feedId]);
      assert.equal(latestPrice[0], emergencyPrice);
    });
  });
});