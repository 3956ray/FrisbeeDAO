import express from 'express';
import { db, redis } from '../server';
import { authenticateWallet } from '../middleware/auth';
import { validateWalletAddress, uploadToIPFS } from '../utils/helpers';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';

const router = express.Router();

// Multer 配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// 驗證模式
const athleteRegistrationSchema = z.object({
  sport: z.string().min(1).max(50),
  bio: z.string().max(1000),
  achievements: z.array(z.string()).optional(),
  stats: z.object({
    wins: z.number().min(0).optional(),
    losses: z.number().min(0).optional(),
    tournaments: z.number().min(0).optional(),
    ranking: z.number().min(0).optional(),
  }).optional(),
});

const socialVerificationSchema = z.object({
  platform: z.enum(['instagram', 'twitter', 'xiaohongshu', 'tiktok']),
  socialId: z.string().min(1),
  followerCount: z.number().min(100), // 最少100粉絲
  profileUrl: z.string().url(),
});

/**
 * @route POST /api/athletes/register
 * @desc 運動員註冊
 * @access Private
 */
router.post('/register', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 驗證請求數據
    const validationResult = athleteRegistrationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }

    const { sport, bio, achievements, stats } = validationResult.data;

    // 檢查用戶是否存在
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [walletAddress]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please create a profile first.' });
    }

    const userId = userResult.rows[0].id;

    // 檢查是否已經是運動員
    const existingAthleteQuery = 'SELECT id FROM athletes WHERE user_id = $1';
    const existingResult = await db.query(existingAthleteQuery, [userId]);
    
    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'User is already registered as an athlete' });
    }

    // 註冊運動員
    const insertQuery = `
      INSERT INTO athletes (
        user_id, sport, bio, achievements, stats, 
        verification_status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
      RETURNING *
    `;

    const result = await db.query(insertQuery, [
      userId,
      sport,
      bio,
      JSON.stringify(achievements || []),
      JSON.stringify(stats || {})
    ]);

    const athlete = result.rows[0];

    // 清除相關緩存
    await redis.del(`athlete:${walletAddress}`);
    await redis.del(`user:profile:${walletAddress}`);

    res.status(201).json({
      message: 'Athlete registered successfully',
      athlete: {
        ...athlete,
        achievements: JSON.parse(athlete.achievements),
        stats: JSON.parse(athlete.stats)
      }
    });
  } catch (error) {
    console.error('Athlete registration error:', error);
    res.status(500).json({ error: 'Failed to register athlete' });
  }
});

/**
 * @route GET /api/athletes/:address
 * @desc 獲取運動員詳情
 * @access Public
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!validateWalletAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // 檢查緩存
    const cacheKey = `athlete:${address}`;
    const cachedAthlete = await redis.get(cacheKey);
    
    if (cachedAthlete) {
      return res.json(JSON.parse(cachedAthlete));
    }

    // 查詢運動員詳情
    const query = `
      SELECT 
        a.*,
        u.wallet_address,
        u.username,
        u.avatar_ipfs,
        t.address as token_address,
        t.name as token_name,
        t.symbol as token_symbol,
        t.current_price,
        t.market_cap
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN tokens t ON a.id = t.athlete_id
      WHERE u.wallet_address = $1
    `;

    const result = await db.query(query, [address]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Athlete not found' });
    }

    const athleteData = result.rows[0];
    
    // 查詢社交媒體認證
    const socialQuery = `
      SELECT platform, follower_count, verified_at, profile_url
      FROM social_verifications 
      WHERE athlete_id = $1
    `;
    
    const socialResult = await db.query(socialQuery, [athleteData.id]);

    const athlete = {
      id: athleteData.id,
      wallet_address: athleteData.wallet_address,
      username: athleteData.username,
      avatar_ipfs: athleteData.avatar_ipfs,
      sport: athleteData.sport,
      bio: athleteData.bio,
      achievements: JSON.parse(athleteData.achievements || '[]'),
      stats: JSON.parse(athleteData.stats || '{}'),
      verification_status: athleteData.verification_status,
      social_verifications: socialResult.rows,
      token: athleteData.token_address ? {
        address: athleteData.token_address,
        name: athleteData.token_name,
        symbol: athleteData.token_symbol,
        current_price: athleteData.current_price,
        market_cap: athleteData.market_cap
      } : null,
      created_at: athleteData.created_at,
      updated_at: athleteData.updated_at
    };

    // 緩存運動員數據
    await redis.setex(cacheKey, 1800, JSON.stringify(athlete)); // 30分鐘緩存
    
    res.json(athlete);
  } catch (error) {
    console.error('Get athlete error:', error);
    res.status(500).json({ error: 'Failed to get athlete details' });
  }
});

/**
 * @route PUT /api/athletes/:address
 * @desc 更新運動員資料
 * @access Private (只有運動員本人可以更新)
 */
router.put('/:address', authenticateWallet, async (req, res) => {
  try {
    const { address } = req.params;
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    if (address !== walletAddress) {
      return res.status(403).json({ error: 'You can only update your own profile' });
    }

    // 驗證請求數據
    const updateSchema = z.object({
      bio: z.string().max(1000).optional(),
      achievements: z.array(z.string()).optional(),
      stats: z.object({
        wins: z.number().min(0).optional(),
        losses: z.number().min(0).optional(),
        tournaments: z.number().min(0).optional(),
        ranking: z.number().min(0).optional(),
      }).optional(),
    });

    const validationResult = updateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }

    const { bio, achievements, stats } = validationResult.data;

    // 構建更新查詢
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (bio !== undefined) {
      updateFields.push(`bio = $${paramCount++}`);
      values.push(bio);
    }
    
    if (achievements !== undefined) {
      updateFields.push(`achievements = $${paramCount++}`);
      values.push(JSON.stringify(achievements));
    }
    
    if (stats !== undefined) {
      updateFields.push(`stats = $${paramCount++}`);
      values.push(JSON.stringify(stats));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(walletAddress);

    const updateQuery = `
      UPDATE athletes 
      SET ${updateFields.join(', ')}
      FROM users u
      WHERE athletes.user_id = u.id AND u.wallet_address = $${paramCount}
      RETURNING athletes.*
    `;

    const result = await db.query(updateQuery, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Athlete not found' });
    }

    const updatedAthlete = result.rows[0];
    
    // 清除緩存
    await redis.del(`athlete:${walletAddress}`);
    
    res.json({
      message: 'Athlete profile updated successfully',
      athlete: {
        ...updatedAthlete,
        achievements: JSON.parse(updatedAthlete.achievements),
        stats: JSON.parse(updatedAthlete.stats)
      }
    });
  } catch (error) {
    console.error('Update athlete error:', error);
    res.status(500).json({ error: 'Failed to update athlete profile' });
  }
});

/**
 * @route POST /api/athletes/verify-social
 * @desc 社交媒體認證
 * @access Private
 */
router.post('/verify-social', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 驗證請求數據
    const validationResult = socialVerificationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }

    const { platform, socialId, followerCount, profileUrl } = validationResult.data;

    // 獲取運動員ID
    const athleteQuery = `
      SELECT a.id 
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      WHERE u.wallet_address = $1
    `;
    
    const athleteResult = await db.query(athleteQuery, [walletAddress]);
    
    if (athleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Athlete profile not found' });
    }

    const athleteId = athleteResult.rows[0].id;

    // 檢查是否已經認證過該平台
    const existingQuery = `
      SELECT id FROM social_verifications 
      WHERE athlete_id = $1 AND platform = $2
    `;
    
    const existingResult = await db.query(existingQuery, [athleteId, platform]);

    // 創建社交ID的哈希（保護隱私）
    const socialIdHash = crypto.createHash('sha256').update(socialId).digest('hex');

    if (existingResult.rows.length > 0) {
      // 更新現有認證
      const updateQuery = `
        UPDATE social_verifications 
        SET 
          social_id_hash = $1,
          follower_count = $2,
          profile_url = $3,
          verified_at = NOW()
        WHERE athlete_id = $4 AND platform = $5
        RETURNING *
      `;
      
      const result = await db.query(updateQuery, [
        socialIdHash, followerCount, profileUrl, athleteId, platform
      ]);
      
      // 清除緩存
      await redis.del(`athlete:${walletAddress}`);
      
      return res.json({
        message: 'Social media verification updated successfully',
        verification: result.rows[0]
      });
    } else {
      // 創建新認證
      const insertQuery = `
        INSERT INTO social_verifications (
          athlete_id, platform, social_id_hash, follower_count, 
          profile_url, verified_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `;
      
      const result = await db.query(insertQuery, [
        athleteId, platform, socialIdHash, followerCount, profileUrl
      ]);
      
      // 檢查是否達到認證要求（至少2個平台，每個平台>100粉絲）
      const verificationCountQuery = `
        SELECT COUNT(*) as count
        FROM social_verifications 
        WHERE athlete_id = $1 AND follower_count >= 100
      `;
      
      const countResult = await db.query(verificationCountQuery, [athleteId]);
      const verificationCount = parseInt(countResult.rows[0].count);
      
      // 如果達到認證要求，更新運動員認證狀態
      if (verificationCount >= 2) {
        await db.query(
          'UPDATE athletes SET verification_status = $1 WHERE id = $2',
          ['verified', athleteId]
        );
      }
      
      // 清除緩存
      await redis.del(`athlete:${walletAddress}`);
      
      res.status(201).json({
        message: 'Social media verification added successfully',
        verification: result.rows[0],
        verification_count: verificationCount,
        is_verified: verificationCount >= 2
      });
    }
  } catch (error) {
    console.error('Social verification error:', error);
    res.status(500).json({ error: 'Failed to verify social media' });
  }
});

/**
 * @route GET /api/athletes/verification-status/:address
 * @desc 認證狀態查詢
 * @access Public
 */
router.get('/verification-status/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!validateWalletAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // 查詢認證狀態
    const query = `
      SELECT 
        a.verification_status,
        COUNT(sv.id) as social_verifications_count,
        ARRAY_AGG(
          json_build_object(
            'platform', sv.platform,
            'follower_count', sv.follower_count,
            'verified_at', sv.verified_at
          )
        ) FILTER (WHERE sv.id IS NOT NULL) as verifications
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN social_verifications sv ON a.id = sv.athlete_id
      WHERE u.wallet_address = $1
      GROUP BY a.id, a.verification_status
    `;

    const result = await db.query(query, [address]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Athlete not found' });
    }

    const status = result.rows[0];
    
    res.json({
      verification_status: status.verification_status,
      social_verifications_count: parseInt(status.social_verifications_count),
      verifications: status.verifications || [],
      requirements: {
        min_platforms: 2,
        min_followers_per_platform: 100
      }
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
});

/**
 * @route GET /api/athletes/list
 * @desc 獲取運動員列表
 * @access Public
 */
router.get('/list', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sport, 
      verified_only = false,
      sort_by = 'created_at',
      order = 'desc'
    } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // 構建查詢條件
    let whereClause = 'WHERE 1=1';
    const queryParams = [];
    let paramCount = 1;

    if (sport) {
      whereClause += ` AND a.sport = $${paramCount++}`;
      queryParams.push(sport);
    }

    if (verified_only === 'true') {
      whereClause += ` AND a.verification_status = 'verified'`;
    }

    // 驗證排序字段
    const validSortFields = ['created_at', 'username', 'sport'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const query = `
      SELECT 
        a.id,
        u.wallet_address,
        u.username,
        u.avatar_ipfs,
        a.sport,
        a.bio,
        a.verification_status,
        t.current_price,
        t.market_cap,
        a.created_at
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN tokens t ON a.id = t.athlete_id
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    queryParams.push(parseInt(limit as string), offset);

    const result = await db.query(query, queryParams);
    
    // 獲取總數
    const countQuery = `
      SELECT COUNT(*) as total
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      ${whereClause}
    `;
    
    const countResult = await db.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    res.json({
      athletes: result.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Get athletes list error:', error);
    res.status(500).json({ error: 'Failed to get athletes list' });
  }
});

export default router;