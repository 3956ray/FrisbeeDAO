import axios from 'axios';

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

export class PinataService {
  private config: PinataConfig;
  private baseURL = 'https://api.pinata.cloud';

  constructor(config: PinataConfig) {
    this.config = config;
  }

  private getHeaders() {
    if (this.config.jwt) {
      return {
        'Authorization': `Bearer ${this.config.jwt}`,
        'Content-Type': 'application/json'
      };
    }
    return {
      'pinata_api_key': this.config.apiKey,
      'pinata_secret_api_key': this.config.secretApiKey,
      'Content-Type': 'application/json'
    };
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

      return response.data.IpfsHash;
    } catch (error) {
      console.error('Error uploading JSON to Pinata:', error);
      throw error;
    }
  }

  /**
   * 上传文件到 IPFS
   */
  async uploadFile(file: File, metadata?: PinataMetadata): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (metadata) {
        formData.append('pinataMetadata', JSON.stringify(metadata));
      }

      const headers = this.config.jwt 
        ? { 'Authorization': `Bearer ${this.config.jwt}` }
        : {
            'pinata_api_key': this.config.apiKey,
            'pinata_secret_api_key': this.config.secretApiKey
          };

      const response = await axios.post(
        `${this.baseURL}/pinning/pinFileToIPFS`,
        formData,
        { headers }
      );

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
}

// 创建默认实例
export const pinataService = new PinataService({
  apiKey: process.env.NEXT_PUBLIC_PINATA_API_KEY || '',
  secretApiKey: process.env.NEXT_PUBLIC_PINATA_SECRET_KEY || '',
  jwt: process.env.NEXT_PUBLIC_PINATA_JWT || ''
});

// 工具函数
export const getIPFSUrl = (hash: string) => `https://gateway.pinata.cloud/ipfs/${hash}`;

export const isValidIPFSHash = (hash: string): boolean => {
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(hash) || /^baf[a-z0-9]{56}$/.test(hash);
};