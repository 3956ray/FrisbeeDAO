import { Request } from 'express';

// 擴展 Express Request 類型
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    wallet_address: string;
    username?: string;
    role: 'user' | 'admin' | 'moderator';
  };
  apiKey?: {
    id: number;
    user_id: number;
    permissions: string[];
  };
}

// 用戶相關類型
export interface User {
  id: number;
  wallet_address: string;
  username?: string;
  email?: string;
  bio?: string;
  avatar_ipfs?: string;
  role: 'user' | 'admin' | 'moderator';
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  wallet_address: string;
  username?: string;
  email?: string;
  bio?: string;
  role?: 'user' | 'admin' | 'moderator';
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  bio?: string;
  avatar_ipfs?: string;
}

// 運動員相關類型
export interface Athlete {
  id: number;
  user_id: number;
  sport: string;
  position?: string;
  team?: string;
  achievements: string[];
  verification_status: 'pending' | 'verified' | 'rejected';
  verification_documents: string[];
  bio?: string;
  stats: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAthleteData {
  user_id: number;
  sport: string;
  position?: string;
  team?: string;
  achievements?: string[];
  bio?: string;
  stats?: Record<string, any>;
}

export interface UpdateAthleteData {
  sport?: string;
  position?: string;
  team?: string;
  achievements?: string[];
  bio?: string;
  stats?: Record<string, any>;
}

// 社交媒體認證類型
export interface SocialAuthentication {
  id: number;
  user_id: number;
  platform: 'twitter' | 'instagram' | 'tiktok' | 'youtube';
  platform_user_id: string;
  username: string;
  profile_url: string;
  followers_count: number;
  access_token?: string;
  refresh_token?: string;
  verified_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SocialVerification {
  id: number;
  user_id: number;
  platform: 'twitter' | 'instagram' | 'tiktok' | 'youtube';
  username: string;
  profile_url: string;
  verification_code: string;
  followers_count: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSocialVerificationData {
  platform: 'twitter' | 'instagram' | 'tiktok' | 'youtube';
  username: string;
  profile_url: string;
  followers_count: number;
}

// 代幣相關類型
export interface Token {
  id: number;
  address: string;
  athlete_id: number;
  name: string;
  symbol: string;
  total_supply: string;
  current_price: string;
  market_cap: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTokenData {
  athlete_id: number;
  name: string;
  symbol: string;
  total_supply: string;
  initial_price?: string;
}

export interface TokenStats {
  address: string;
  name: string;
  symbol: string;
  current_price: string;
  market_cap: string;
  total_supply: string;
  athlete_name: string;
  sport: string;
  verification_status: string;
  holder_count: number;
  volume_24h: string;
  volume_7d: string;
  transactions_24h: number;
}

// 交易相關類型
export interface Transaction {
  id: number;
  user_id: number;
  token_address: string;
  type: 'buy' | 'sell';
  amount: string;
  price: string;
  tx_hash?: string;
  timestamp: Date;
}

export interface CreateTransactionData {
  user_id: number;
  token_address: string;
  type: 'buy' | 'sell';
  amount: string;
  price: string;
  tx_hash?: string;
}

// 價格歷史類型
export interface PriceHistory {
  id: number;
  token_address: string;
  price: string;
  timestamp: Date;
  adjustment_reason?: string;
}

// 用戶等級類型
export interface UserLevel {
  id: number;
  user_id: number;
  athlete_id: number;
  cumulative_investment: string;
  current_level: number;
  updated_at: Date;
}

// 用戶投資組合類型
export interface UserPortfolio {
  user_id: number;
  wallet_address: string;
  username?: string;
  token_address: string;
  token_name: string;
  token_symbol: string;
  current_price: string;
  balance: string;
  total_invested: string;
  current_value: string;
}

// API 密鑰類型
export interface ApiKey {
  id: number;
  user_id: number;
  name: string;
  key_hash: string;
  permissions: string[];
  active: boolean;
  last_used?: Date;
  created_at: Date;
  expires_at?: Date;
}

export interface CreateApiKeyData {
  name: string;
  permissions?: string[];
  expires_at?: Date;
}

// 文件上傳類型
export interface FileUpload {
  id: number;
  user_id: number;
  filename: string;
  original_name: string;
  mimetype: string;
  size: number;
  ipfs_hash?: string;
  file_hash: string;
  upload_type: string;
  created_at: Date;
}

// 通知類型
export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  created_at: Date;
}

export interface CreateNotificationData {
  user_id: number;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}

// 系統配置類型
export interface SystemConfig {
  id: number;
  key: string;
  value: string;
  description?: string;
  updated_at: Date;
}

// 審計日誌類型
export interface AuditLog {
  id: number;
  user_id?: number;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface CreateAuditLogData {
  user_id?: number;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

// API 響應類型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface SearchParams extends PaginationParams {
  q?: string;
  filters?: Record<string, any>;
}

// 市場數據類型
export interface MarketOverview {
  total_tokens: number;
  total_market_cap: string;
  total_volume_24h: string;
  total_transactions_24h: number;
  top_gainers: TokenStats[];
  top_losers: TokenStats[];
}

export interface SportStats {
  sport: string;
  token_count: number;
  total_market_cap: string;
  avg_price: string;
  volume_24h: string;
}

// 聯合曲線參數類型
export interface BondingCurveParams {
  k: number; // 斜率參數
  basePrice: number; // 基礎價格
  supply: number; // 當前供應量
}

// 價格計算結果類型
export interface PriceCalculation {
  newPrice: number;
  priceImpact: number;
  totalCost: number;
  averagePrice: number;
}

// JWT 載荷類型
export interface JwtPayload {
  userId: number;
  walletAddress: string;
  role: string;
  iat?: number;
  exp?: number;
}

// 錢包簽名驗證類型
export interface SignatureVerification {
  message: string;
  signature: string;
  address: string;
  nonce: string;
  timestamp: number;
}

// OAuth 配置類型
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
}

// 社交媒體平台配置
export interface SocialPlatformConfig {
  twitter: OAuthConfig;
  instagram: OAuthConfig;
  tiktok: OAuthConfig;
  youtube: OAuthConfig;
}

// 錯誤類型
export interface ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: any;
}

// 健康檢查類型
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    postgres: boolean;
    redis: boolean;
    blockchain?: boolean;
  };
  uptime: number;
  version: string;
}

// WebSocket 事件類型
export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: number;
  userId?: number;
}

// 速率限制配置類型
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

// 文件驗證結果類型
export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileInfo?: {
    size: number;
    mimetype: string;
    hash: string;
  };
}