'use client';

import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wallet, LogOut, User } from 'lucide-react';

interface WalletConnectProps {
  onWalletConnected?: (address: string) => void;
  showDisconnect?: boolean;
}

export function WalletConnect({ onWalletConnected, showDisconnect = true }: WalletConnectProps) {
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();

  React.useEffect(() => {
    if (isConnected && address && onWalletConnected) {
      onWalletConnected(address);
    }
  }, [isConnected, address, onWalletConnected]);

  if (isConnected && address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            钱包已连接
          </CardTitle>
          <CardDescription>
            您的钱包地址: {address.slice(0, 6)}...{address.slice(-4)}
          </CardDescription>
        </CardHeader>
        {showDisconnect && (
          <CardContent>
            <div className="flex gap-2">
              <ConnectButton />
              <Button
                variant="outline"
                onClick={() => disconnect()}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                断开连接
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          连接钱包
        </CardTitle>
        <CardDescription>
          请连接您的Web3钱包以开始使用FrisbeDAO
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isConnecting ? (
          <Alert>
            <AlertDescription>
              正在连接钱包，请在钱包中确认连接...
            </AlertDescription>
          </Alert>
        ) : (
          <ConnectButton />
        )}
      </CardContent>
    </Card>
  );
}

// 简化的钱包连接按钮组件
export function SimpleWalletConnect() {
  return (
    <div className="flex justify-center">
      <ConnectButton />
    </div>
  );
}

// 钱包状态显示组件
export function WalletStatus() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <Alert>
        <AlertDescription>
          请先连接钱包以使用此功能
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertDescription>
        已连接钱包: {address?.slice(0, 6)}...{address?.slice(-4)}
      </AlertDescription>
    </Alert>
  );
}