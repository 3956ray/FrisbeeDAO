import Image from "next/image";
import { AthleteRegistration } from "@/components/AthleteRegistration";
import { IPFSUploader } from "@/components/IPFSUploader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  return (
    <div className="font-sans min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              className="dark:invert"
              src="/next.svg"
              alt="FrisbeDAO Logo"
              width={180}
              height={38}
              priority
            />
          </div>
          <h1 className="text-4xl font-bold mb-2">FrisbeDAO</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            去中心化运动员管理平台
          </p>
          <p className="text-gray-500 dark:text-gray-500">
            使用Web3钱包注册运动员身份，创建个人代币，记录成就到区块链
          </p>
        </div>

        {/* 主要功能区域 */}
        <Tabs defaultValue="register" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="register">运动员注册</TabsTrigger>
            <TabsTrigger value="ipfs">IPFS 测试</TabsTrigger>
          </TabsList>
          
          <TabsContent value="register" className="mt-6">
            <AthleteRegistration />
          </TabsContent>
          
          <TabsContent value="ipfs" className="mt-6">
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">IPFS 存储测试</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  测试 Pinata IPFS 存储功能 - 上传文件并检索数据
                </p>
              </div>
              <IPFSUploader />
            </div>
          </TabsContent>
        </Tabs>

        {/* 页脚链接 */}
        <div className="mt-16 flex gap-4 items-center justify-center flex-wrap">
          <a
            className="flex items-center gap-2 hover:underline hover:underline-offset-4 text-sm text-gray-600 dark:text-gray-400"
            href="https://github.com/FrisbeDAO"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            className="flex items-center gap-2 hover:underline hover:underline-offset-4 text-sm text-gray-600 dark:text-gray-400"
            href="https://docs.frisbedao.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            文档
          </a>
          <a
            className="flex items-center gap-2 hover:underline hover:underline-offset-4 text-sm text-gray-600 dark:text-gray-400"
            href="https://discord.gg/frisbedao"
            target="_blank"
            rel="noopener noreferrer"
          >
            社区
          </a>
        </div>
      </div>
    </div>
  );
}
