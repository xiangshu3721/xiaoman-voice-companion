import type { Metadata } from "next";
import "./globals.css";
import { ChunkRecovery } from "@/src/boot/chunk-recovery";
import { BuildInfo } from "./build-info";

export const metadata: Metadata = {
  title: "小满｜你的伴侣",
  description: "一个可以用声音发生真实关系冲突的虚拟伴侣。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><ChunkRecovery />{children}<BuildInfo /></body>
    </html>
  );
}
