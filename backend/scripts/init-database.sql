-- FrisbeDAO 數據庫初始化腳本
-- 創建所有必要的表和索引

-- 啟用必要的擴展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 用戶表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE,
    email VARCHAR(255),
    bio TEXT,
    avatar_ipfs VARCHAR(255),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 運動員表
CREATE TABLE IF NOT EXISTS athletes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    sport VARCHAR(50) NOT NULL,
    position VARCHAR(50),
    team VARCHAR(100),
    achievements TEXT[],
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verification_documents TEXT[],
    bio TEXT,
    stats JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 社交媒體認證表
CREATE TABLE IF NOT EXISTS social_authentications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('twitter', 'instagram', 'tiktok', 'youtube')),
    platform_user_id VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    profile_url VARCHAR(500) NOT NULL,
    followers_count INTEGER DEFAULT 0,
    access_token TEXT,
    refresh_token TEXT,
    verified_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

-- 社交媒體驗證請求表（手動驗證）
CREATE TABLE IF NOT EXISTS social_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('twitter', 'instagram', 'tiktok', 'youtube')),
    username VARCHAR(100) NOT NULL,
    profile_url VARCHAR(500) NOT NULL,
    verification_code VARCHAR(100) NOT NULL,
    followers_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

-- 代幣表
CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) UNIQUE NOT NULL,
    athlete_id INTEGER REFERENCES athletes(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL UNIQUE,
    total_supply DECIMAL(20, 8) NOT NULL,
    current_price DECIMAL(20, 8) NOT NULL DEFAULT 0.001,
    market_cap DECIMAL(20, 8) GENERATED ALWAYS AS (total_supply * current_price) STORED,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 交易表
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_address VARCHAR(42) REFERENCES tokens(address) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
    amount DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    tx_hash VARCHAR(66),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- 價格歷史表
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(42) REFERENCES tokens(address) ON DELETE CASCADE,
    price DECIMAL(20, 8) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    adjustment_reason VARCHAR(100)
);

-- 用戶等級表
CREATE TABLE IF NOT EXISTS user_levels (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    athlete_id INTEGER REFERENCES athletes(id) ON DELETE CASCADE,
    cumulative_investment DECIMAL(20, 8) DEFAULT 0,
    current_level INTEGER DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 10),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, athlete_id)
);

-- API密鑰表
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT TRUE,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

-- 文件上傳表
CREATE TABLE IF NOT EXISTS file_uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mimetype VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL,
    ipfs_hash VARCHAR(255),
    file_hash VARCHAR(64) NOT NULL,
    upload_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 系統配置表
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 審計日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

CREATE INDEX IF NOT EXISTS idx_athletes_user_id ON athletes(user_id);
CREATE INDEX IF NOT EXISTS idx_athletes_sport ON athletes(sport);
CREATE INDEX IF NOT EXISTS idx_athletes_verification_status ON athletes(verification_status);

CREATE INDEX IF NOT EXISTS idx_social_auth_user_platform ON social_authentications(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_social_auth_platform ON social_authentications(platform);

CREATE INDEX IF NOT EXISTS idx_tokens_address ON tokens(address);
CREATE INDEX IF NOT EXISTS idx_tokens_athlete_id ON tokens(athlete_id);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_market_cap ON tokens(market_cap DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_token_address ON transactions(token_address);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

CREATE INDEX IF NOT EXISTS idx_price_history_token_timestamp ON price_history(token_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_user_levels_user_athlete ON user_levels(user_id, athlete_id);
CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(current_level);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

CREATE INDEX IF NOT EXISTS idx_file_uploads_user_id ON file_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_ipfs_hash ON file_uploads(ipfs_hash);
CREATE INDEX IF NOT EXISTS idx_file_uploads_type ON file_uploads(upload_type);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 創建觸發器函數用於更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 為需要的表創建觸發器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_athletes_updated_at BEFORE UPDATE ON athletes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_auth_updated_at BEFORE UPDATE ON social_authentications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_verifications_updated_at BEFORE UPDATE ON social_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tokens_updated_at BEFORE UPDATE ON tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_levels_updated_at BEFORE UPDATE ON user_levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默認系統配置
INSERT INTO system_config (key, value, description) VALUES
('platform_fee_percentage', '2.5', '平台交易手續費百分比'),
('min_token_supply', '1000', '代幣最小發行量'),
('max_token_supply', '1000000', '代幣最大發行量'),
('base_token_price', '0.001', '代幣基礎價格（ETH）'),
('bonding_curve_k', '0.0001', '聯合曲線斜率參數'),
('max_price_impact', '10', '最大價格影響百分比'),
('verification_required_followers', '1000', '驗證所需最小粉絲數'),
('max_file_size_mb', '10', '最大文件上傳大小（MB）'),
('rate_limit_per_minute', '60', '每分鐘API請求限制'),
('jwt_expires_days', '7', 'JWT令牌過期天數')
ON CONFLICT (key) DO NOTHING;

-- 創建視圖：代幣統計
CREATE OR REPLACE VIEW token_stats AS
SELECT 
    t.address,
    t.name,
    t.symbol,
    t.current_price,
    t.market_cap,
    t.total_supply,
    u.username as athlete_name,
    a.sport,
    a.verification_status,
    COUNT(DISTINCT tr.user_id) as holder_count,
    COALESCE(SUM(CASE WHEN tr.timestamp >= NOW() - INTERVAL '24 hours' 
                 THEN tr.amount * tr.price ELSE 0 END), 0) as volume_24h,
    COALESCE(SUM(CASE WHEN tr.timestamp >= NOW() - INTERVAL '7 days' 
                 THEN tr.amount * tr.price ELSE 0 END), 0) as volume_7d,
    COUNT(CASE WHEN tr.timestamp >= NOW() - INTERVAL '24 hours' THEN 1 END) as transactions_24h
FROM tokens t
JOIN athletes a ON t.athlete_id = a.id
JOIN users u ON a.user_id = u.id
LEFT JOIN transactions tr ON t.address = tr.token_address
GROUP BY t.address, t.name, t.symbol, t.current_price, t.market_cap, 
         t.total_supply, u.username, a.sport, a.verification_status;

-- 創建視圖：用戶投資組合
CREATE OR REPLACE VIEW user_portfolios AS
SELECT 
    u.id as user_id,
    u.wallet_address,
    u.username,
    t.address as token_address,
    t.name as token_name,
    t.symbol as token_symbol,
    t.current_price,
    COALESCE(SUM(CASE WHEN tr.type = 'buy' THEN tr.amount 
                     WHEN tr.type = 'sell' THEN -tr.amount 
                     ELSE 0 END), 0) as balance,
    COALESCE(SUM(CASE WHEN tr.type = 'buy' THEN tr.amount * tr.price 
                     WHEN tr.type = 'sell' THEN -tr.amount * tr.price 
                     ELSE 0 END), 0) as total_invested,
    COALESCE(SUM(CASE WHEN tr.type = 'buy' THEN tr.amount 
                     WHEN tr.type = 'sell' THEN -tr.amount 
                     ELSE 0 END) * t.current_price, 0) as current_value
FROM users u
JOIN transactions tr ON u.id = tr.user_id
JOIN tokens t ON tr.token_address = t.address
GROUP BY u.id, u.wallet_address, u.username, t.address, t.name, t.symbol, t.current_price
HAVING SUM(CASE WHEN tr.type = 'buy' THEN tr.amount 
                WHEN tr.type = 'sell' THEN -tr.amount 
                ELSE 0 END) > 0;

-- 創建函數：計算用戶等級
CREATE OR REPLACE FUNCTION calculate_user_level(investment DECIMAL)
RETURNS INTEGER AS $$
BEGIN
    RETURN LEAST(FLOOR(investment / 100) + 1, 10);
END;
$$ LANGUAGE plpgsql;

-- 創建函數：更新代幣價格
CREATE OR REPLACE FUNCTION update_token_price(
    token_addr VARCHAR(42),
    new_price DECIMAL(20, 8),
    reason VARCHAR(100) DEFAULT 'manual_update'
)
RETURNS VOID AS $$
BEGIN
    -- 更新代幣價格
    UPDATE tokens SET current_price = new_price, updated_at = NOW() 
    WHERE address = token_addr;
    
    -- 記錄價格歷史
    INSERT INTO price_history (token_address, price, adjustment_reason)
    VALUES (token_addr, new_price, reason);
END;
$$ LANGUAGE plpgsql;

-- 創建函數：清理過期數據
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS VOID AS $$
BEGIN
    -- 清理過期的API密鑰
    UPDATE api_keys SET active = FALSE 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    -- 清理舊的審計日志（保留90天）
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- 清理舊的價格歷史（保留1年）
    DELETE FROM price_history WHERE timestamp < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- 創建定時任務（需要pg_cron擴展）
-- SELECT cron.schedule('cleanup-expired-data', '0 2 * * *', 'SELECT cleanup_expired_data();');

COMMIT;