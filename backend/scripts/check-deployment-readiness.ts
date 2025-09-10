import { config } from "dotenv";
import { createPublicClient, http, formatEther } from "viem";
import { polygonZkEvmTestnet } from "viem/chains";

// 加載環境變量
config();

/**
 * 檢查部署準備情況
 */
async function checkDeploymentReadiness() {
  console.log("🔍 檢查 Polygon zkEVM Testnet 部署準備情況...");
  console.log("=".repeat(60));

  let allChecksPass = true;

  // 1. 檢查環境變量
  console.log("\n📋 環境變量檢查:");
  
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || privateKey === "your_private_key_here") {
    console.log("❌ PRIVATE_KEY 未設置或使用默認值");
    console.log("   請在 .env 文件中設置您的私鑰");
    allChecksPass = false;
  } else if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    console.log("❌ PRIVATE_KEY 格式不正確");
    console.log("   私鑰應以 0x 開頭，長度為 66 個字符");
    allChecksPass = false;
  } else {
    console.log("✅ PRIVATE_KEY 已設置且格式正確");
  }

  const rpcUrl = process.env.POLYGON_ZKEVM_TESTNET_RPC_URL;
  if (!rpcUrl) {
    console.log("❌ POLYGON_ZKEVM_TESTNET_RPC_URL 未設置");
    allChecksPass = false;
  } else {
    console.log("✅ POLYGON_ZKEVM_TESTNET_RPC_URL 已設置");
  }

  const apiKey = process.env.POLYGON_ZKEVM_API_KEY;
  if (!apiKey || apiKey === "your_polygon_zkevm_api_key") {
    console.log("⚠️  POLYGON_ZKEVM_API_KEY 未設置 (合約驗證將失敗)");
    console.log("   如需驗證合約，請在 testnet-zkevm.polygonscan.com 獲取 API 密鑰");
  } else {
    console.log("✅ POLYGON_ZKEVM_API_KEY 已設置");
  }

  // 2. 檢查網絡連接
  console.log("\n🌐 網絡連接檢查:");
  
  const rpcEndpoints = [
    rpcUrl || "https://rpc.public.zkevm-test.net",
    "https://rpc.polygon-zkevm.gateway.tenderly.co",
    "https://polygonzkevm-testnet.g.alchemy.com/v2/demo"
  ];
  
  let connected = false;
  
  for (const endpoint of rpcEndpoints) {
    try {
      console.log(`   嘗試連接: ${endpoint}`);
      const client = createPublicClient({
        chain: polygonZkEvmTestnet,
        transport: http(endpoint, { timeout: 10000 })
      });

      const blockNumber = await client.getBlockNumber();
      console.log(`✅ 成功連接到 Polygon zkEVM Testnet`);
      console.log(`   使用端點: ${endpoint}`);
      console.log(`   當前區塊高度: ${blockNumber}`);
      connected = true;
      break;
    } catch (error) {
      console.log(`   ❌ 連接失敗: ${endpoint}`);
    }
  }
  
  if (!connected) {
    console.log("❌ 無法連接到任何 Polygon zkEVM Testnet RPC 端點");
    console.log("   請檢查網絡連接或稍後重試");
    allChecksPass = false;
  }

  // 3. 檢查帳戶餘額
  if (privateKey && privateKey !== "your_private_key_here" && privateKey.startsWith("0x")) {
    console.log("\n💰 帳戶餘額檢查:");
    
    try {
      const client = createPublicClient({
        chain: polygonZkEvmTestnet,
        transport: http(rpcUrl || "https://rpc.public.zkevm-test.net")
      });

      // 從私鑰推導地址
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      const balance = await client.getBalance({ address: account.address });
      const balanceInEth = formatEther(balance);
      
      console.log(`📍 部署地址: ${account.address}`);
      console.log(`💎 當前餘額: ${balanceInEth} ETH`);
      
      const minBalance = 0.05; // 最小建議餘額
      if (parseFloat(balanceInEth) < minBalance) {
        console.log(`⚠️  餘額較低，建議至少 ${minBalance} ETH 用於部署`);
        console.log("   請訪問 https://faucet.polygon.technology/ 獲取測試代幣");
      } else {
        console.log("✅ 餘額充足，可以進行部署");
      }
    } catch (error) {
      console.log("❌ 無法檢查帳戶餘額");
      console.log(`   錯誤: ${error}`);
      allChecksPass = false;
    }
  }

  // 4. 檢查合約編譯狀態
  console.log("\n🔨 合約編譯檢查:");
  
  try {
    const fs = await import("fs");
    const path = await import("path");
    
    const artifactsDir = path.join(process.cwd(), "artifacts", "contracts");
    
    const requiredContracts = [
      "AthleteRegistry.sol/AthleteRegistry.json",
      "PersonalTokenFactory.sol/PersonalTokenFactory.json",
      "AchievementTracker.sol/AchievementTracker.json",
      "PriceOracle.sol/PriceOracle.json",
      "ContentManager.sol/ContentManager.json"
    ];
    
    let allContractsCompiled = true;
    
    for (const contract of requiredContracts) {
      const contractPath = path.join(artifactsDir, contract);
      if (fs.existsSync(contractPath)) {
        console.log(`✅ ${contract.split('/')[1].replace('.json', '')} 已編譯`);
      } else {
        console.log(`❌ ${contract.split('/')[1].replace('.json', '')} 未編譯`);
        allContractsCompiled = false;
      }
    }
    
    if (!allContractsCompiled) {
      console.log("   請運行 'npm run compile' 編譯合約");
      allChecksPass = false;
    }
  } catch (error) {
    console.log("❌ 無法檢查合約編譯狀態");
    console.log(`   錯誤: ${error}`);
  }

  // 5. 總結
  console.log("\n" + "=".repeat(60));
  if (allChecksPass) {
    console.log("🎉 所有檢查通過！準備部署到 Polygon zkEVM Testnet");
    console.log("\n📝 下一步操作:");
    console.log("   1. 運行: npm run deploy:polygon-zkevm");
    console.log("   2. 等待部署完成");
    console.log("   3. 運行: npm run verify:polygon-zkevm (可選)");
  } else {
    console.log("❌ 部署準備未完成，請解決上述問題後重試");
    console.log("\n📚 有用資源:");
    console.log("   • 獲取測試代幣: https://faucet.polygon.technology/");
    console.log("   • 獲取 API 密鑰: https://testnet-zkevm.polygonscan.com/apis");
    console.log("   • 部署指南: ./POLYGON_ZKEVM_DEPLOYMENT.md");
  }
  
  console.log("\n🔗 有用鏈接:");
  console.log("   • 區塊鏈瀏覽器: https://testnet-zkevm.polygonscan.com");
  console.log("   • Bridge: https://bridge.polygon.technology/");
  console.log("   • 官方文檔: https://wiki.polygon.technology/docs/zkEVM/");
}

// 執行檢查
checkDeploymentReadiness()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("檢查過程中發生錯誤:", error);
    process.exit(1);
  });