// 自動生成的TypeScript類型定義
// 生成時間: 2025-09-09T10:32:00.751Z

export interface ContractABIs {
  AthleteRegistry: {
    abi: any[];
    bytecode: string;
    contractName: string;
    sourceName: string;
  };
  PersonalTokenFactory: {
    abi: any[];
    bytecode: string;
    contractName: string;
    sourceName: string;
  };
  PersonalToken: {
    abi: any[];
    bytecode: string;
    contractName: string;
    sourceName: string;
  };
  PriceOracle: {
    abi: any[];
    bytecode: string;
    contractName: string;
    sourceName: string;
  };
  ContentManager: {
    abi: any[];
    bytecode: string;
    contractName: string;
    sourceName: string;
  };
  AchievementTracker: {
    abi: any[];
    bytecode: string;
    contractName: string;
    sourceName: string;
  };
}

export const CONTRACT_NAMES = {
  ATHLETEREGISTRY: 'AthleteRegistry' as const,
  PERSONALTOKENFACTORY: 'PersonalTokenFactory' as const,
  PERSONALTOKEN: 'PersonalToken' as const,
  PRICEORACLE: 'PriceOracle' as const,
  CONTENTMANAGER: 'ContentManager' as const,
  ACHIEVEMENTTRACKER: 'AchievementTracker' as const,
} as const;

export type ContractName = keyof ContractABIs;
