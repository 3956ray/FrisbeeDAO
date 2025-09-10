import { Request, Response, NextFunction } from 'express';
import { verifyMessage } from 'viem';
import { db, redis } from '../server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// 擴展Request類型以包含用戶信息
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        address: string;
        username?: string;
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * 生成認證消息
 * @param address 錢包地址
 * @param nonce 隨機數
 * @returns 認證消息字符串
 */
export function generateAuthMessage(address: string, nonce: string): string {
  return `Welcome to FrisbeDAO!

Please sign this message to authenticate your wallet.

Wallet: ${address}
Nonce: ${nonce}
Timestamp: ${new Date().toISOString()}`;
}

/**
 * 生成隨機nonce
 * @returns 32字節的十六進制字符串
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 驗證錢包簽名
 * @param message 原始消息
 * @param signature 簽名
 * @param address 錢包地址
 * @returns 驗證結果
 */
export async function verifyWalletSignature(
  message: string, 
  signature: string, 
  address: string
): Promise<boolean> {
  try {
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`
    });
    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * 生成JWT令牌
 * @param userId 用戶ID
 * @param address 錢包地址
 * @returns JWT令牌
 */
export function generateJWT(userId: number, address: string): string {
  return jwt.sign(
    { 
      userId, 
      address,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * 驗證JWT令牌
 * @param token JWT令牌
 * @returns 解碼後的payload或null
 */
export function verifyJWT(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * 錢包認證中間件
 * 驗證用戶的錢包簽名或JWT令牌
 */
export async function authenticateWallet(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    // 支持兩種認證方式：Bearer JWT 或 Signature
    if (authHeader.startsWith('Bearer ')) {
      // JWT認證
      const token = authHeader.substring(7);
      const payload = verifyJWT(token);
      
      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // 檢查用戶是否存在
      const userQuery = 'SELECT id, wallet_address, username FROM users WHERE id = $1';
      const userResult = await db.query(userQuery, [payload.userId]);
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      req.user = {
        id: user.id,
        address: user.wallet_address,
        username: user.username
      };
      
      next();
    } else if (authHeader.startsWith('Signature ')) {
      // 簽名認證
      const signatureData = authHeader.substring(10);
      
      try {
        const { address, message, signature, nonce } = JSON.parse(signatureData);
        
        if (!address || !message || !signature || !nonce) {
          return res.status(400).json({ error: 'Missing signature data' });
        }

        // 驗證nonce是否有效且未使用
        const nonceKey = `auth:nonce:${nonce}`;
        const storedAddress = await redis.get(nonceKey);
        
        if (!storedAddress || storedAddress !== address) {
          return res.status(401).json({ error: 'Invalid or expired nonce' });
        }

        // 驗證簽名
        const isValidSignature = await verifyWalletSignature(message, signature, address);
        
        if (!isValidSignature) {
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // 刪除已使用的nonce
        await redis.del(nonceKey);

        // 檢查用戶是否存在
        const userQuery = 'SELECT id, wallet_address, username FROM users WHERE wallet_address = $1';
        const userResult = await db.query(userQuery, [address]);
        
        if (userResult.rows.length === 0) {
          return res.status(401).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        req.user = {
          id: user.id,
          address: user.wallet_address,
          username: user.username
        };
        
        next();
      } catch (error) {
        return res.status(400).json({ error: 'Invalid signature format' });
      }
    } else {
      return res.status(401).json({ error: 'Invalid authorization format' });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * 可選的錢包認證中間件
 * 如果提供了認證信息則驗證，否則繼續執行
 */
export async function optionalAuthenticateWallet(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    // 嘗試認證，但不阻止請求
    await authenticateWallet(req, res, (error) => {
      if (error) {
        // 認證失敗時清除用戶信息但繼續執行
        req.user = undefined;
      }
      next();
    });
  } catch (error) {
    // 認證錯誤時繼續執行
    req.user = undefined;
    next();
  }
}

/**
 * 管理員認證中間件
 * 驗證用戶是否為管理員
 */
export async function authenticateAdmin(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    // 首先進行錢包認證
    await authenticateWallet(req, res, async (error) => {
      if (error) {
        return;
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // 檢查用戶是否為管理員
      const adminQuery = 'SELECT role FROM users WHERE id = $1 AND role = $2';
      const adminResult = await db.query(adminQuery, [req.user.id, 'admin']);
      
      if (adminResult.rows.length === 0) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      next();
    });
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * 速率限制中間件
 * @param windowMs 時間窗口（毫秒）
 * @param maxRequests 最大請求數
 * @param keyGenerator 生成限制鍵的函數
 */
export function createRateLimit(
  windowMs: number = 60000, // 1分鐘
  maxRequests: number = 100,
  keyGenerator: (req: Request) => string = (req) => req.ip
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = `rate_limit:${keyGenerator(req)}`;
      const current = await redis.get(key);
      
      if (current === null) {
        // 第一次請求
        await redis.setex(key, Math.ceil(windowMs / 1000), '1');
        return next();
      }
      
      const requestCount = parseInt(current);
      
      if (requestCount >= maxRequests) {
        return res.status(429).json({ 
          error: 'Too many requests',
          retry_after: await redis.ttl(key)
        });
      }
      
      // 增加請求計數
      await redis.incr(key);
      next();
    } catch (error) {
      console.error('Rate limit error:', error);
      // 如果Redis出錯，允許請求通過
      next();
    }
  };
}

/**
 * 用戶特定的速率限制
 */
export const userRateLimit = createRateLimit(
  60000, // 1分鐘
  60, // 60次請求
  (req) => req.user?.address || req.ip
);

/**
 * API密鑰認證中間件
 * 用於第三方服務集成
 */
export async function authenticateApiKey(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // 檢查API密鑰是否有效
    const keyQuery = 'SELECT user_id, permissions FROM api_keys WHERE key_hash = $1 AND active = true';
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyResult = await db.query(keyQuery, [keyHash]);
    
    if (keyResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const apiKeyData = keyResult.rows[0];
    
    // 獲取用戶信息
    const userQuery = 'SELECT id, wallet_address, username FROM users WHERE id = $1';
    const userResult = await db.query(userQuery, [apiKeyData.user_id]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    req.user = {
      id: user.id,
      address: user.wallet_address,
      username: user.username
    };

    // 添加權限信息
    req.permissions = JSON.parse(apiKeyData.permissions || '[]');
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * 權限檢查中間件
 * @param requiredPermission 所需權限
 */
export function requirePermission(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = (req as any).permissions || [];
    
    if (!permissions.includes(requiredPermission) && !permissions.includes('admin')) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: requiredPermission
      });
    }
    
    next();
  };
}