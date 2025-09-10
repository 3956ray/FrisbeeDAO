const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

// 數據庫配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'frisbeedao',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(dbConfig);

/**
 * 生成安全的隨機API密鑰
 */
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成API密鑰哈希
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * 為用戶創建API密鑰
 */
async function createApiKey(userId, name, permissions = [], expiresInDays = null) {
  try {
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const result = await pool.query(
      `INSERT INTO api_keys (user_id, name, key_hash, permissions, expires_at) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, created_at`,
      [userId, name, keyHash, JSON.stringify(permissions), expiresAt]
    );

    return {
      id: result.rows[0].id,
      apiKey,
      name,
      permissions,
      expiresAt,
      createdAt: result.rows[0].created_at
    };
  } catch (error) {
    throw new Error(`創建API密鑰失敗: ${error.message}`);
  }
}

/**
 * 創建管理員用戶和API密鑰
 */
async function createAdminUser(walletAddress, username = 'admin') {
  try {
    // 檢查用戶是否已存在
    const existingUser = await pool.query(
      'SELECT id, role FROM users WHERE wallet_address = $1',
      [walletAddress]
    );

    let userId;
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      
      // 如果用戶已存在但不是管理員，更新為管理員
      if (existingUser.rows[0].role !== 'admin') {
        await pool.query(
          'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
          ['admin', userId]
        );
        console.log(`✅ 用戶 ${walletAddress} 已更新為管理員`);
      } else {
        console.log(`ℹ️  用戶 ${walletAddress} 已經是管理員`);
      }
    } else {
      // 創建新的管理員用戶
      const result = await pool.query(
        `INSERT INTO users (wallet_address, username, role) 
         VALUES ($1, $2, 'admin') 
         RETURNING id`,
        [walletAddress, username]
      );
      userId = result.rows[0].id;
      console.log(`✅ 創建管理員用戶: ${walletAddress}`);
    }

    return userId;
  } catch (error) {
    throw new Error(`創建管理員用戶失敗: ${error.message}`);
  }
}

/**
 * 列出用戶的API密鑰
 */
async function listApiKeys(userId = null) {
  try {
    let query = `
      SELECT 
        ak.id,
        ak.name,
        ak.permissions,
        ak.active,
        ak.last_used,
        ak.created_at,
        ak.expires_at,
        u.wallet_address,
        u.username,
        u.role
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
    `;
    
    let params = [];
    if (userId) {
      query += ' WHERE ak.user_id = $1';
      params = [userId];
    }
    
    query += ' ORDER BY ak.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    throw new Error(`獲取API密鑰列表失敗: ${error.message}`);
  }
}

/**
 * 撤銷API密鑰
 */
async function revokeApiKey(keyId) {
  try {
    const result = await pool.query(
      'UPDATE api_keys SET active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING name',
      [keyId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('API密鑰不存在');
    }
    
    return result.rows[0].name;
  } catch (error) {
    throw new Error(`撤銷API密鑰失敗: ${error.message}`);
  }
}

/**
 * 清理過期的API密鑰
 */
async function cleanupExpiredKeys() {
  try {
    const result = await pool.query(
      'UPDATE api_keys SET active = FALSE WHERE expires_at IS NOT NULL AND expires_at < NOW() AND active = TRUE'
    );
    
    console.log(`🧹 清理了 ${result.rowCount} 個過期的API密鑰`);
    return result.rowCount;
  } catch (error) {
    throw new Error(`清理過期API密鑰失敗: ${error.message}`);
  }
}

/**
 * 主函數
 */
async function main() {
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'create': {
        const walletAddress = process.argv[3];
        const name = process.argv[4] || 'Default API Key';
        const permissionsArg = process.argv[5];
        const expiresInDays = process.argv[6] ? parseInt(process.argv[6]) : null;
        
        if (!walletAddress) {
          console.error('❌ 請提供錢包地址');
          console.log('使用方法: node generate-api-key.js create <wallet_address> [name] [permissions] [expires_in_days]');
          process.exit(1);
        }
        
        // 解析權限
        let permissions = [];
        if (permissionsArg) {
          try {
            permissions = JSON.parse(permissionsArg);
          } catch {
            permissions = permissionsArg.split(',');
          }
        }
        
        // 獲取或創建用戶
        let user = await pool.query('SELECT id FROM users WHERE wallet_address = $1', [walletAddress]);
        let userId;
        
        if (user.rows.length === 0) {
          const result = await pool.query(
            'INSERT INTO users (wallet_address) VALUES ($1) RETURNING id',
            [walletAddress]
          );
          userId = result.rows[0].id;
          console.log(`✅ 創建新用戶: ${walletAddress}`);
        } else {
          userId = user.rows[0].id;
        }
        
        const apiKeyData = await createApiKey(userId, name, permissions, expiresInDays);
        
        console.log('🔑 API密鑰創建成功!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`ID: ${apiKeyData.id}`);
        console.log(`名稱: ${apiKeyData.name}`);
        console.log(`API密鑰: ${apiKeyData.apiKey}`);
        console.log(`權限: ${JSON.stringify(apiKeyData.permissions)}`);
        console.log(`過期時間: ${apiKeyData.expiresAt || '永不過期'}`);
        console.log(`創建時間: ${apiKeyData.createdAt}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  請妥善保存此API密鑰，它不會再次顯示!');
        break;
      }
      
      case 'admin': {
        const walletAddress = process.argv[3];
        const username = process.argv[4] || 'admin';
        
        if (!walletAddress) {
          console.error('❌ 請提供管理員錢包地址');
          console.log('使用方法: node generate-api-key.js admin <wallet_address> [username]');
          process.exit(1);
        }
        
        const userId = await createAdminUser(walletAddress, username);
        
        // 創建管理員API密鑰
        const adminPermissions = [
          'users:read', 'users:write', 'users:delete',
          'athletes:read', 'athletes:write', 'athletes:verify',
          'tokens:read', 'tokens:write', 'tokens:admin',
          'transactions:read', 'transactions:write',
          'social:read', 'social:write', 'social:verify',
          'market:read', 'market:write',
          'admin:all'
        ];
        
        const apiKeyData = await createApiKey(userId, 'Admin API Key', adminPermissions);
        
        console.log('👑 管理員API密鑰創建成功!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`管理員地址: ${walletAddress}`);
        console.log(`用戶名: ${username}`);
        console.log(`API密鑰: ${apiKeyData.apiKey}`);
        console.log(`權限: 全部管理員權限`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  請妥善保存此API密鑰，它不會再次顯示!');
        break;
      }
      
      case 'list': {
        const walletAddress = process.argv[3];
        let userId = null;
        
        if (walletAddress) {
          const user = await pool.query('SELECT id FROM users WHERE wallet_address = $1', [walletAddress]);
          if (user.rows.length === 0) {
            console.error('❌ 用戶不存在');
            process.exit(1);
          }
          userId = user.rows[0].id;
        }
        
        const apiKeys = await listApiKeys(userId);
        
        if (apiKeys.length === 0) {
          console.log('📭 沒有找到API密鑰');
        } else {
          console.log(`🔑 找到 ${apiKeys.length} 個API密鑰:`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          apiKeys.forEach(key => {
            console.log(`ID: ${key.id}`);
            console.log(`名稱: ${key.name}`);
            console.log(`用戶: ${key.username || key.wallet_address} (${key.role})`);
            console.log(`權限: ${JSON.stringify(JSON.parse(key.permissions))}`);
            console.log(`狀態: ${key.active ? '✅ 活躍' : '❌ 已禁用'}`);
            console.log(`最後使用: ${key.last_used || '從未使用'}`);
            console.log(`創建時間: ${key.created_at}`);
            console.log(`過期時間: ${key.expires_at || '永不過期'}`);
            console.log('─────────────────────────────────────────────────────────────────────');
          });
        }
        break;
      }
      
      case 'revoke': {
        const keyId = process.argv[3];
        
        if (!keyId) {
          console.error('❌ 請提供API密鑰ID');
          console.log('使用方法: node generate-api-key.js revoke <key_id>');
          process.exit(1);
        }
        
        const keyName = await revokeApiKey(parseInt(keyId));
        console.log(`✅ 已撤銷API密鑰: ${keyName}`);
        break;
      }
      
      case 'cleanup': {
        const count = await cleanupExpiredKeys();
        console.log(`✅ 清理完成，共處理 ${count} 個過期密鑰`);
        break;
      }
      
      default:
        console.log('FrisbeDAO API密鑰管理工具');
        console.log('');
        console.log('使用方法:');
        console.log('  node generate-api-key.js create <wallet_address> [name] [permissions] [expires_in_days]');
        console.log('  node generate-api-key.js admin <wallet_address> [username]');
        console.log('  node generate-api-key.js list [wallet_address]');
        console.log('  node generate-api-key.js revoke <key_id>');
        console.log('  node generate-api-key.js cleanup');
        console.log('');
        console.log('示例:');
        console.log('  # 創建普通API密鑰');
        console.log('  node generate-api-key.js create 0x1234... "My API Key" ["users:read","tokens:read"] 30');
        console.log('');
        console.log('  # 創建管理員');
        console.log('  node generate-api-key.js admin 0x1234... admin');
        console.log('');
        console.log('  # 列出所有API密鑰');
        console.log('  node generate-api-key.js list');
        console.log('');
        console.log('  # 撤銷API密鑰');
        console.log('  node generate-api-key.js revoke 1');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ 操作失敗:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 執行主函數
if (require.main === module) {
  main();
}

module.exports = {
  createApiKey,
  createAdminUser,
  listApiKeys,
  revokeApiKey,
  cleanupExpiredKeys,
  generateApiKey,
  hashApiKey
};