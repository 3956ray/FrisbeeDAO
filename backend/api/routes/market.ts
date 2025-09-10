import express from 'express';
import { db, redis } from '../server';
import { z } from 'zod';

const router = express.Router();

// 驗證模式
const marketQuerySchema = z.object({
  timeframe: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h'),
  limit: z.number().min(1).max(100).optional().default(10),
  page: z.number().min(1).optional().default(1)
});

const searchSchema = z.object({
  query: z.string().min(1).max(50),
  limit: z.number().min(1).max(20).optional().default(10)
});

/**
 * @route GET /api/market/overview
 * @desc 獲取市場總覽數據
 * @access Public
 */
router.get('/overview', async (req, res) => {
  try {
    // 檢查緩存
    const cacheKey = 'market:overview';
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // 獲取市場統計數據
    const statsQuery = `
      SELECT 
        COUNT(*) as total_tokens,
        SUM(market_cap) as total_market_cap,
        AVG(current_price) as avg_price,
        COUNT(DISTINCT athlete_id) as total_athletes
      FROM tokens
    `;

    const statsResult = await db.query(statsQuery);
    const stats = statsResult.rows[0];

    // 獲取24小時交易統計
    const tradingStatsQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount * price) as total_volume,
        COUNT(DISTINCT user_id) as active_traders
      FROM transactions 
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
    `;

    const tradingResult = await db.query(tradingStatsQuery);
    const tradingStats = tradingResult.rows[0];

    // 獲取價格變化統計
    const priceChangeQuery = `
      WITH price_changes AS (
        SELECT 
          t.address,
          t.current_price,
          LAG(ph.price) OVER (PARTITION BY ph.token_address ORDER BY ph.timestamp DESC) as prev_price
        FROM tokens t
        LEFT JOIN price_history ph ON t.address = ph.token_address
        WHERE ph.timestamp >= NOW() - INTERVAL '24 hours'
      )
      SELECT 
        COUNT(CASE WHEN current_price > prev_price THEN 1 END) as gainers,
        COUNT(CASE WHEN current_price < prev_price THEN 1 END) as losers,
        COUNT(CASE WHEN current_price = prev_price THEN 1 END) as unchanged
      FROM price_changes
      WHERE prev_price IS NOT NULL
    `;

    const priceChangeResult = await db.query(priceChangeQuery);
    const priceChange = priceChangeResult.rows[0];

    const overview = {
      total_tokens: parseInt(stats.total_tokens),
      total_market_cap: parseFloat(stats.total_market_cap) || 0,
      average_price: parseFloat(stats.avg_price) || 0,
      total_athletes: parseInt(stats.total_athletes),
      daily_volume: parseFloat(tradingStats.total_volume) || 0,
      daily_transactions: parseInt(tradingStats.total_transactions),
      active_traders: parseInt(tradingStats.active_traders),
      market_sentiment: {
        gainers: parseInt(priceChange.gainers) || 0,
        losers: parseInt(priceChange.losers) || 0,
        unchanged: parseInt(priceChange.unchanged) || 0
      },
      last_updated: new Date().toISOString()
    };

    // 緩存數據（5分鐘）
    await redis.setex(cacheKey, 300, JSON.stringify(overview));
    
    res.json(overview);
  } catch (error) {
    console.error('Get market overview error:', error);
    res.status(500).json({ error: 'Failed to get market overview' });
  }
});

/**
 * @route GET /api/market/top-performers
 * @desc 獲取表現最佳的代幣
 * @access Public
 */
router.get('/top-performers', async (req, res) => {
  try {
    const validationResult = marketQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: validationResult.error.errors
      });
    }

    const { timeframe, limit } = validationResult.data;

    // 檢查緩存
    const cacheKey = `market:top-performers:${timeframe}:${limit}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // 計算時間條件
    let timeCondition = '';
    switch (timeframe) {
      case '1h':
        timeCondition = "ph.timestamp >= NOW() - INTERVAL '1 hour'";
        break;
      case '24h':
        timeCondition = "ph.timestamp >= NOW() - INTERVAL '24 hours'";
        break;
      case '7d':
        timeCondition = "ph.timestamp >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        timeCondition = "ph.timestamp >= NOW() - INTERVAL '30 days'";
        break;
    }

    const query = `
      WITH price_changes AS (
        SELECT 
          t.address,
          t.name,
          t.symbol,
          t.current_price,
          t.market_cap,
          u.username as athlete_name,
          u.avatar_ipfs,
          FIRST_VALUE(ph.price) OVER (
            PARTITION BY t.address 
            ORDER BY ph.timestamp ASC 
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as start_price,
          LAST_VALUE(ph.price) OVER (
            PARTITION BY t.address 
            ORDER BY ph.timestamp ASC 
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as end_price
        FROM tokens t
        JOIN athletes a ON t.athlete_id = a.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN price_history ph ON t.address = ph.token_address
        WHERE ${timeCondition}
      ),
      ranked_tokens AS (
        SELECT DISTINCT
          address,
          name,
          symbol,
          current_price,
          market_cap,
          athlete_name,
          avatar_ipfs,
          start_price,
          end_price,
          CASE 
            WHEN start_price > 0 THEN ((end_price - start_price) / start_price) * 100
            ELSE 0
          END as price_change_percent
        FROM price_changes
        WHERE start_price IS NOT NULL AND end_price IS NOT NULL
      )
      SELECT *
      FROM ranked_tokens
      ORDER BY price_change_percent DESC
      LIMIT $1
    `;

    const result = await db.query(query, [limit]);
    
    const topPerformers = result.rows.map(row => ({
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      current_price: parseFloat(row.current_price),
      market_cap: parseFloat(row.market_cap),
      athlete_name: row.athlete_name,
      avatar_ipfs: row.avatar_ipfs,
      price_change_percent: parseFloat(row.price_change_percent) || 0,
      start_price: parseFloat(row.start_price),
      end_price: parseFloat(row.end_price)
    }));

    const response = {
      timeframe,
      top_performers: topPerformers,
      last_updated: new Date().toISOString()
    };

    // 緩存數據（2分鐘）
    await redis.setex(cacheKey, 120, JSON.stringify(response));
    
    res.json(response);
  } catch (error) {
    console.error('Get top performers error:', error);
    res.status(500).json({ error: 'Failed to get top performers' });
  }
});

/**
 * @route GET /api/market/trending
 * @desc 獲取趨勢代幣（基於交易量）
 * @access Public
 */
router.get('/trending', async (req, res) => {
  try {
    const validationResult = marketQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: validationResult.error.errors
      });
    }

    const { timeframe, limit } = validationResult.data;

    // 檢查緩存
    const cacheKey = `market:trending:${timeframe}:${limit}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // 計算時間條件
    let timeCondition = '';
    switch (timeframe) {
      case '1h':
        timeCondition = "tr.timestamp >= NOW() - INTERVAL '1 hour'";
        break;
      case '24h':
        timeCondition = "tr.timestamp >= NOW() - INTERVAL '24 hours'";
        break;
      case '7d':
        timeCondition = "tr.timestamp >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        timeCondition = "tr.timestamp >= NOW() - INTERVAL '30 days'";
        break;
    }

    const query = `
      SELECT 
        t.address,
        t.name,
        t.symbol,
        t.current_price,
        t.market_cap,
        u.username as athlete_name,
        u.avatar_ipfs,
        COUNT(tr.id) as transaction_count,
        SUM(tr.amount * tr.price) as volume,
        COUNT(DISTINCT tr.user_id) as unique_traders
      FROM tokens t
      JOIN athletes a ON t.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN transactions tr ON t.address = tr.token_address
      WHERE ${timeCondition}
      GROUP BY t.address, t.name, t.symbol, t.current_price, t.market_cap, u.username, u.avatar_ipfs
      ORDER BY volume DESC, transaction_count DESC
      LIMIT $1
    `;

    const result = await db.query(query, [limit]);
    
    const trending = result.rows.map(row => ({
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      current_price: parseFloat(row.current_price),
      market_cap: parseFloat(row.market_cap),
      athlete_name: row.athlete_name,
      avatar_ipfs: row.avatar_ipfs,
      transaction_count: parseInt(row.transaction_count),
      volume: parseFloat(row.volume) || 0,
      unique_traders: parseInt(row.unique_traders)
    }));

    const response = {
      timeframe,
      trending_tokens: trending,
      last_updated: new Date().toISOString()
    };

    // 緩存數據（2分鐘）
    await redis.setex(cacheKey, 120, JSON.stringify(response));
    
    res.json(response);
  } catch (error) {
    console.error('Get trending tokens error:', error);
    res.status(500).json({ error: 'Failed to get trending tokens' });
  }
});

/**
 * @route GET /api/market/leaderboard
 * @desc 獲取市值排行榜
 * @access Public
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const validationResult = marketQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: validationResult.error.errors
      });
    }

    const { limit, page } = validationResult.data;
    const offset = (page - 1) * limit;

    // 檢查緩存
    const cacheKey = `market:leaderboard:${limit}:${page}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // 獲取排行榜數據
    const query = `
      SELECT 
        t.address,
        t.name,
        t.symbol,
        t.current_price,
        t.market_cap,
        t.total_supply,
        u.username as athlete_name,
        u.avatar_ipfs,
        a.sport,
        a.verification_status,
        COUNT(DISTINCT tr.user_id) as holder_count,
        COALESCE(SUM(
          CASE WHEN tr.timestamp >= NOW() - INTERVAL '24 hours' 
          THEN tr.amount * tr.price ELSE 0 END
        ), 0) as volume_24h
      FROM tokens t
      JOIN athletes a ON t.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN transactions tr ON t.address = tr.token_address
      GROUP BY t.address, t.name, t.symbol, t.current_price, t.market_cap, 
               t.total_supply, u.username, u.avatar_ipfs, a.sport, a.verification_status
      ORDER BY t.market_cap DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await db.query(query, [limit, offset]);
    
    // 獲取總數
    const countQuery = 'SELECT COUNT(*) as total FROM tokens';
    const countResult = await db.query(countQuery);
    const total = parseInt(countResult.rows[0].total);

    const leaderboard = result.rows.map((row, index) => ({
      rank: offset + index + 1,
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      current_price: parseFloat(row.current_price),
      market_cap: parseFloat(row.market_cap),
      total_supply: parseFloat(row.total_supply),
      athlete_name: row.athlete_name,
      avatar_ipfs: row.avatar_ipfs,
      sport: row.sport,
      verification_status: row.verification_status,
      holder_count: parseInt(row.holder_count),
      volume_24h: parseFloat(row.volume_24h)
    }));

    const response = {
      leaderboard,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      last_updated: new Date().toISOString()
    };

    // 緩存數據（3分鐘）
    await redis.setex(cacheKey, 180, JSON.stringify(response));
    
    res.json(response);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

/**
 * @route GET /api/market/search
 * @desc 搜索代幣和運動員
 * @access Public
 */
router.get('/search', async (req, res) => {
  try {
    const validationResult = searchSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid search parameters',
        details: validationResult.error.errors
      });
    }

    const { query, limit } = validationResult.data;
    const searchTerm = `%${query.toLowerCase()}%`;

    // 搜索代幣和運動員
    const searchQuery = `
      SELECT 
        t.address,
        t.name,
        t.symbol,
        t.current_price,
        t.market_cap,
        u.username as athlete_name,
        u.avatar_ipfs,
        a.sport,
        a.verification_status,
        'token' as result_type
      FROM tokens t
      JOIN athletes a ON t.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE 
        LOWER(t.name) LIKE $1 OR 
        LOWER(t.symbol) LIKE $1 OR 
        LOWER(u.username) LIKE $1 OR
        LOWER(a.sport) LIKE $1
      ORDER BY 
        CASE 
          WHEN LOWER(t.symbol) = LOWER($2) THEN 1
          WHEN LOWER(t.name) = LOWER($2) THEN 2
          WHEN LOWER(u.username) = LOWER($2) THEN 3
          WHEN LOWER(t.symbol) LIKE $1 THEN 4
          WHEN LOWER(t.name) LIKE $1 THEN 5
          WHEN LOWER(u.username) LIKE $1 THEN 6
          ELSE 7
        END,
        t.market_cap DESC
      LIMIT $3
    `;

    const result = await db.query(searchQuery, [searchTerm, query.toLowerCase(), limit]);
    
    const searchResults = result.rows.map(row => ({
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      current_price: parseFloat(row.current_price),
      market_cap: parseFloat(row.market_cap),
      athlete_name: row.athlete_name,
      avatar_ipfs: row.avatar_ipfs,
      sport: row.sport,
      verification_status: row.verification_status,
      result_type: row.result_type
    }));

    res.json({
      query,
      results: searchResults,
      total_results: searchResults.length
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

/**
 * @route GET /api/market/categories
 * @desc 獲取運動分類統計
 * @access Public
 */
router.get('/categories', async (req, res) => {
  try {
    // 檢查緩存
    const cacheKey = 'market:categories';
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    const query = `
      SELECT 
        a.sport,
        COUNT(t.id) as token_count,
        SUM(t.market_cap) as total_market_cap,
        AVG(t.current_price) as avg_price,
        COUNT(DISTINCT tr.user_id) as unique_traders,
        COALESCE(SUM(
          CASE WHEN tr.timestamp >= NOW() - INTERVAL '24 hours' 
          THEN tr.amount * tr.price ELSE 0 END
        ), 0) as volume_24h
      FROM athletes a
      JOIN tokens t ON a.id = t.athlete_id
      LEFT JOIN transactions tr ON t.address = tr.token_address
      WHERE a.sport IS NOT NULL AND a.sport != ''
      GROUP BY a.sport
      ORDER BY total_market_cap DESC
    `;

    const result = await db.query(query);
    
    const categories = result.rows.map(row => ({
      sport: row.sport,
      token_count: parseInt(row.token_count),
      total_market_cap: parseFloat(row.total_market_cap),
      average_price: parseFloat(row.avg_price),
      unique_traders: parseInt(row.unique_traders),
      volume_24h: parseFloat(row.volume_24h)
    }));

    const response = {
      categories,
      last_updated: new Date().toISOString()
    };

    // 緩存數據（10分鐘）
    await redis.setex(cacheKey, 600, JSON.stringify(response));
    
    res.json(response);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

/**
 * @route GET /api/market/stats/global
 * @desc 獲取全球統計數據
 * @access Public
 */
router.get('/stats/global', async (req, res) => {
  try {
    // 檢查緩存
    const cacheKey = 'market:stats:global';
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // 獲取全球統計
    const globalStatsQuery = `
      SELECT 
        COUNT(DISTINCT t.id) as total_tokens,
        COUNT(DISTINCT a.id) as total_athletes,
        COUNT(DISTINCT u.id) as total_users,
        SUM(t.market_cap) as total_market_cap,
        SUM(t.total_supply) as total_supply
      FROM tokens t
      JOIN athletes a ON t.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
    `;

    const globalResult = await db.query(globalStatsQuery);
    const globalStats = globalResult.rows[0];

    // 獲取交易統計
    const tradingStatsQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount * price) as total_volume,
        COUNT(DISTINCT user_id) as total_traders,
        COUNT(CASE WHEN timestamp >= NOW() - INTERVAL '24 hours' THEN 1 END) as transactions_24h,
        COALESCE(SUM(
          CASE WHEN timestamp >= NOW() - INTERVAL '24 hours' 
          THEN amount * price ELSE 0 END
        ), 0) as volume_24h
      FROM transactions
    `;

    const tradingResult = await db.query(tradingStatsQuery);
    const tradingStats = tradingResult.rows[0];

    // 獲取驗證統計
    const verificationStatsQuery = `
      SELECT 
        COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified_athletes,
        COUNT(CASE WHEN verification_status = 'pending' THEN 1 END) as pending_athletes,
        COUNT(CASE WHEN verification_status = 'rejected' THEN 1 END) as rejected_athletes
      FROM athletes
    `;

    const verificationResult = await db.query(verificationStatsQuery);
    const verificationStats = verificationResult.rows[0];

    const stats = {
      tokens: {
        total: parseInt(globalStats.total_tokens),
        total_market_cap: parseFloat(globalStats.total_market_cap) || 0,
        total_supply: parseFloat(globalStats.total_supply) || 0
      },
      users: {
        total_users: parseInt(globalStats.total_users),
        total_athletes: parseInt(globalStats.total_athletes),
        verified_athletes: parseInt(verificationStats.verified_athletes),
        pending_athletes: parseInt(verificationStats.pending_athletes),
        rejected_athletes: parseInt(verificationStats.rejected_athletes)
      },
      trading: {
        total_transactions: parseInt(tradingStats.total_transactions),
        total_volume: parseFloat(tradingStats.total_volume) || 0,
        total_traders: parseInt(tradingStats.total_traders),
        transactions_24h: parseInt(tradingStats.transactions_24h),
        volume_24h: parseFloat(tradingStats.volume_24h) || 0
      },
      last_updated: new Date().toISOString()
    };

    // 緩存數據（5分鐘）
    await redis.setex(cacheKey, 300, JSON.stringify(stats));
    
    res.json(stats);
  } catch (error) {
    console.error('Get global stats error:', error);
    res.status(500).json({ error: 'Failed to get global stats' });
  }
});

export default router;