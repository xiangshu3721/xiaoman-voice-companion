import type { Metadata } from "next";
import "./globals.css";
import { BuildInfo } from "./build-info";

export const metadata: Metadata = {
  title: "怼怼｜你的伴侣",
  description: "一个可以用声音发生真实关系冲突的虚拟伴侣。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}<BuildInfo /></body>
    </html>
  );
}
