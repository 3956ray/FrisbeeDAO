import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

interface PinataConfig {
  apiKey: string;
  secretApiKey: string;
  jwt?: string;
}

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface PinataMetadata {
  name?: string;
  keyvalues?: Record<string, string>;
}

export class PinataIPFS {
  private config: PinataConfig;
  private baseURL = 'https://api.pinata.cloud';

  constructor(config: PinataConfig) {
    this.config = config;
  }

  private getHeaders(includeContentType = true) {
    const headers: Record<string, string> = {};
    
    if (this.config.jwt) {
      headers['Authorization'] = `Bearer ${this.config.jwt}`;
    } else {
      headers['pinata_api_key'] = this.config.apiKey;
      headers['pinata_secret_api_key'] = this.config.secretApiKey;
    }
    
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    
    return headers;
  }

  /**
   * 上传 JSON 数据到 IPFS
   */
  async uploadJSON(data: object, metadata?: PinataMetadata): Promise<string> {
    try {
      const body = {
        pinataContent: data,
        pinataMetadata: metadata || {}
      };

      const response = await axios.post(
        `${this.baseURL}/pinning/pinJSONToIPFS`,
        body,
        { headers: this.getHeaders() }
      );

      console.log(`JSON uploaded to IPFS: ${response.data.IpfsHash}`);
      return response.data.IpfsHash;
    } catch (error) {
      console.error('Error uploading JSON to Pinata:', error);
      throw error;
    }
  }

  /**
   * 上传文件到 IPFS
   */
  async uploadFile(filePath: string, metadata?: PinataMetadata): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      
      if (metadata) {
        formData.append('pinataMetadata', JSON.stringify(metadata));
      }

      const headers = this.getHeaders(false);
      // FormData 会自动设置 Content-Type
      delete headers['Content-Type'];

      const response = await axios.post(
        `${this.baseURL}/pinning/pinFileToIPFS`,
        formData,
        { 
          headers: {
            ...headers,
            ...formData.getHeaders()
          }
        }
      );

      console.log(`File uploaded to IPFS: ${response.data.IpfsHash}`);
      return response.data.IpfsHash;
    } catch (error) {
      console.error('Error uploading file to Pinata:', error);
      throw error;
    }
  }

  /**
   * 从 IPFS 获取数据
   */
  async getData(ipfsHash: string): Promise<any> {
    try {
      const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching data from IPFS:', error);
      throw error;
    }
  }

  /**
   * 取消固定文件
   */
  async unpinFile(ipfsHash: string): Promise<boolean> {
    try {
      await axios.delete(
        `${this.baseURL}/pinning/unpin/${ipfsHash}`,
        { headers: this.getHeaders() }
      );
      console.log(`File unpinned: ${ipfsHash}`);
      return true;
    } catch (error) {
      console.error('Error unpinning file:', error);
      return false;
    }
  }

  /**
   * 获取固定的文件列表
   */
  async getPinnedFiles(limit = 10, offset = 0): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseURL}/data/pinList?pageLimit=${limit}&pageOffset=${offset}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting pinned files:', error);
      throw error;
    }
  }

  /**
   * 验证 IPFS 哈希格式
   */
  static isValidIPFSHash(hash: string): boolean {
    return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(hash) || /^baf[a-z0-9]{56}$/.test(hash);
  }

  /**
   * 获取 IPFS URL
   */
  static getIPFSUrl(hash: string, gateway = 'https://gateway.pinata.cloud/ipfs/'): string {
    return `${gateway}${hash}`;
  }
}

// 工具函数
export const createPinataInstance = (): PinataIPFS => {
  const config: PinataConfig = {
    apiKey: process.env.PINATA_API_KEY || '',
    secretApiKey: process.env.PINATA_SECRET_KEY || '',
    jwt: process.env.PINATA_JWT || ''
  };

  if (!config.apiKey && !config.jwt) {
    throw new Error('Pinata API key or JWT token is required');
  }

  return new PinataIPFS(config);
};

// 运动员数据相关的工具函数
export const uploadAthleteProfile = async (
  pinata: PinataIPFS,
  athleteData: {
    name: string;
    sport: string;
    bio?: string;
    avatar?: string;
    achievements?: any[];
    stats?: any;
    socialLinks?: Record<string, string>;
  }
): Promise<string> => {
  const metadata = {
    name: `athlete-profile-${athleteData.name}`,
    keyvalues: {
      type: 'athlete-profile',
      name: athleteData.name,
      sport: athleteData.sport,
      uploadedAt: new Date().toISOString()
    }
  };
  
  return await pinata.uploadJSON(athleteData, metadata);
};

export const uploadAchievement = async (
  pinata: PinataIPFS,
  achievementData: {
    title: string;
    description: string;
    date: string;
    athleteAddress: string;
    evidence?: string;
    metadata?: any;
  }
): Promise<string> => {
  const metadata = {
    name: `achievement-${achievementData.title}`,
    keyvalues: {
      type: 'achievement',
      title: achievementData.title,
      date: achievementData.date,
      athlete: achievementData.athleteAddress,
      uploadedAt: new Date().toISOString()
    }
  };
  
  return await pinata.uploadJSON(achievementData, metadata);
};

export const uploadTokenMetadata = async (
  pinata: PinataIPFS,
  tokenData: {
    name: string;
    description: string;
    image: string;
    attributes?: any[];
    external_url?: string;
    background_color?: string;
    animation_url?: string;
  }
): Promise<string> => {
  const metadata = {
    name: `token-metadata-${tokenData.name}`,
    keyvalues: {
      type: 'token-metadata',
      name: tokenData.name,
      uploadedAt: new Date().toISOString()
    }
  };
  
  return await pinata.uploadJSON(tokenData, metadata);
};