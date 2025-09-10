import { Pool, PoolClient, QueryResult } from 'pg';
import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL 連接池配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'frisbeedao',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, // 最大連接數
  idleTimeoutMillis: 30000, // 空閒超時
  connectionTimeoutMillis: 2000, // 連接超時
  statement_timeout: 30000, // 查詢超時
  query_timeout: 30000,
};

// 創建 PostgreSQL 連接池
export const pool = new Pool(dbConfig);

// Redis 客戶端配置
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    connectTimeout: 5000,
    lazyConnect: true,
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
};

// 創建 Redis 客戶端
export const redis: RedisClientType = createClient(redisConfig);

// 數據庫查詢輔助函數
export class Database {
  /**
   * 執行查詢
   */
  static async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('Database query error:', { text, params, error });
      throw error;
    }
  }

  /**
   * 執行事務
   */
  static async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 獲取單行數據
   */
  static async queryOne<T = any>(
    text: string,
    params?: any[]
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] || null;
  }

  /**
   * 獲取多行數據
   */
  static async queryMany<T = any>(
    text: string,
    params?: any[]
  ): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  /**
   * 檢查記錄是否存在
   */
  static async exists(
    table: string,
    conditions: Record<string, any>
  ): Promise<boolean> {
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');
    
    const query = `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${whereClause})`;
    const values = Object.values(conditions);
    
    const result = await this.queryOne<{ exists: boolean }>(query, values);
    return result?.exists || false;
  }

  /**
   * 插入數據並返回ID
   */
  static async insert(
    table: string,
    data: Record<string, any>,
    returning: string = 'id'
  ): Promise<any> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${table} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING ${returning}
    `;
    
    const result = await this.queryOne(query, values);
    return result?.[returning];
  }

  /**
   * 更新數據
   */
  static async update(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>
  ): Promise<number> {
    const dataKeys = Object.keys(data);
    const conditionKeys = Object.keys(conditions);
    
    const setClause = dataKeys
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ');
    
    const whereClause = conditionKeys
      .map((key, index) => `${key} = $${dataKeys.length + index + 1}`)
      .join(' AND ');
    
    const query = `
      UPDATE ${table}
      SET ${setClause}, updated_at = NOW()
      WHERE ${whereClause}
    `;
    
    const values = [...Object.values(data), ...Object.values(conditions)];
    const result = await this.query(query, values);
    return result.rowCount || 0;
  }

  /**
   * 刪除數據
   */
  static async delete(
    table: string,
    conditions: Record<string, any>
  ): Promise<number> {
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');
    
    const query = `DELETE FROM ${table} WHERE ${whereClause}`;
    const values = Object.values(conditions);
    
    const result = await this.query(query, values);
    return result.rowCount || 0;
  }

  /**
   * 分頁查詢
   */
  static async paginate<T = any>(
    baseQuery: string,
    params: any[],
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: T[]; total: number; page: number; limit: number; totalPages: number }> {
    // 獲取總數
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_query`;
    const countResult = await this.queryOne<{ total: string }>(countQuery, params);
    const total = parseInt(countResult?.total || '0');
    
    // 獲取分頁數據
    const offset = (page - 1) * limit;
    const dataQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const data = await this.queryMany<T>(dataQuery, [...params, limit, offset]);
    
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

// Redis 緩存輔助函數
export class Cache {
  /**
   * 設置緩存
   */
  static async set(
    key: string,
    value: any,
    ttl: number = 300 // 默認5分鐘
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await redis.setEx(key, ttl, serialized);
    } catch (error) {
      console.error('Cache set error:', { key, error });
    }
  }

  /**
   * 獲取緩存
   */
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', { key, error });
      return null;
    }
  }

  /**
   * 刪除緩存
   */
  static async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', { key, error });
    }
  }

  /**
   * 批量刪除緩存
   */
  static async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } catch (error) {
      console.error('Cache delete pattern error:', { pattern, error });
    }
  }

  /**
   * 緩存或獲取數據
   */
  static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    await this.set(key, data, ttl);
    return data;
  }
}

// 數據庫連接初始化
export async function initializeDatabase(): Promise<void> {
  try {
    // 測試 PostgreSQL 連接
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    client.release();

    // 測試 Redis 連接
    await redis.connect();
    console.log('✅ Redis connected successfully');

    // 設置 Redis 錯誤處理
    redis.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
    });

    redis.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// 優雅關閉數據庫連接
export async function closeDatabase(): Promise<void> {
  try {
    await pool.end();
    await redis.quit();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }
}

// 健康檢查
export async function healthCheck(): Promise<{
  postgres: boolean;
  redis: boolean;
  timestamp: string;
}> {
  const timestamp = new Date().toISOString();
  let postgres = false;
  let redis_status = false;

  try {
    await pool.query('SELECT 1');
    postgres = true;
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
  }

  try {
    await redis.ping();
    redis_status = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }

  return {
    postgres,
    redis: redis_status,
    timestamp,
  };
}