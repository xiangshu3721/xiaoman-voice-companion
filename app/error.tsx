"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-[#141313] px-6 text-[#f4efeb]"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1b1818] p-6 text-center"><p className="text-xs tracking-[0.16em] text-[#e98972]">RUNTIME RECOVERY</p><h1 className="mt-3 text-xl">页面刚才没有加载完整</h1><p className="mt-3 text-sm leading-6 text-[#a9a09e]">聊天内容不会因为这次页面错误被自动上传。可以重新加载这一页再继续。</p><button type="button" onClick={reset} className="mt-6 rounded-full bg-[#e98972] px-5 py-3 text-sm font-medium text-[#241615]">重新加载</button></section></main>;
}

