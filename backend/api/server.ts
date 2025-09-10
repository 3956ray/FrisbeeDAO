import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { createClient } from 'redis';
import { Pool } from 'pg';

// 路由導入
import userRoutes from './routes/users';
import athleteRoutes from './routes/athletes';
import tokenRoutes from './routes/tokens';
import marketRoutes from './routes/market';
import oracleRoutes from './routes/oracle';
import authRoutes from './routes/auth';
import levelRoutes from './routes/levels';

// 加載環境變量
config();

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中間件
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分鐘
  max: 100, // 每個IP最多100個請求
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// 解析中間件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// PostgreSQL 連接池
export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'frisbeedao',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis 客戶端
export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// 數據庫連接測試
async function initializeDatabase() {
  try {
    // 測試 PostgreSQL 連接
    const client = await db.connect();
    console.log('✅ PostgreSQL connected successfully');
    client.release();

    // 測試 Redis 連接
    await redis.connect();
    console.log('✅ Redis connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// 健康檢查端點
app.get('/health', async (req, res) => {
  try {
    // 檢查數據庫連接
    const dbCheck = await db.query('SELECT NOW()');
    const redisCheck = await redis.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: redisCheck === 'PONG' ? 'connected' : 'disconnected',
        uptime: process.uptime()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API 路由
app.use('/api/users', userRoutes);
app.use('/api/athletes', athleteRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/oracle', oracleRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/levels', levelRoutes);

// 404 處理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// 全局錯誤處理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// 優雅關閉
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  try {
    await db.end();
    await redis.quit();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  
  process.exit(0);
});

// 啟動服務器
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 FrisbeDAO API Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

export default app;