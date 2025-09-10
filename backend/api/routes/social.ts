import express from 'express';
import { db, redis } from '../server';
import { authenticateWallet } from '../middleware/auth';
import { z } from 'zod';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// 驗證模式
const socialVerificationSchema = z.object({
  platform: z.enum(['twitter', 'instagram', 'tiktok', 'youtube']),
  username: z.string().min(1).max(50),
  profile_url: z.string().url(),
  verification_code: z.string().optional()
});

const oauthCallbackSchema = z.object({
  platform: z.enum(['twitter', 'instagram', 'tiktok', 'youtube']),
  code: z.string(),
  state: z.string()
});

// 社交媒體平台配置
const SOCIAL_CONFIGS = {
  twitter: {
    client_id: process.env.TWITTER_CLIENT_ID,
    client_secret: process.env.TWITTER_CLIENT_SECRET,
    redirect_uri: process.env.TWITTER_REDIRECT_URI,
    auth_url: 'https://twitter.com/i/oauth2/authorize',
    token_url: 'https://api.twitter.com/2/oauth2/token',
    api_url: 'https://api.twitter.com/2'
  },
  instagram: {
    client_id: process.env.INSTAGRAM_CLIENT_ID,
    client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    auth_url: 'https://api.instagram.com/oauth/authorize',
    token_url: 'https://api.instagram.com/oauth/access_token',
    api_url: 'https://graph.instagram.com'
  },
  tiktok: {
    client_id: process.env.TIKTOK_CLIENT_ID,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    auth_url: 'https://www.tiktok.com/auth/authorize/',
    token_url: 'https://open-api.tiktok.com/oauth/access_token/',
    api_url: 'https://open-api.tiktok.com'
  },
  youtube: {
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
    auth_url: 'https://accounts.google.com/o/oauth2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    api_url: 'https://www.googleapis.com/youtube/v3'
  }
};

/**
 * @route GET /api/social/auth/:platform
 * @desc 獲取社交媒體OAuth授權URL
 * @access Private
 */
router.get('/auth/:platform', authenticateWallet, async (req, res) => {
  try {
    const { platform } = req.params;
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    if (!['twitter', 'instagram', 'tiktok', 'youtube'].includes(platform)) {
      return res.status(400).json({ error: 'Unsupported platform' });
    }

    const config = SOCIAL_CONFIGS[platform as keyof typeof SOCIAL_CONFIGS];
    
    if (!config.client_id || !config.client_secret) {
      return res.status(500).json({ error: `${platform} OAuth not configured` });
    }

    // 生成state參數用於安全驗證
    const state = crypto.randomBytes(32).toString('hex');
    
    // 保存state到Redis（10分鐘過期）
    await redis.setex(`oauth:state:${state}`, 600, JSON.stringify({
      wallet_address: walletAddress,
      platform,
      timestamp: Date.now()
    }));

    // 構建授權URL
    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri: config.redirect_uri!,
      state,
      response_type: 'code'
    });

    // 平台特定參數
    if (platform === 'twitter') {
      params.append('scope', 'tweet.read users.read follows.read');
      params.append('code_challenge_method', 'plain');
      params.append('code_challenge', state);
    } else if (platform === 'instagram') {
      params.append('scope', 'user_profile,user_media');
    } else if (platform === 'tiktok') {
      params.append('scope', 'user.info.basic,user.info.stats');
    } else if (platform === 'youtube') {
      params.append('scope', 'https://www.googleapis.com/auth/youtube.readonly');
    }

    const authUrl = `${config.auth_url}?${params.toString()}`;

    res.json({
      auth_url: authUrl,
      state,
      platform
    });
  } catch (error) {
    console.error('Social auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

/**
 * @route POST /api/social/callback
 * @desc 處理OAuth回調
 * @access Public
 */
router.post('/callback', async (req, res) => {
  try {
    const validationResult = oauthCallbackSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid callback data',
        details: validationResult.error.errors
      });
    }

    const { platform, code, state } = validationResult.data;

    // 驗證state參數
    const stateData = await redis.get(`oauth:state:${state}`);
    if (!stateData) {
      return res.status(400).json({ error: 'Invalid or expired state parameter' });
    }

    const { wallet_address, platform: statePlatform } = JSON.parse(stateData);
    
    if (platform !== statePlatform) {
      return res.status(400).json({ error: 'Platform mismatch' });
    }

    // 刪除已使用的state
    await redis.del(`oauth:state:${state}`);

    const config = SOCIAL_CONFIGS[platform];
    
    // 交換授權碼獲取訪問令牌
    const tokenData = {
      client_id: config.client_id!,
      client_secret: config.client_secret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirect_uri!
    };

    // 平台特定的令牌請求
    let tokenResponse;
    if (platform === 'twitter') {
      tokenData['code_verifier'] = state;
      tokenResponse = await axios.post(config.token_url, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    } else {
      tokenResponse = await axios.post(config.token_url, tokenData);
    }

    const accessToken = tokenResponse.data.access_token;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Failed to obtain access token' });
    }

    // 獲取用戶資料
    const userProfile = await getSocialUserProfile(platform, accessToken);
    
    if (!userProfile) {
      return res.status(400).json({ error: 'Failed to fetch user profile' });
    }

    // 獲取用戶ID
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [wallet_address]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // 保存社交媒體認證信息
    const socialAuthQuery = `
      INSERT INTO social_authentications (
        user_id, platform, platform_user_id, username, 
        profile_url, followers_count, access_token, 
        verified_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
      ON CONFLICT (user_id, platform) 
      DO UPDATE SET 
        platform_user_id = $3,
        username = $4,
        profile_url = $5,
        followers_count = $6,
        access_token = $7,
        verified_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `;

    const result = await db.query(socialAuthQuery, [
      userId,
      platform,
      userProfile.id,
      userProfile.username,
      userProfile.profile_url,
      userProfile.followers_count,
      accessToken
    ]);

    // 清除相關緩存
    await redis.del(`user:social:${wallet_address}`);
    await redis.del(`athlete:${wallet_address}`);

    res.json({
      message: 'Social authentication successful',
      platform,
      profile: {
        username: userProfile.username,
        followers_count: userProfile.followers_count,
        profile_url: userProfile.profile_url,
        verified_at: result.rows[0].verified_at
      }
    });
  } catch (error) {
    console.error('Social callback error:', error);
    res.status(500).json({ error: 'Failed to process social authentication' });
  }
});

/**
 * @route POST /api/social/verify
 * @desc 手動驗證社交媒體賬戶
 * @access Private
 */
router.post('/verify', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    const validationResult = socialVerificationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid verification data',
        details: validationResult.error.errors
      });
    }

    const { platform, username, profile_url, verification_code } = validationResult.data;

    // 獲取用戶ID
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [walletAddress]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // 生成驗證碼（如果沒有提供）
    const verificationCodeToUse = verification_code || crypto.randomBytes(8).toString('hex');

    // 嘗試獲取粉絲數（如果可能）
    let followersCount = 0;
    try {
      followersCount = await getFollowersCount(platform, username);
    } catch (error) {
      console.warn(`Failed to get followers count for ${platform}:${username}`, error);
    }

    // 保存待驗證的社交媒體信息
    const socialVerificationQuery = `
      INSERT INTO social_verifications (
        user_id, platform, username, profile_url, 
        verification_code, followers_count, status, 
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
      ON CONFLICT (user_id, platform) 
      DO UPDATE SET 
        username = $3,
        profile_url = $4,
        verification_code = $5,
        followers_count = $6,
        status = 'pending',
        updated_at = NOW()
      RETURNING *
    `;

    const result = await db.query(socialVerificationQuery, [
      userId,
      platform,
      username,
      profile_url,
      verificationCodeToUse,
      followersCount
    ]);

    res.json({
      message: 'Verification request submitted',
      platform,
      username,
      verification_code: verificationCodeToUse,
      instructions: `Please add the verification code "${verificationCodeToUse}" to your ${platform} bio or post it as a status, then contact support for manual verification.`,
      followers_count: followersCount
    });
  } catch (error) {
    console.error('Social verification error:', error);
    res.status(500).json({ error: 'Failed to submit verification request' });
  }
});

/**
 * @route GET /api/social/status/:platform
 * @desc 獲取社交媒體認證狀態
 * @access Private
 */
router.get('/status/:platform', authenticateWallet, async (req, res) => {
  try {
    const { platform } = req.params;
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    if (!['twitter', 'instagram', 'tiktok', 'youtube'].includes(platform)) {
      return res.status(400).json({ error: 'Unsupported platform' });
    }

    // 檢查緩存
    const cacheKey = `user:social:${walletAddress}:${platform}`;
    const cachedStatus = await redis.get(cacheKey);
    
    if (cachedStatus) {
      return res.json(JSON.parse(cachedStatus));
    }

    // 獲取用戶ID
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [walletAddress]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // 查詢認證狀態
    const authQuery = `
      SELECT 
        platform, username, profile_url, followers_count,
        verified_at, created_at
      FROM social_authentications 
      WHERE user_id = $1 AND platform = $2
    `;
    
    const authResult = await db.query(authQuery, [userId, platform]);
    
    // 查詢待驗證狀態
    const verificationQuery = `
      SELECT 
        platform, username, profile_url, verification_code,
        followers_count, status, created_at, updated_at
      FROM social_verifications 
      WHERE user_id = $1 AND platform = $2
    `;
    
    const verificationResult = await db.query(verificationQuery, [userId, platform]);

    const status = {
      platform,
      authenticated: authResult.rows.length > 0,
      verification_pending: verificationResult.rows.length > 0 && verificationResult.rows[0].status === 'pending',
      data: authResult.rows[0] || verificationResult.rows[0] || null
    };

    // 緩存狀態（5分鐘）
    await redis.setex(cacheKey, 300, JSON.stringify(status));
    
    res.json(status);
  } catch (error) {
    console.error('Get social status error:', error);
    res.status(500).json({ error: 'Failed to get social status' });
  }
});

/**
 * @route GET /api/social/all
 * @desc 獲取所有社交媒體認證狀態
 * @access Private
 */
router.get('/all', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 檢查緩存
    const cacheKey = `user:social:${walletAddress}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // 獲取用戶ID
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [walletAddress]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // 查詢所有認證狀態
    const authQuery = `
      SELECT 
        platform, username, profile_url, followers_count,
        verified_at, created_at
      FROM social_authentications 
      WHERE user_id = $1
    `;
    
    const authResult = await db.query(authQuery, [userId]);
    
    // 查詢所有待驗證狀態
    const verificationQuery = `
      SELECT 
        platform, username, profile_url, verification_code,
        followers_count, status, created_at, updated_at
      FROM social_verifications 
      WHERE user_id = $1
    `;
    
    const verificationResult = await db.query(verificationQuery, [userId]);

    // 組織數據
    const platforms = ['twitter', 'instagram', 'tiktok', 'youtube'];
    const socialData = {};

    platforms.forEach(platform => {
      const auth = authResult.rows.find(row => row.platform === platform);
      const verification = verificationResult.rows.find(row => row.platform === platform);
      
      socialData[platform] = {
        authenticated: !!auth,
        verification_pending: verification && verification.status === 'pending',
        data: auth || verification || null
      };
    });

    // 計算總粉絲數
    const totalFollowers = authResult.rows.reduce((sum, row) => {
      return sum + (parseInt(row.followers_count) || 0);
    }, 0);

    const result = {
      social_accounts: socialData,
      total_followers: totalFollowers,
      verified_platforms: authResult.rows.length,
      last_updated: new Date().toISOString()
    };

    // 緩存數據（5分鐘）
    await redis.setex(cacheKey, 300, JSON.stringify(result));
    
    res.json(result);
  } catch (error) {
    console.error('Get all social status error:', error);
    res.status(500).json({ error: 'Failed to get social status' });
  }
});

/**
 * @route POST /api/social/refresh/:platform
 * @desc 刷新社交媒體數據
 * @access Private
 */
router.post('/refresh/:platform', authenticateWallet, async (req, res) => {
  try {
    const { platform } = req.params;
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    if (!['twitter', 'instagram', 'tiktok', 'youtube'].includes(platform)) {
      return res.status(400).json({ error: 'Unsupported platform' });
    }

    // 獲取用戶ID
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [walletAddress]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // 獲取現有認證信息
    const authQuery = `
      SELECT access_token, username
      FROM social_authentications 
      WHERE user_id = $1 AND platform = $2
    `;
    
    const authResult = await db.query(authQuery, [userId, platform]);
    
    if (authResult.rows.length === 0) {
      return res.status(404).json({ error: 'No authentication found for this platform' });
    }

    const { access_token, username } = authResult.rows[0];

    // 刷新用戶資料
    const userProfile = await getSocialUserProfile(platform, access_token);
    
    if (!userProfile) {
      return res.status(400).json({ error: 'Failed to refresh user profile' });
    }

    // 更新數據庫
    const updateQuery = `
      UPDATE social_authentications 
      SET 
        followers_count = $1,
        updated_at = NOW()
      WHERE user_id = $2 AND platform = $3
      RETURNING *
    `;

    const result = await db.query(updateQuery, [
      userProfile.followers_count,
      userId,
      platform
    ]);

    // 清除相關緩存
    await redis.del(`user:social:${walletAddress}:${platform}`);
    await redis.del(`user:social:${walletAddress}`);
    await redis.del(`athlete:${walletAddress}`);

    res.json({
      message: 'Social data refreshed successfully',
      platform,
      followers_count: userProfile.followers_count,
      updated_at: result.rows[0].updated_at
    });
  } catch (error) {
    console.error('Refresh social data error:', error);
    res.status(500).json({ error: 'Failed to refresh social data' });
  }
});

// 輔助函數：獲取社交媒體用戶資料
async function getSocialUserProfile(platform: string, accessToken: string) {
  try {
    const config = SOCIAL_CONFIGS[platform as keyof typeof SOCIAL_CONFIGS];
    let response;

    switch (platform) {
      case 'twitter':
        response = await axios.get(`${config.api_url}/users/me?user.fields=public_metrics,profile_image_url`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        return {
          id: response.data.data.id,
          username: response.data.data.username,
          profile_url: `https://twitter.com/${response.data.data.username}`,
          followers_count: response.data.data.public_metrics.followers_count
        };

      case 'instagram':
        response = await axios.get(`${config.api_url}/me?fields=id,username,followers_count`, {
          params: { access_token: accessToken }
        });
        return {
          id: response.data.id,
          username: response.data.username,
          profile_url: `https://instagram.com/${response.data.username}`,
          followers_count: response.data.followers_count || 0
        };

      case 'tiktok':
        response = await axios.get(`${config.api_url}/v2/user/info/`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        return {
          id: response.data.data.user.open_id,
          username: response.data.data.user.display_name,
          profile_url: `https://tiktok.com/@${response.data.data.user.display_name}`,
          followers_count: response.data.data.user.follower_count || 0
        };

      case 'youtube':
        response = await axios.get(`${config.api_url}/channels?part=snippet,statistics&mine=true`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        const channel = response.data.items[0];
        return {
          id: channel.id,
          username: channel.snippet.title,
          profile_url: `https://youtube.com/channel/${channel.id}`,
          followers_count: parseInt(channel.statistics.subscriberCount) || 0
        };

      default:
        return null;
    }
  } catch (error) {
    console.error(`Failed to get ${platform} user profile:`, error);
    return null;
  }
}

// 輔助函數：獲取粉絲數（公開API）
async function getFollowersCount(platform: string, username: string): Promise<number> {
  // 這裡可以實現公開API的粉絲數獲取
  // 由於大多數平台的公開API有限制，這裡返回0
  // 實際實現中可以使用第三方服務或爬蟲
  return 0;
}

export default router;