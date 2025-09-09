import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 提取合約ABI文件的腳本
 * 將所有合約的ABI整理到一個統一的目錄中
 */

async function extractABIs() {
    console.log('開始提取合約ABI文件...');
    
    // 創建ABI輸出目錄
    const abiDir = path.join(__dirname, '../abis');
    if (!fs.existsSync(abiDir)) {
        fs.mkdirSync(abiDir, { recursive: true });
    }
    
    // 定義需要提取的合約
    const contracts = [
        {
            name: 'AthleteRegistry',
            path: 'contracts/AthleteRegistry.sol/AthleteRegistry.json'
        },
        {
            name: 'PersonalTokenFactory',
            path: 'contracts/PersonalTokenFactory.sol/PersonalTokenFactory.json'
        },
        {
            name: 'PersonalToken',
            path: 'contracts/PersonalTokenFactory.sol/PersonalToken.json'
        },
        {
            name: 'PriceOracle',
            path: 'contracts/PriceOracle.sol/PriceOracle.json'
        },
        {
            name: 'ContentManager',
            path: 'contracts/ContentManager.sol/ContentManager.json'
        },
        {
            name: 'AchievementTracker',
            path: 'contracts/AchievementTracker.sol/AchievementTracker.json'
        }
    ];
    
    const extractedABIs = {};
    
    for (const contract of contracts) {
        try {
            const artifactPath = path.join(__dirname, '../artifacts', contract.path);
            
            if (fs.existsSync(artifactPath)) {
                const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
                
                // 提取ABI
                const abi = artifact.abi;
                
                // 保存單獨的ABI文件
                const abiFilePath = path.join(abiDir, `${contract.name}.json`);
                fs.writeFileSync(abiFilePath, JSON.stringify(abi, null, 2));
                
                // 添加到統一對象中
                extractedABIs[contract.name] = {
                    abi: abi,
                    bytecode: artifact.bytecode,
                    contractName: artifact.contractName,
                    sourceName: artifact.sourceName
                };
                
                console.log(`✅ 已提取 ${contract.name} ABI`);
            } else {
                console.log(`⚠️  找不到 ${contract.name} 的artifact文件: ${artifactPath}`);
            }
        } catch (error) {
            console.error(`❌ 提取 ${contract.name} ABI時出錯:`, error.message);
        }
    }
    
    // 保存統一的ABI文件
    const allABIsPath = path.join(abiDir, 'all-contracts.json');
    fs.writeFileSync(allABIsPath, JSON.stringify(extractedABIs, null, 2));
    
    // 生成TypeScript類型定義
    generateTypeDefinitions(extractedABIs, abiDir);
    
    console.log('\n📁 ABI文件已保存到:', abiDir);
    console.log('📄 統一ABI文件:', allABIsPath);
    console.log('\n✨ ABI提取完成!');
}

function generateTypeDefinitions(abis, outputDir) {
    let typeDefinitions = `// 自動生成的TypeScript類型定義\n// 生成時間: ${new Date().toISOString()}\n\n`;
    
    typeDefinitions += `export interface ContractABIs {\n`;
    
    for (const [contractName, contractData] of Object.entries(abis)) {
        typeDefinitions += `  ${contractName}: {\n`;
        typeDefinitions += `    abi: any[];\n`;
        typeDefinitions += `    bytecode: string;\n`;
        typeDefinitions += `    contractName: string;\n`;
        typeDefinitions += `    sourceName: string;\n`;
        typeDefinitions += `  };\n`;
    }
    
    typeDefinitions += `}\n\n`;
    
    typeDefinitions += `export const CONTRACT_NAMES = {\n`;
    for (const contractName of Object.keys(abis)) {
        typeDefinitions += `  ${contractName.toUpperCase()}: '${contractName}' as const,\n`;
    }
    typeDefinitions += `} as const;\n\n`;
    
    typeDefinitions += `export type ContractName = keyof ContractABIs;\n`;
    
    const typeDefPath = path.join(outputDir, 'types.ts');
    fs.writeFileSync(typeDefPath, typeDefinitions);
    
    console.log('📝 已生成TypeScript類型定義:', typeDefPath);
}

// 如果直接運行此腳本
if (import.meta.url === `file://${process.argv[1]}`) {
    extractABIs().catch(console.error);
}

export { extractABIs };