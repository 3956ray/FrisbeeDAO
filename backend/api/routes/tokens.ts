import express from 'express';
import { db, redis } from '../server';
import { authenticateWallet } from '../middleware/auth';
import { validateWalletAddress, calculateBondingCurvePrice } from '../utils/helpers';
import { z } from 'zod';
import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { polygonZkEvmTestnet } from 'viem/chains';

const router = express.Router();

// 驗證模式
const tokenCreationSchema = z.object({
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10).toUpperCase(),
  initialSupply: z.number().min(1000).max(1000000),
});

const tradeSchema = z.object({
  amount: z.string().refine((val) => {
    try {
      const num = parseFloat(val);
      return num > 0;
    } catch {
      return false;
    }
  }, 'Invalid amount'),
  slippage: z.number().min(0.1).max(10).optional().default(2), // 滑點百分比
});

// Viem 客戶端
const publicClient = createPublicClient({
  chain: polygonZkEvmTestnet,
  transport: http(process.env.POLYGON_ZKEVM_TESTNET_RPC_URL || 'https://rpc.public.zkevm-test.net')
});

/**
 * @route POST /api/tokens/create
 * @desc 創建個人代幣
 * @access Private (只有已認證的運動員)
 */
router.post('/create', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 驗證請求數據
    const validationResult = tokenCreationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }

    const { name, symbol, initialSupply } = validationResult.data;

    // 檢查是否為已認證的運動員
    const athleteQuery = `
      SELECT a.id, a.verification_status
      FROM athletes a
      JOIN users u ON a.user_id = u.id
      WHERE u.wallet_address = $1
    `;
    
    const athleteResult = await db.query(athleteQuery, [walletAddress]);
    
    if (athleteResult.rows.length === 0) {
      return res.status(403).json({ error: 'Only registered athletes can create tokens' });
    }

    const athlete = athleteResult.rows[0];
    
    if (athlete.verification_status !== 'verified') {
      return res.status(403).json({ error: 'Only verified athletes can create tokens' });
    }

    // 檢查是否已經創建過代幣
    const existingTokenQuery = 'SELECT address FROM tokens WHERE athlete_id = $1';
    const existingResult = await db.query(existingTokenQuery, [athlete.id]);
    
    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'Athlete already has a token' });
    }

    // 檢查代幣符號是否已被使用
    const symbolQuery = 'SELECT address FROM tokens WHERE symbol = $1';
    const symbolResult = await db.query(symbolQuery, [symbol]);
    
    if (symbolResult.rows.length > 0) {
      return res.status(409).json({ error: 'Token symbol already exists' });
    }

    // 這裡應該調用智能合約創建代幣
    // 暫時使用模擬地址
    const tokenAddress = `0x${Math.random().toString(16).substr(2, 40)}`;
    const initialPrice = 0.001; // 初始價格 0.001 ETH
    const marketCap = initialSupply * initialPrice;

    // 保存代幣信息到數據庫
    const insertQuery = `
      INSERT INTO tokens (
        address, athlete_id, name, symbol, total_supply, 
        current_price, market_cap, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;

    const result = await db.query(insertQuery, [
      tokenAddress, athlete.id, name, symbol, initialSupply,
      initialPrice, marketCap
    ]);

    const token = result.rows[0];

    // 清除相關緩存
    await redis.del(`athlete:${walletAddress}`);
    await redis.del('market:top10');
    await redis.del('market:trending');

    res.status(201).json({
      message: 'Token created successfully',
      token: {
        ...token,
        total_supply: parseFloat(token.total_supply),
        current_price: parseFloat(token.current_price),
        market_cap: parseFloat(token.market_cap)
      }
    });
  } catch (error) {
    console.error('Token creation error:', error);
    res.status(500).json({ error: 'Failed to create token' });
  }
});

/**
 * @route GET /api/tokens/:address/price
 * @desc 獲取代幣實時價格
 * @access Public
 */
router.get('/:address/price', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!validateWalletAddress(address)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    // 檢查緩存
    const cacheKey = `token:price:${address}`;
    const cachedPrice = await redis.get(cacheKey);
    
    if (cachedPrice) {
      return res.json(JSON.parse(cachedPrice));
    }

    // 從數據庫獲取代幣信息
    const query = `
      SELECT 
        t.*,
        u.username as athlete_name
      FROM tokens t
      JOIN athletes a ON t.athlete_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE t.address = $1
    `;

    const result = await db.query(query, [address]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const token = result.rows[0];
    
    // 獲取最新價格歷史（用於計算變化）
    const priceHistoryQuery = `
      SELECT price, timestamp
      FROM price_history 
      WHERE token_address = $1 
      ORDER BY timestamp DESC 
      LIMIT 2
    `;
    
    const historyResult = await db.query(priceHistoryQuery, [address]);
    
    let priceChange24h = 0;
    if (historyResult.rows.length >= 2) {
      const currentPrice = parseFloat(historyResult.rows[0].price);
      const previousPrice = parseFloat(historyResult.rows[1].price);
      priceChange24h = ((currentPrice - previousPrice) / previousPrice) * 100;
    }

    const priceData = {
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      athlete_name: token.athlete_name,
      current_price: parseFloat(token.current_price),
      market_cap: parseFloat(token.market_cap),
      total_supply: parseFloat(token.total_supply),
      price_change_24h: priceChange24h,
      last_updated: token.updated_at
    };

    // 緩存價格數據
    await redis.setex(cacheKey, 60, JSON.stringify(priceData)); // 1分鐘緩存
    
    res.json(priceData);
  } catch (error) {
    console.error('Get token price error:', error);
    res.status(500).json({ error: 'Failed to get token price' });
  }
});

/**
 * @route GET /api/tokens/:address/curve-price
 * @desc 計算聯合曲線價格
 * @access Public
 */
router.get('/:address/curve-price', async (req, res) => {
  try {
    const { address } = req.params;
    const { amount, type = 'buy' } = req.query;
    
    if (!validateWalletAddress(address)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    if (!amount || isNaN(parseFloat(amount as string))) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // 獲取代幣信息
    const tokenQuery = 'SELECT * FROM tokens WHERE address = $1';
    const tokenResult = await db.query(tokenQuery, [address]);
    
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const token = tokenResult.rows[0];
    const tradeAmount = parseFloat(amount as string);
    
    // 計算聯合曲線價格
    const priceData = calculateBondingCurvePrice(
      parseFloat(token.total_supply),
      parseFloat(token.current_price),
      tradeAmount,
      type as 'buy' | 'sell'
    );

    res.json({
      token_address: address,
      trade_type: type,
      amount: tradeAmount,
      ...priceData
    });
  } catch (error) {
    console.error('Calculate curve price error:', error);
    res.status(500).json({ error: 'Failed to calculate curve price' });
  }
});

/**
 * @route GET /api/tokens/:address/history
 * @desc 獲取價格歷史
 * @access Public
 */
router.get('/:address/history', async (req, res) => {
  try {
    const { address } = req.params;
    const { timeframe = '24h', limit = 100 } = req.query;
    
    if (!validateWalletAddress(address)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    // 計算時間範圍
    let timeCondition = '';
    switch (timeframe) {
      case '1h':
        timeCondition = "timestamp >= NOW() - INTERVAL '1 hour'";
        break;
      case '24h':
        timeCondition = "timestamp >= NOW() - INTERVAL '24 hours'";
        break;
      case '7d':
        timeCondition = "timestamp >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        timeCondition = "timestamp >= NOW() - INTERVAL '30 days'";
        break;
      default:
        timeCondition = "timestamp >= NOW() - INTERVAL '24 hours'";
    }

    const query = `
      SELECT price, timestamp, adjustment_reason
      FROM price_history 
      WHERE token_address = $1 AND ${timeCondition}
      ORDER BY timestamp ASC
      LIMIT $2
    `;

    const result = await db.query(query, [address, parseInt(limit as string)]);
    
    const history = result.rows.map(row => ({
      price: parseFloat(row.price),
      timestamp: row.timestamp,
      adjustment_reason: row.adjustment_reason
    }));

    res.json({
      token_address: address,
      timeframe,
      history
    });
  } catch (error) {
    console.error('Get price history error:', error);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

/**
 * @route POST /api/tokens/buy
 * @desc 購買代幣（聯合曲線）
 * @access Private
 */
router.post('/buy', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    const { tokenAddress, amount, slippage } = req.body;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 驗證請求數據
    const validationResult = tradeSchema.safeParse({ amount, slippage });
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }

    if (!validateWalletAddress(tokenAddress)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    // 獲取用戶ID
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [walletAddress]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const tradeAmount = parseFloat(amount);

    // 獲取代幣信息
    const tokenQuery = 'SELECT * FROM tokens WHERE address = $1';
    const tokenResult = await db.query(tokenQuery, [tokenAddress]);
    
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const token = tokenResult.rows[0];
    
    // 計算購買價格
    const priceData = calculateBondingCurvePrice(
      parseFloat(token.total_supply),
      parseFloat(token.current_price),
      tradeAmount,
      'buy'
    );

    // 檢查滑點
    const maxPrice = priceData.average_price * (1 + slippage / 100);
    if (priceData.average_price > maxPrice) {
      return res.status(400).json({ 
        error: 'Price impact exceeds slippage tolerance',
        expected_price: priceData.average_price,
        max_price: maxPrice
      });
    }

    // 這裡應該調用智能合約執行交易
    // 暫時模擬交易成功
    const txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    
    // 記錄交易
    const transactionQuery = `
      INSERT INTO transactions (
        user_id, token_address, type, amount, price, 
        timestamp, tx_hash
      )
      VALUES ($1, $2, 'buy', $3, $4, NOW(), $5)
      RETURNING *
    `;

    const transactionResult = await db.query(transactionQuery, [
      userId, tokenAddress, tradeAmount, priceData.average_price, txHash
    ]);

    // 更新代幣價格
    const updateTokenQuery = `
      UPDATE tokens 
      SET current_price = $1, market_cap = $2, updated_at = NOW()
      WHERE address = $3
    `;
    
    await db.query(updateTokenQuery, [
      priceData.new_price,
      priceData.new_price * parseFloat(token.total_supply),
      tokenAddress
    ]);

    // 記錄價格歷史
    const priceHistoryQuery = `
      INSERT INTO price_history (token_address, price, timestamp, adjustment_reason)
      VALUES ($1, $2, NOW(), 'buy_transaction')
    `;
    
    await db.query(priceHistoryQuery, [tokenAddress, priceData.new_price]);

    // 更新用戶等級
    const updateLevelQuery = `
      INSERT INTO user_levels (user_id, athlete_id, cumulative_investment, current_level, updated_at)
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT (user_id, athlete_id) 
      DO UPDATE SET 
        cumulative_investment = user_levels.cumulative_investment + $3,
        current_level = LEAST(FLOOR((user_levels.cumulative_investment + $3) / 100) + 1, 10),
        updated_at = NOW()
    `;
    
    await db.query(updateLevelQuery, [userId, token.athlete_id, priceData.total_cost]);

    // 清除相關緩存
    await redis.del(`token:price:${tokenAddress}`);
    await redis.del(`user:stats:${walletAddress}`);
    await redis.del('market:top10');
    await redis.del('market:trending');

    res.json({
      message: 'Token purchase successful',
      transaction: {
        ...transactionResult.rows[0],
        amount: parseFloat(transactionResult.rows[0].amount),
        price: parseFloat(transactionResult.rows[0].price)
      },
      price_data: priceData,
      tx_hash: txHash
    });
  } catch (error) {
    console.error('Buy token error:', error);
    res.status(500).json({ error: 'Failed to buy token' });
  }
});

/**
 * @route POST /api/tokens/sell
 * @desc 售出代幣（聯合曲線）
 * @access Private
 */
router.post('/sell', authenticateWallet, async (req, res) => {
  try {
    const walletAddress = req.user?.address;
    const { tokenAddress, amount, slippage } = req.body;
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address not found' });
    }

    // 驗證請求數據
    const validationResult = tradeSchema.safeParse({ amount, slippage });
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }

    if (!validateWalletAddress(tokenAddress)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    // 獲取用戶ID
    const userQuery = 'SELECT id FROM users WHERE wallet_address = $1';
    const userResult = await db.query(userQuery, [walletAddress]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const tradeAmount = parseFloat(amount);

    // 檢查用戶是否持有足夠的代幣
    const balanceQuery = `
      SELECT COALESCE(SUM(
        CASE 
          WHEN type = 'buy' THEN amount 
          WHEN type = 'sell' THEN -amount 
          ELSE 0 
        END
      ), 0) as balance
      FROM transactions 
      WHERE user_id = $1 AND token_address = $2
    `;
    
    const balanceResult = await db.query(balanceQuery, [userId, tokenAddress]);
    const balance = parseFloat(balanceResult.rows[0].balance);
    
    if (balance < tradeAmount) {
      return res.status(400).json({ 
        error: 'Insufficient token balance',
        balance,
        requested: tradeAmount
      });
    }

    // 獲取代幣信息
    const tokenQuery = 'SELECT * FROM tokens WHERE address = $1';
    const tokenResult = await db.query(tokenQuery, [tokenAddress]);
    
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const token = tokenResult.rows[0];
    
    // 計算售出價格
    const priceData = calculateBondingCurvePrice(
      parseFloat(token.total_supply),
      parseFloat(token.current_price),
      tradeAmount,
      'sell'
    );

    // 檢查滑點
    const minPrice = priceData.average_price * (1 - slippage / 100);
    if (priceData.average_price < minPrice) {
      return res.status(400).json({ 
        error: 'Price impact exceeds slippage tolerance',
        expected_price: priceData.average_price,
        min_price: minPrice
      });
    }

    // 這裡應該調用智能合約執行交易
    // 暫時模擬交易成功
    const txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    
    // 記錄交易
    const transactionQuery = `
      INSERT INTO transactions (
        user_id, token_address, type, amount, price, 
        timestamp, tx_hash
      )
      VALUES ($1, $2, 'sell', $3, $4, NOW(), $5)
      RETURNING *
    `;

    const transactionResult = await db.query(transactionQuery, [
      userId, tokenAddress, tradeAmount, priceData.average_price, txHash
    ]);

    // 更新代幣價格
    const updateTokenQuery = `
      UPDATE tokens 
      SET current_price = $1, market_cap = $2, updated_at = NOW()
      WHERE address = $3
    `;
    
    await db.query(updateTokenQuery, [
      priceData.new_price,
      priceData.new_price * parseFloat(token.total_supply),
      tokenAddress
    ]);

    // 記錄價格歷史
    const priceHistoryQuery = `
      INSERT INTO price_history (token_address, price, timestamp, adjustment_reason)
      VALUES ($1, $2, NOW(), 'sell_transaction')
    `;
    
    await db.query(priceHistoryQuery, [tokenAddress, priceData.new_price]);

    // 清除相關緩存
    await redis.del(`token:price:${tokenAddress}`);
    await redis.del(`user:stats:${walletAddress}`);
    await redis.del('market:top10');
    await redis.del('market:trending');

    res.json({
      message: 'Token sale successful',
      transaction: {
        ...transactionResult.rows[0],
        amount: parseFloat(transactionResult.rows[0].amount),
        price: parseFloat(transactionResult.rows[0].price)
      },
      price_data: priceData,
      tx_hash: txHash
    });
  } catch (error) {
    console.error('Sell token error:', error);
    res.status(500).json({ error: 'Failed to sell token' });
  }
});

/**
 * @route GET /api/tokens/:address/holders
 * @desc 獲取持有者列表
 * @access Public
 */
router.get('/:address/holders', async (req, res) => {
  try {
    const { address } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    if (!validateWalletAddress(address)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // 查詢持有者列表
    const query = `
      SELECT 
        u.wallet_address,
        u.username,
        u.avatar_ipfs,
        COALESCE(SUM(
          CASE 
            WHEN t.type = 'buy' THEN t.amount 
            WHEN t.type = 'sell' THEN -t.amount 
            ELSE 0 
          END
        ), 0) as balance,
        COALESCE(SUM(
          CASE 
            WHEN t.type = 'buy' THEN t.amount * t.price 
            WHEN t.type = 'sell' THEN -t.amount * t.price 
            ELSE 0 
          END
        ), 0) as total_invested,
        MAX(t.timestamp) as last_transaction
      FROM users u
      JOIN transactions t ON u.id = t.user_id
      WHERE t.token_address = $1
      GROUP BY u.id, u.wallet_address, u.username, u.avatar_ipfs
      HAVING SUM(
        CASE 
          WHEN t.type = 'buy' THEN t.amount 
          WHEN t.type = 'sell' THEN -t.amount 
          ELSE 0 
        END
      ) > 0
      ORDER BY balance DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [address, parseInt(limit as string), offset]);
    
    // 獲取總持有者數
    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT u.id
        FROM users u
        JOIN transactions t ON u.id = t.user_id
        WHERE t.token_address = $1
        GROUP BY u.id
        HAVING SUM(
          CASE 
            WHEN t.type = 'buy' THEN t.amount 
            WHEN t.type = 'sell' THEN -t.amount 
            ELSE 0 
          END
        ) > 0
      ) as holders
    `;
    
    const countResult = await db.query(countQuery, [address]);
    const total = parseInt(countResult.rows[0].total);

    const holders = result.rows.map(row => ({
      wallet_address: row.wallet_address,
      username: row.username,
      avatar_ipfs: row.avatar_ipfs,
      balance: parseFloat(row.balance),
      total_invested: parseFloat(row.total_invested),
      last_transaction: row.last_transaction
    }));

    res.json({
      token_address: address,
      holders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Get token holders error:', error);
    res.status(500).json({ error: 'Failed to get token holders' });
  }
});

export default router;