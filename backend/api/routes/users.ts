import express from 'express';
import { db, redis } from '../server';
import { uploadToIPFS, validateWalletAddress } from '../utils/helpers';
import { authenticateWallet } from '../middleware/auth';
import multer from 'multer';
import { z } from 'zod';

const router = express.Router();

// Multer 配置用於文件上傳
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// 驗證模式
const userProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  bio: z.string().max(500).optional(),
});

/**
 * @route GET /api/users/profile
 * @desc 獲取用戶資料
 * @access Private
 */
router.get('/profile', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 檢查 Redis 緩存
    const cacheKey = `user:profile:${walletAddress}`;
    const cachedProfile = await redis.get(cacheKey);
    
    if (cachedProfile) {
      return res.json(JSON.parse(cachedProfile));
    }

    // 從數據庫查詢用戶資料
    const query = `
      SELECT 
        id,
        wallet_address,
        username,
        email,
        avatar_ipfs,
        bio,
        created_at,
        updated_at
      FROM users 
      WHERE wallet_address = $1
    `;
    
    const result = await db.query(query, [walletAddress]);
    
    if (result.rows.length === 0) {
      // 如果用戶不存在，創建新用戶
      const insertQuery = `
        INSERT INTO users (wallet_address, created_at, updated_at)
        VALUES ($1, NOW(), NOW())
        RETURNING id, wallet_address, username, email, avatar_ipfs, bio, created_at, updated_at
      `;
      
      const newUser = await db.query(insertQuery, [walletAddress]);
      const userProfile = newUser.rows[0];
      
      // 緩存新用戶資料
      await redis.setex(cacheKey, 3600, JSON.stringify(userProfile)); // 1小時緩存
      
      return res.status(201).json(userProfile);
    }
    
    const userProfile = result.rows[0];
    
    // 緩存用戶資料
    await redis.setex(cacheKey, 3600, JSON.stringify(userProfile)); // 1小時緩存
    
    res.json(userProfile);
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * @route PUT /api/users/profile
 * @desc 更新用戶資料
 * @access Private
 */
router.put('/profile', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 驗證請求數據
    const validationResult = userProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }

    const { username, email, bio } = validationResult.data;
    
    // 檢查用戶名是否已被使用
    if (username) {
      const usernameCheck = await db.query(
        'SELECT id FROM users WHERE username = $1 AND wallet_address != $2',
        [username, walletAddress]
      );
      
      if (usernameCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    // 構建更新查詢
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (username !== undefined) {
      updateFields.push(`username = $${paramCount++}`);
      values.push(username);
    }
    
    if (email !== undefined) {
      updateFields.push(`email = $${paramCount++}`);
      values.push(email);
    }
    
    if (bio !== undefined) {
      updateFields.push(`bio = $${paramCount++}`);
      values.push(bio);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(walletAddress);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE wallet_address = $${paramCount}
      RETURNING id, wallet_address, username, email, avatar_ipfs, bio, created_at, updated_at
    `;

    const result = await db.query(updateQuery, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedProfile = result.rows[0];
    
    // 更新緩存
    const cacheKey = `user:profile:${walletAddress}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(updatedProfile));
    
    res.json(updatedProfile);
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

/**
 * @route POST /api/users/upload-avatar
 * @desc 上傳頭像到 IPFS
 * @access Private
 */
router.post('/upload-avatar', authenticateWallet, upload.single('avatar'), async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 上傳到 IPFS
    const ipfsHash = await uploadToIPFS(req.file.buffer, {
      name: `avatar-${walletAddress}-${Date.now()}`,
      description: `Avatar for user ${walletAddress}`
    });

    // 更新數據庫中的頭像 IPFS 哈希
    const updateQuery = `
      UPDATE users 
      SET avatar_ipfs = $1, updated_at = NOW()
      WHERE wallet_address = $2
      RETURNING id, wallet_address, username, email, avatar_ipfs, bio, created_at, updated_at
    `;

    const result = await db.query(updateQuery, [ipfsHash, walletAddress]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedProfile = result.rows[0];
    
    // 更新緩存
    const cacheKey = `user:profile:${walletAddress}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(updatedProfile));
    
    res.json({
      message: 'Avatar uploaded successfully',
      ipfsHash,
      profile: updatedProfile
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

/**
 * @route GET /api/users/:address
 * @desc 獲取指定用戶的公開資料
 * @access Public
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!validateWalletAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // 檢查 Redis 緩存
    const cacheKey = `user:public:${address}`;
    const cachedProfile = await redis.get(cacheKey);
    
    if (cachedProfile) {
      return res.json(JSON.parse(cachedProfile));
    }

    // 從數據庫查詢公開資料
    const query = `
      SELECT 
        wallet_address,
        username,
        avatar_ipfs,
        bio,
        created_at
      FROM users 
      WHERE wallet_address = $1
    `;
    
    const result = await db.query(query, [address]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const publicProfile = result.rows[0];
    
    // 緩存公開資料
    await redis.setex(cacheKey, 1800, JSON.stringify(publicProfile)); // 30分鐘緩存
    
    res.json(publicProfile);
  } catch (error) {
    console.error('Get public profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * @route GET /api/users/stats/summary
 * @desc 獲取用戶統計摘要
 * @access Private
 */
router.get('/stats/summary', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 檢查緩存
    const cacheKey = `user:stats:${walletAddress}`;
    const cachedStats = await redis.get(cacheKey);
    
    if (cachedStats) {
      return res.json(JSON.parse(cachedStats));
    }

    // 查詢用戶統計數據
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT t.token_address) as tokens_owned,
        COALESCE(SUM(t.amount * tk.current_price), 0) as portfolio_value,
        COUNT(DISTINCT ul.athlete_id) as athletes_supported
      FROM users u
      LEFT JOIN transactions t ON u.id = t.user_id AND t.type = 'buy'
      LEFT JOIN tokens tk ON t.token_address = tk.address
      LEFT JOIN user_levels ul ON u.id = ul.user_id
      WHERE u.wallet_address = $1
      GROUP BY u.id
    `;

    const result = await db.query(statsQuery, [walletAddress]);
    
    const stats = result.rows[0] || {
      tokens_owned: 0,
      portfolio_value: 0,
      athletes_supported: 0
    };

    // 緩存統計數據
    await redis.setex(cacheKey, 300, JSON.stringify(stats)); // 5分鐘緩存
    
    res.json(stats);
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
});

export default router;