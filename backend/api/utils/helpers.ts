import { isAddress } from 'viem';
import crypto from 'crypto';

/**
 * 驗證錢包地址格式
 * @param address 錢包地址
 * @returns 是否為有效地址
 */
export function validateWalletAddress(address: string): boolean {
  try {
    return isAddress(address);
  } catch {
    return false;
  }
}

/**
 * 計算聯合曲線價格
 * @param totalSupply 總供應量
 * @param currentPrice 當前價格
 * @param tradeAmount 交易數量
 * @param tradeType 交易類型（買入/賣出）
 * @returns 價格計算結果
 */
export function calculateBondingCurvePrice(
  totalSupply: number,
  currentPrice: number,
  tradeAmount: number,
  tradeType: 'buy' | 'sell'
) {
  // 聯合曲線參數
  const k = 0.0001; // 曲線斜率
  const basePrice = 0.001; // 基礎價格
  
  if (tradeType === 'buy') {
    // 買入時價格上升
    const newSupply = totalSupply + tradeAmount;
    const newPrice = basePrice + (k * newSupply * newSupply) / 1000000;
    
    // 計算平均價格（積分）
    const averagePrice = (currentPrice + newPrice) / 2;
    const totalCost = averagePrice * tradeAmount;
    const priceImpact = ((newPrice - currentPrice) / currentPrice) * 100;
    
    return {
      new_price: newPrice,
      average_price: averagePrice,
      total_cost: totalCost,
      price_impact: priceImpact,
      new_supply: newSupply
    };
  } else {
    // 賣出時價格下降
    const newSupply = Math.max(0, totalSupply - tradeAmount);
    const newPrice = Math.max(basePrice, basePrice + (k * newSupply * newSupply) / 1000000);
    
    // 計算平均價格
    const averagePrice = (currentPrice + newPrice) / 2;
    const totalReceived = averagePrice * tradeAmount;
    const priceImpact = ((currentPrice - newPrice) / currentPrice) * 100;
    
    return {
      new_price: newPrice,
      average_price: averagePrice,
      total_received: totalReceived,
      price_impact: priceImpact,
      new_supply: newSupply
    };
  }
}

/**
 * 計算用戶等級
 * @param cumulativeInvestment 累計投資金額
 * @returns 用戶等級（1-10）
 */
export function calculateUserLevel(cumulativeInvestment: number): number {
  // 每100 ETH投資提升一個等級，最高10級
  return Math.min(Math.floor(cumulativeInvestment / 100) + 1, 10);
}

/**
 * 計算等級權益
 * @param level 用戶等級
 * @returns 等級權益信息
 */
export function getLevelBenefits(level: number) {
  const benefits = {
    1: { discount: 0, priority: false, exclusive_access: false },
    2: { discount: 0.05, priority: false, exclusive_access: false },
    3: { discount: 0.1, priority: false, exclusive_access: false },
    4: { discount: 0.15, priority: true, exclusive_access: false },
    5: { discount: 0.2, priority: true, exclusive_access: false },
    6: { discount: 0.25, priority: true, exclusive_access: true },
    7: { discount: 0.3, priority: true, exclusive_access: true },
    8: { discount: 0.35, priority: true, exclusive_access: true },
    9: { discount: 0.4, priority: true, exclusive_access: true },
    10: { discount: 0.5, priority: true, exclusive_access: true }
  };
  
  return benefits[level as keyof typeof benefits] || benefits[1];
}

/**
 * 生成安全的隨機字符串
 * @param length 字符串長度
 * @returns 隨機字符串
 */
export function generateSecureRandom(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 計算文件哈希
 * @param buffer 文件緩衝區
 * @returns SHA256哈希值
 */
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 驗證文件類型
 * @param mimetype MIME類型
 * @param allowedTypes 允許的類型列表
 * @returns 是否為允許的類型
 */
export function validateFileType(mimetype: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimetype);
}

/**
 * 格式化錢包地址（顯示前6位和後4位）
 * @param address 錢包地址
 * @returns 格式化後的地址
 */
export function formatAddress(address: string): string {
  if (!validateWalletAddress(address)) {
    return address;
  }
  
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * 格式化數字（添加千分位分隔符）
 * @param num 數字
 * @param decimals 小數位數
 * @returns 格式化後的字符串
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

/**
 * 格式化貨幣
 * @param amount 金額
 * @param currency 貨幣符號
 * @returns 格式化後的貨幣字符串
 */
export function formatCurrency(amount: number, currency: string = 'ETH'): string {
  return `${formatNumber(amount, 4)} ${currency}`;
}

/**
 * 計算百分比變化
 * @param oldValue 舊值
 * @param newValue 新值
 * @returns 百分比變化
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * 驗證社交媒體URL
 * @param url URL地址
 * @param platform 平台名稱
 * @returns 是否為有效的社交媒體URL
 */
export function validateSocialMediaUrl(url: string, platform: string): boolean {
  const patterns = {
    twitter: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?$/,
    instagram: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?$/,
    tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+\/?$/,
    youtube: /^https?:\/\/(www\.)?(youtube\.com\/channel\/|youtube\.com\/c\/|youtube\.com\/user\/)[a-zA-Z0-9_-]+\/?$/
  };
  
  const pattern = patterns[platform as keyof typeof patterns];
  return pattern ? pattern.test(url) : false;
}

/**
 * 提取社交媒體用戶名
 * @param url 社交媒體URL
 * @param platform 平台名稱
 * @returns 用戶名或null
 */
export function extractSocialMediaUsername(url: string, platform: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    switch (platform) {
      case 'twitter':
        const twitterMatch = pathname.match(/^\/([a-zA-Z0-9_]+)\/?$/);
        return twitterMatch ? twitterMatch[1] : null;
        
      case 'instagram':
        const instagramMatch = pathname.match(/^\/([a-zA-Z0-9_.]+)\/?$/);
        return instagramMatch ? instagramMatch[1] : null;
        
      case 'tiktok':
        const tiktokMatch = pathname.match(/^\/@([a-zA-Z0-9_.]+)\/?$/);
        return tiktokMatch ? tiktokMatch[1] : null;
        
      case 'youtube':
        const youtubeMatch = pathname.match(/^\/(channel|c|user)\/([a-zA-Z0-9_-]+)\/?$/);
        return youtubeMatch ? youtubeMatch[2] : null;
        
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * 生成驗證碼
 * @param length 驗證碼長度
 * @returns 數字驗證碼
 */
export function generateVerificationCode(length: number = 6): string {
  const digits = '0123456789';
  let code = '';
  
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  
  return code;
}

/**
 * 驗證電子郵件格式
 * @param email 電子郵件地址
 * @returns 是否為有效格式
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 清理和驗證用戶輸入
 * @param input 用戶輸入
 * @param maxLength 最大長度
 * @returns 清理後的輸入
 */
export function sanitizeInput(input: string, maxLength: number = 255): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'&]/g, '') // 移除潛在的XSS字符
    .replace(/\s+/g, ' '); // 合併多個空格
}

/**
 * 計算文件大小的人類可讀格式
 * @param bytes 字節數
 * @returns 格式化的文件大小
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 生成IPFS哈希（模擬）
 * @param content 內容
 * @returns 模擬的IPFS哈希
 */
export function generateIPFSHash(content: string | Buffer): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `Qm${hash.substring(0, 44)}`; // 模擬IPFS哈希格式
}

/**
 * 驗證運動類型
 * @param sport 運動類型
 * @returns 是否為有效的運動類型
 */
export function validateSport(sport: string): boolean {
  const validSports = [
    'football', 'basketball', 'baseball', 'soccer', 'tennis',
    'golf', 'swimming', 'track_and_field', 'volleyball', 'hockey',
    'boxing', 'mma', 'wrestling', 'gymnastics', 'cycling',
    'skiing', 'snowboarding', 'surfing', 'skateboarding', 'climbing',
    'esports', 'chess', 'poker', 'other'
  ];
  
  return validSports.includes(sport.toLowerCase());
}

/**
 * 計算兩個日期之間的天數
 * @param date1 第一個日期
 * @param date2 第二個日期
 * @returns 天數差
 */
export function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
}

/**
 * 生成API密鑰
 * @returns API密鑰和哈希值
 */
export function generateApiKey(): { key: string; hash: string } {
  const key = `fdb_${generateSecureRandom(32)}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  
  return { key, hash };
}

/**
 * 驗證密碼強度
 * @param password 密碼
 * @returns 密碼強度評分（0-4）
 */
export function validatePasswordStrength(password: string): number {
  let score = 0;
  
  // 長度檢查
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  
  // 字符類型檢查
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  return Math.min(score, 4);
}

/**
 * 創建分頁信息
 * @param page 當前頁
 * @param limit 每頁數量
 * @param total 總數
 * @returns 分頁信息
 */
export function createPagination(page: number, limit: number, total: number) {
  const pages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  
  return {
    page,
    limit,
    total,
    pages,
    offset,
    has_prev: page > 1,
    has_next: page < pages
  };
}

/**
 * 延遲函數
 * @param ms 延遲毫秒數
 * @returns Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重試函數
 * @param fn 要重試的函數
 * @param maxRetries 最大重試次數
 * @param delayMs 重試間隔
 * @returns Promise
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries) {
        await delay(delayMs * Math.pow(2, i)); // 指數退避
      }
    }
  }
  
  throw lastError!;
}