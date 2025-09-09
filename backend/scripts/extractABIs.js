import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 提取合約 ABI 並生成統一的 ABI 文件
 */
async function extractABIs() {
    const artifactsDir = path.join(__dirname, '../artifacts/contracts');
    const outputDir = path.join(__dirname, '../abis');
    
    // 確保輸出目錄存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const contracts = [
        'AthleteRegistry',
        'PersonalTokenFactory', 
        'PersonalToken',
        'AchievementTracker',
        'ContentManager',
        'PriceOracle'
    ];
    
    const abis = {};
    
    for (const contractName of contracts) {
        try {
            let artifactPath;
            
            // 處理不同的文件結構
            if (contractName === 'PersonalToken') {
                artifactPath = path.join(artifactsDir, 'PersonalTokenFactory.sol', `${contractName}.json`);
            } else {
                artifactPath = path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);
            }
            
            if (fs.existsSync(artifactPath)) {
                const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
                abis[contractName] = artifact.abi;
                
                // 單獨保存每個合約的 ABI
                fs.writeFileSync(
                    path.join(outputDir, `${contractName}.json`),
                    JSON.stringify(artifact.abi, null, 2)
                );
                
                console.log(`✅ 提取 ${contractName} ABI 成功`);
            } else {
                console.log(`⚠️  未找到 ${contractName} 的 artifact 文件: ${artifactPath}`);
            }
        } catch (error) {
            console.error(`❌ 提取 ${contractName} ABI 失敗:`, error.message);
        }
    }
    
    // 生成統一的 ABI 文件
    fs.writeFileSync(
        path.join(outputDir, 'index.json'),
        JSON.stringify(abis, null, 2)
    );
    
    // 生成 TypeScript 類型定義
    const tsContent = `// 自動生成的 ABI 類型定義
// 請勿手動修改此文件

export const ABIS = ${JSON.stringify(abis, null, 2)} as const;

export type ContractName = keyof typeof ABIS;

export default ABIS;
`;
    
    fs.writeFileSync(
        path.join(outputDir, 'index.ts'),
        tsContent
    );
    
    console.log('\n🎉 ABI 提取完成!');
    console.log(`📁 輸出目錄: ${outputDir}`);
    console.log(`📄 生成文件:`);
    console.log(`   - index.json (統一 ABI 文件)`);
    console.log(`   - index.ts (TypeScript 類型定義)`);
    contracts.forEach(name => {
        if (abis[name]) {
            console.log(`   - ${name}.json`);
        }
    });
}

// 如果直接運行此腳本
if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'))) {
    extractABIs().catch(console.error);
}

export { extractABIs };