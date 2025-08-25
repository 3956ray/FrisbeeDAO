'use client';

import React, { useState, useRef } from 'react';
import { useAthleteIPFS } from '@/hooks/usePinata';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, Copy, ExternalLink } from 'lucide-react';

interface AthleteFormData {
  name: string;
  bio: string;
  achievements: string;
}

export const IPFSUploader: React.FC = () => {
  const { uploadState, uploadAthleteProfile, uploadFile, getData, getFileUrl, isValidHash } = useAthleteIPFS();
  const [formData, setFormData] = useState<AthleteFormData>({
    name: '',
    bio: '',
    achievements: ''
  });
  const [retrieveHash, setRetrieveHash] = useState('');
  const [retrievedData, setRetrievedData] = useState<any>(null);
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (field: keyof AthleteFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleUploadProfile = async () => {
    if (!formData.name.trim()) {
      alert('请输入运动员姓名');
      return;
    }

    const athleteData = {
      name: formData.name,
      bio: formData.bio,
      achievements: formData.achievements.split('\n').filter(a => a.trim()),
      uploadedAt: new Date().toISOString(),
      stats: {
        profileVersion: '1.0',
        dataType: 'athlete-profile'
      }
    };

    const hash = await uploadAthleteProfile(athleteData);
    if (hash) {
      console.log('Profile uploaded successfully:', hash);
    }
  };

  const handleFileUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      alert('请选择文件');
      return;
    }

    const metadata = {
      name: `file-${file.name}`,
      keyvalues: {
        originalName: file.name,
        fileType: file.type,
        uploadedAt: new Date().toISOString()
      }
    };

    const hash = await uploadFile(file, metadata);
    if (hash) {
      console.log('File uploaded successfully:', hash);
    }
  };

  const handleRetrieveData = async () => {
    if (!retrieveHash.trim()) {
      alert('请输入 IPFS 哈希');
      return;
    }

    if (!isValidHash(retrieveHash)) {
      alert('无效的 IPFS 哈希格式');
      return;
    }

    setRetrieveLoading(true);
    try {
      const data = await getData(retrieveHash);
      setRetrievedData(data);
    } catch (error) {
      console.error('Error retrieving data:', error);
      alert('获取数据失败');
    } finally {
      setRetrieveLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('已复制到剪贴板');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">IPFS 数据存储</h1>
        <p className="text-gray-600">使用 Pinata 服务上传和检索数据</p>
      </div>

      {/* 上传运动员资料 */}
      <Card>
        <CardHeader>
          <CardTitle>上传运动员资料</CardTitle>
          <CardDescription>将运动员信息存储到 IPFS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">姓名 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="输入运动员姓名"
            />
          </div>
          <div>
            <Label htmlFor="bio">简介</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              placeholder="输入运动员简介"
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="achievements">成就（每行一个）</Label>
            <Textarea
              id="achievements"
              value={formData.achievements}
              onChange={(e) => handleInputChange('achievements', e.target.value)}
              placeholder="输入运动员成就，每行一个"
              rows={4}
            />
          </div>
          <Button 
            onClick={handleUploadProfile} 
            disabled={uploadState.loading}
            className="w-full"
          >
            {uploadState.loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />上传中...</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" />上传资料</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 上传文件 */}
      <Card>
        <CardHeader>
          <CardTitle>上传文件</CardTitle>
          <CardDescription>上传图片、文档等文件到 IPFS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="file">选择文件</Label>
            <Input
              id="file"
              type="file"
              ref={fileInputRef}
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
          </div>
          <Button 
            onClick={handleFileUpload} 
            disabled={uploadState.loading}
            className="w-full"
          >
            {uploadState.loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />上传中...</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" />上传文件</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 上传结果 */}
      {uploadState.ipfsHash && (
        <Alert>
          <AlertDescription>
            <div className="space-y-2">
              <p><strong>上传成功！</strong></p>
              <div className="flex items-center space-x-2">
                <code className="bg-gray-100 px-2 py-1 rounded text-sm flex-1">
                  {uploadState.ipfsHash}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(uploadState.ipfsHash!)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(getFileUrl(uploadState.ipfsHash!), '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* 上传错误 */}
      {uploadState.error && (
        <Alert variant="destructive">
          <AlertDescription>
            上传失败: {uploadState.error}
          </AlertDescription>
        </Alert>
      )}

      {/* 检索数据 */}
      <Card>
        <CardHeader>
          <CardTitle>检索数据</CardTitle>
          <CardDescription>通过 IPFS 哈希获取数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="hash">IPFS 哈希</Label>
            <Input
              id="hash"
              value={retrieveHash}
              onChange={(e) => setRetrieveHash(e.target.value)}
              placeholder="输入 IPFS 哈希 (Qm... 或 baf...)"
            />
          </div>
          <Button 
            onClick={handleRetrieveData} 
            disabled={retrieveLoading}
            className="w-full"
          >
            {retrieveLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />检索中...</>
            ) : (
              '检索数据'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 检索结果 */}
      {retrievedData && (
        <Card>
          <CardHeader>
            <CardTitle>检索结果</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(retrievedData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};