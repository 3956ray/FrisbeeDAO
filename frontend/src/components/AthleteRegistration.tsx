'use client';

import React, { useState, useRef } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { useAthleteIPFS } from '@/hooks/usePinata';
import { WalletConnect, WalletStatus } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, CheckCircle, AlertCircle, User, Trophy } from 'lucide-react';
import { CONTRACT_ADDRESSES } from '@/lib/wagmi';

// AthleteRegistry ABI (简化版，只包含注册函数)
const ATHLETE_REGISTRY_ABI = [
  {
    "inputs": [
      { "internalType": "string", "name": "_name", "type": "string" },
      { "internalType": "string", "name": "_sport", "type": "string" },
      { "internalType": "string", "name": "_ipfsHash", "type": "string" }
    ],
    "name": "registerAthlete",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
] as const;

interface AthleteData {
  name: string;
  sport: string;
  bio: string;
  avatar?: string;
  achievements: string;
  stats: string;
}

export function AthleteRegistration() {
  const { address, isConnected } = useAccount();
  const { uploadAthleteProfile, uploadState } = useAthleteIPFS();
  
  // 表单状态
  const [athleteData, setAthleteData] = useState<AthleteData>({
    name: '',
    sport: '',
    bio: '',
    achievements: '',
    stats: ''
  });
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [registrationStep, setRegistrationStep] = useState<'form' | 'uploading' | 'registering' | 'success' | 'error'>('form');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [ipfsHash, setIpfsHash] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 智能合约交互
  const { writeContract, data: hash, error: contractError, isPending: isContractPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const handleInputChange = (field: keyof AthleteData, value: string) => {
    setAthleteData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
    }
  };

  const validateForm = (): boolean => {
    if (!athleteData.name.trim()) {
      setErrorMessage('请输入运动员姓名');
      return false;
    }
    if (!athleteData.sport.trim()) {
      setErrorMessage('请输入运动项目');
      return false;
    }
    if (!athleteData.bio.trim()) {
      setErrorMessage('请输入个人简介');
      return false;
    }
    return true;
  };

  const handleRegistration = async () => {
    if (!isConnected || !address) {
      setErrorMessage('请先连接钱包');
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setRegistrationStep('uploading');
      setErrorMessage('');

      // 1. 准备上传到IPFS的数据
      const profileData = {
        name: athleteData.name,
        sport: athleteData.sport,
        bio: athleteData.bio,
        walletAddress: address,
        achievements: athleteData.achievements ? athleteData.achievements.split('\n').filter(a => a.trim()) : [],
        stats: athleteData.stats ? JSON.parse(athleteData.stats || '{}') : {},
        registrationDate: new Date().toISOString(),
        avatar: avatarFile ? `avatar-${Date.now()}-${avatarFile.name}` : undefined
      };

      // 2. 上传到IPFS
      const hash = await uploadAthleteProfile(profileData);
      setIpfsHash(hash);

      // 3. 调用智能合约注册
      setRegistrationStep('registering');
      
      writeContract({
        address: CONTRACT_ADDRESSES.ATHLETE_REGISTRY as `0x${string}`,
        abi: ATHLETE_REGISTRY_ABI,
        functionName: 'registerAthlete',
        args: [athleteData.name, athleteData.sport, hash],
        value: parseEther('0.01'), // 注册费用
      });

    } catch (error) {
      console.error('注册失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '注册过程中发生错误');
      setRegistrationStep('error');
    }
  };

  // 监听合约交易状态
  React.useEffect(() => {
    if (isConfirmed) {
      setRegistrationStep('success');
    }
  }, [isConfirmed]);

  React.useEffect(() => {
    if (contractError) {
      setErrorMessage(contractError.message);
      setRegistrationStep('error');
    }
  }, [contractError]);

  const resetForm = () => {
    setAthleteData({
      name: '',
      sport: '',
      bio: '',
      achievements: '',
      stats: ''
    });
    setAvatarFile(null);
    setRegistrationStep('form');
    setErrorMessage('');
    setIpfsHash('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              运动员注册
            </CardTitle>
            <CardDescription>
              使用Web3钱包注册成为FrisbeDAO运动员
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WalletConnect onWalletConnected={(addr) => console.log('钱包已连接:', addr)} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (registrationStep === 'success') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            注册成功！
          </CardTitle>
          <CardDescription>
            恭喜您成功注册为FrisbeDAO运动员
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              <div className="space-y-2">
                <p><strong>运动员姓名:</strong> {athleteData.name}</p>
                <p><strong>运动项目:</strong> {athleteData.sport}</p>
                <p><strong>钱包地址:</strong> {address}</p>
                <p><strong>IPFS哈希:</strong> {ipfsHash}</p>
                {hash && (
                  <p><strong>交易哈希:</strong> {hash}</p>
                )}
              </div>
            </AlertDescription>
          </Alert>
          <Button onClick={resetForm} className="w-full">
            注册新运动员
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <WalletStatus />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            运动员注册
          </CardTitle>
          <CardDescription>
            填写您的运动员信息并完成链上注册
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">运动员姓名 *</Label>
              <Input
                id="name"
                value={athleteData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="请输入您的姓名"
                disabled={registrationStep !== 'form'}
              />
            </div>
            <div>
              <Label htmlFor="sport">运动项目 *</Label>
              <Input
                id="sport"
                value={athleteData.sport}
                onChange={(e) => handleInputChange('sport', e.target.value)}
                placeholder="如：飞盘、篮球、足球等"
                disabled={registrationStep !== 'form'}
              />
            </div>
          </div>

          {/* 个人简介 */}
          <div>
            <Label htmlFor="bio">个人简介 *</Label>
            <Textarea
              id="bio"
              value={athleteData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              placeholder="请介绍您的运动经历和特长"
              rows={3}
              disabled={registrationStep !== 'form'}
            />
          </div>

          {/* 头像上传 */}
          <div>
            <Label htmlFor="avatar">头像 (可选)</Label>
            <Input
              id="avatar"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              disabled={registrationStep !== 'form'}
            />
          </div>

          {/* 成就记录 */}
          <div>
            <Label htmlFor="achievements">主要成就 (可选)</Label>
            <Textarea
              id="achievements"
              value={athleteData.achievements}
              onChange={(e) => handleInputChange('achievements', e.target.value)}
              placeholder="每行一个成就，如：\n2023年全国飞盘锦标赛冠军\n2022年亚洲飞盘公开赛亚军"
              rows={3}
              disabled={registrationStep !== 'form'}
            />
          </div>

          {/* 统计数据 */}
          <div>
            <Label htmlFor="stats">统计数据 (可选，JSON格式)</Label>
            <Textarea
              id="stats"
              value={athleteData.stats}
              onChange={(e) => handleInputChange('stats', e.target.value)}
              placeholder='{"matchesPlayed": 45, "winRate": 0.78, "goals": 23}'
              rows={2}
              disabled={registrationStep !== 'form'}
            />
          </div>

          {/* 错误信息 */}
          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* 注册按钮 */}
          <Button 
            onClick={handleRegistration}
            disabled={registrationStep !== 'form' || !isConnected}
            className="w-full"
          >
            {registrationStep === 'uploading' && (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />上传数据到IPFS...</>
            )}
            {registrationStep === 'registering' && (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />注册到区块链...</>
            )}
            {(isContractPending || isConfirming) && (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />确认交易中...</>
            )}
            {registrationStep === 'form' && (
              <><Upload className="mr-2 h-4 w-4" />注册运动员 (0.01 ETH)</>
            )}
          </Button>

          {/* 注册说明 */}
          <Alert>
            <AlertDescription>
              <div className="text-sm space-y-1">
                <p>• 注册费用：0.01 ETH</p>
                <p>• 您的个人资料将存储在IPFS上</p>
                <p>• 钱包地址将与您的运动员身份绑定</p>
                <p>• 注册后可以创建个人代币和记录成就</p>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}