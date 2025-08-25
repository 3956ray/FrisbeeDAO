import { useState, useCallback } from 'react';
import { pinataService, getIPFSUrl, isValidIPFSHash } from '@/lib/pinata';

interface UploadState {
  loading: boolean;
  error: string | null;
  ipfsHash: string | null;
}

interface UsePinataReturn {
  uploadState: UploadState;
  uploadJSON: (data: object, metadata?: any) => Promise<string | null>;
  uploadFile: (file: File, metadata?: any) => Promise<string | null>;
  getData: (ipfsHash: string) => Promise<any>;
  getFileUrl: (ipfsHash: string) => string;
  isValidHash: (hash: string) => boolean;
  resetState: () => void;
}

export const usePinata = (): UsePinataReturn => {
  const [uploadState, setUploadState] = useState<UploadState>({
    loading: false,
    error: null,
    ipfsHash: null
  });

  const resetState = useCallback(() => {
    setUploadState({
      loading: false,
      error: null,
      ipfsHash: null
    });
  }, []);

  const uploadJSON = useCallback(async (data: object, metadata?: any): Promise<string | null> => {
    setUploadState({ loading: true, error: null, ipfsHash: null });
    
    try {
      const hash = await pinataService.uploadJSON(data, metadata);
      setUploadState({ loading: false, error: null, ipfsHash: hash });
      return hash;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadState({ loading: false, error: errorMessage, ipfsHash: null });
      return null;
    }
  }, []);

  const uploadFile = useCallback(async (file: File, metadata?: any): Promise<string | null> => {
    setUploadState({ loading: true, error: null, ipfsHash: null });
    
    try {
      const hash = await pinataService.uploadFile(file, metadata);
      setUploadState({ loading: false, error: null, ipfsHash: hash });
      return hash;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadState({ loading: false, error: errorMessage, ipfsHash: null });
      return null;
    }
  }, []);

  const getData = useCallback(async (ipfsHash: string): Promise<any> => {
    try {
      return await pinataService.getData(ipfsHash);
    } catch (error) {
      console.error('Error fetching data:', error);
      throw error;
    }
  }, []);

  const getFileUrl = useCallback((ipfsHash: string): string => {
    return getIPFSUrl(ipfsHash);
  }, []);

  const isValidHash = useCallback((hash: string): boolean => {
    return isValidIPFSHash(hash);
  }, []);

  return {
    uploadState,
    uploadJSON,
    uploadFile,
    getData,
    getFileUrl,
    isValidHash,
    resetState
  };
};

// 专门用于运动员数据的 Hook
export const useAthleteIPFS = () => {
  const pinata = usePinata();

  const uploadAthleteProfile = useCallback(async (athleteData: {
    name: string;
    bio?: string;
    avatar?: string;
    achievements?: any[];
    stats?: any;
  }) => {
    const metadata = {
      name: `athlete-profile-${athleteData.name}`,
      keyvalues: {
        type: 'athlete-profile',
        name: athleteData.name
      }
    };
    
    return await pinata.uploadJSON(athleteData, metadata);
  }, [pinata]);

  const uploadAchievement = useCallback(async (achievementData: {
    title: string;
    description: string;
    date: string;
    evidence?: string;
    metadata?: any;
  }) => {
    const metadata = {
      name: `achievement-${achievementData.title}`,
      keyvalues: {
        type: 'achievement',
        title: achievementData.title,
        date: achievementData.date
      }
    };
    
    return await pinata.uploadJSON(achievementData, metadata);
  }, [pinata]);

  const uploadTokenMetadata = useCallback(async (tokenData: {
    name: string;
    description: string;
    image: string;
    attributes?: any[];
    external_url?: string;
  }) => {
    const metadata = {
      name: `token-metadata-${tokenData.name}`,
      keyvalues: {
        type: 'token-metadata',
        name: tokenData.name
      }
    };
    
    return await pinata.uploadJSON(tokenData, metadata);
  }, [pinata]);

  return {
    ...pinata,
    uploadAthleteProfile,
    uploadAchievement,
    uploadTokenMetadata
  };
};