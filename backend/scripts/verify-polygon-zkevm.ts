import hre from "hardhat";
import fs from "fs";
import path from "path";

// 從部署配置文件讀取合約地址和構造函數參數
function loadDeploymentConfig() {
  const configPath = path.join(__dirname, "..", "deployment-config-polygon-zkevm.json");
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`部署配置文件不存在: ${configPath}`);
  }
  
  const configContent = fs.readFileSync(configPath, "utf8");
  return JSON.parse(configContent);
}

async function verifyContract(contractName: string, address: string, constructorArgs: any[]) {
  try {
    console.log(`🔍 驗證合約 ${contractName} (${address})...`);
    
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
      network: "polygonZkEVMTestnet",
    });
    
    console.log(`✅ ${contractName} 驗證成功!`);
    return true;
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`ℹ️ ${contractName} 已經驗證過了`);
      return true;
    } else {
      console.error(`❌ ${contractName} 驗證失敗:`, error.message);
      return false;
    }
  }
}

async function main() {
  console.log("🔍 開始驗證 Polygon zkEVM Testnet 上的合約...");
  
  // 檢查 API 密鑰
  if (!process.env.POLYGON_ZKEVM_API_KEY) {
    console.warn("⚠️ 警告: 未設置 POLYGON_ZKEVM_API_KEY，驗證可能失敗");
    console.log("💡 提示: 請在 .env 文件中設置 POLYGON_ZKEVM_API_KEY");
    console.log("🔗 獲取 API 密鑰: https://testnet-zkevm.polygonscan.com/apis");
  }
  
  try {
    // 載入部署配置
    const config = loadDeploymentConfig();
    console.log(`📋 載入部署配置: ${config.network} (Chain ID: ${config.chainId})`);
    console.log(`📅 部署時間: ${config.timestamp}`);
    console.log(`👤 部署者: ${config.deployer}`);
    
    const contracts = config.contracts;
    const verificationResults: { [key: string]: boolean } = {};
    
    // 按順序驗證合約
    const contractsToVerify = [
      {
        name: "AthleteRegistry",
        address: contracts.athleteRegistry.address,
        args: contracts.athleteRegistry.constructorArgs,
      },
      {
        name: "PersonalTokenFactory",
        address: contracts.personalTokenFactory.address,
        args: contracts.personalTokenFactory.constructorArgs,
      },
      {
        name: "AchievementTracker",
        address: contracts.achievementTracker.address,
        args: contracts.achievementTracker.constructorArgs,
      },
      {
        name: "PriceOracle",
        address: contracts.priceOracle.address,
        args: contracts.priceOracle.constructorArgs,
      },
      {
        name: "ContentManager",
        address: contracts.contentManager.address,
        args: contracts.contentManager.constructorArgs,
      },
    ];
    
    console.log(`\n🎯 準備驗證 ${contractsToVerify.length} 個合約...\n`);
    
    for (const contract of contractsToVerify) {
      const success = await verifyContract(contract.name, contract.address, contract.args);
      verificationResults[contract.name] = success;
      
      // 在驗證之間添加延遲，避免 API 限制
      if (contractsToVerify.indexOf(contract) < contractsToVerify.length - 1) {
        console.log("⏳ 等待 3 秒後繼續...");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // 顯示驗證結果摘要
    console.log("\n📊 驗證結果摘要:");
    const successCount = Object.values(verificationResults).filter(Boolean).length;
    const totalCount = Object.keys(verificationResults).length;
    
    Object.entries(verificationResults).forEach(([name, success]) => {
      const status = success ? "✅ 成功" : "❌ 失敗";
      console.log(`   ${name}: ${status}`);
    });
    
    console.log(`\n🎉 驗證完成: ${successCount}/${totalCount} 個合約驗證成功`);
    
    if (successCount === totalCount) {
      console.log("\n🔗 所有合約已在區塊鏈瀏覽器上可見:");
      console.log("   https://testnet-zkevm.polygonscan.com");
      
      console.log("\n📋 合約地址 (已驗證):");
      contractsToVerify.forEach(contract => {
        console.log(`   ${contract.name}: https://testnet-zkevm.polygonscan.com/address/${contract.address}`);
      });
    } else {
      console.log("\n⚠️ 部分合約驗證失敗，請檢查:");
      console.log("1. POLYGON_ZKEVM_API_KEY 是否正確設置");
      console.log("2. 網絡連接是否正常");
      console.log("3. 構造函數參數是否正確");
      console.log("4. 合約是否已正確部署");
    }
    
    return verificationResults;
    
  } catch (error) {
    console.error("❌ 驗證過程中發生錯誤:", error);
    throw error;
  }
}

// 運行驗證腳本
main()
  .then((results) => {
    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    
    if (successCount === totalCount) {
      console.log("\n🎯 所有合約驗證成功!");
      process.exit(0);
    } else {
      console.log("\n⚠️ 部分合約驗證失敗");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("❌ 驗證失敗:", error);
    process.exit(1);
  });