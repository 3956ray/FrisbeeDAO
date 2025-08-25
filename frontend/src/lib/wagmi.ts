'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { hardhat, sepolia } from 'wagmi/chains';

// 定义本地链配置
const localhost = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'http://localhost:8545' },
  },
} as const;

export const config = getDefaultConfig({
  appName: 'FrisbeDAO',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'default-project-id',
  chains: [localhost, hardhat, sepolia],
  ssr: true, // 如果你的dApp使用服务器端渲染 (SSR)
});

// 智能合约地址配置
export const CONTRACT_ADDRESSES = {
  ATHLETE_REGISTRY: process.env.NEXT_PUBLIC_ATHLETE_REGISTRY_ADDRESS || '',
  PERSONAL_TOKEN_FACTORY: process.env.NEXT_PUBLIC_PERSONAL_TOKEN_FACTORY_ADDRESS || '',
  ACHIEVEMENT_TRACKER: process.env.NEXT_PUBLIC_ACHIEVEMENT_TRACKER_ADDRESS || '',
};

// 网络配置
export const NETWORK_CONFIG = {
  chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '31337'),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545',
};