const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
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

// 創建數據庫連接池
const pool = new Pool(dbConfig);

/**
 * 執行數據庫遷移
 */
async function migrate() {
  console.log('🚀 開始數據庫遷移...');
  
  try {
    // 測試數據庫連接
    const client = await pool.connect();
    console.log('✅ 數據庫連接成功');
    client.release();

    // 讀取初始化 SQL 文件
    const sqlPath = path.join(__dirname, '../../scripts/init-database.sql');
    
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL 文件不存在: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('📖 讀取 SQL 文件成功');

    // 執行 SQL
    console.log('⚡ 執行數據庫初始化...');
    await pool.query(sql);
    console.log('✅ 數據庫初始化完成');

    // 驗證表是否創建成功
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('📋 已創建的表:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // 驗證視圖是否創建成功
    const views = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    if (views.rows.length > 0) {
      console.log('👁️  已創建的視圖:');
      views.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }

    // 驗證函數是否創建成功
    const functions = await pool.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `);

    if (functions.rows.length > 0) {
      console.log('⚙️  已創建的函數:');
      functions.rows.forEach(row => {
        console.log(`  - ${row.routine_name}`);
      });
    }

    // 檢查系統配置
    const configCount = await pool.query('SELECT COUNT(*) as count FROM system_config');
    console.log(`🔧 系統配置項數量: ${configCount.rows[0].count}`);

    console.log('🎉 數據庫遷移完成!');

  } catch (error) {
    console.error('❌ 數據庫遷移失敗:', error.message);
    
    if (error.code) {
      console.error('錯誤代碼:', error.code);
    }
    
    if (error.detail) {
      console.error('錯誤詳情:', error.detail);
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * 回滾數據庫（刪除所有表）
 */
async function rollback() {
  console.log('🔄 開始數據庫回滾...');
  
  try {
    const client = await pool.connect();
    console.log('✅ 數據庫連接成功');
    client.release();

    // 獲取所有表
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    // 刪除所有表
    for (const table of tables.rows) {
      console.log(`🗑️  刪除表: ${table.table_name}`);
      await pool.query(`DROP TABLE IF EXISTS ${table.table_name} CASCADE`);
    }

    // 獲取所有視圖
    const views = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
    `);

    // 刪除所有視圖
    for (const view of views.rows) {
      console.log(`🗑️  刪除視圖: ${view.table_name}`);
      await pool.query(`DROP VIEW IF EXISTS ${view.table_name} CASCADE`);
    }

    // 獲取所有函數
    const functions = await pool.query(`
      SELECT routine_name, routine_schema
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_type = 'FUNCTION'
      AND routine_name NOT LIKE 'pg_%'
    `);

    // 刪除所有自定義函數
    for (const func of functions.rows) {
      console.log(`🗑️  刪除函數: ${func.routine_name}`);
      await pool.query(`DROP FUNCTION IF EXISTS ${func.routine_name} CASCADE`);
    }

    // 刪除擴展（如果需要）
    await pool.query('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE');
    await pool.query('DROP EXTENSION IF EXISTS "pgcrypto" CASCADE');

    console.log('✅ 數據庫回滾完成');

  } catch (error) {
    console.error('❌ 數據庫回滾失敗:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * 檢查數據庫狀態
 */
async function status() {
  console.log('📊 檢查數據庫狀態...');
  
  try {
    const client = await pool.connect();
    console.log('✅ 數據庫連接成功');
    client.release();

    // 檢查表數量
    const tableCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    console.log(`📋 表數量: ${tableCount.rows[0].count}`);

    // 檢查視圖數量
    const viewCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.views 
      WHERE table_schema = 'public'
    `);

    console.log(`👁️  視圖數量: ${viewCount.rows[0].count}`);

    // 檢查函數數量
    const functionCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_type = 'FUNCTION'
      AND routine_name NOT LIKE 'pg_%'
    `);

    console.log(`⚙️  函數數量: ${functionCount.rows[0].count}`);

    // 檢查數據量
    const dataStats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM athletes) as athletes,
        (SELECT COUNT(*) FROM tokens) as tokens,
        (SELECT COUNT(*) FROM transactions) as transactions,
        (SELECT COUNT(*) FROM system_config) as config
    `);

    const stats = dataStats.rows[0];
    console.log('📈 數據統計:');
    console.log(`  - 用戶: ${stats.users}`);
    console.log(`  - 運動員: ${stats.athletes}`);
    console.log(`  - 代幣: ${stats.tokens}`);
    console.log(`  - 交易: ${stats.transactions}`);
    console.log(`  - 配置: ${stats.config}`);

  } catch (error) {
    console.error('❌ 檢查數據庫狀態失敗:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 命令行參數處理
const command = process.argv[2];

switch (command) {
  case 'up':
  case 'migrate':
    migrate();
    break;
  case 'down':
  case 'rollback':
    rollback();
    break;
  case 'status':
    status();
    break;
  default:
    console.log('使用方法:');
    console.log('  node migrate.js up      - 執行遷移');
    console.log('  node migrate.js down    - 回滾遷移');
    console.log('  node migrate.js status  - 檢查狀態');
    process.exit(1);
}