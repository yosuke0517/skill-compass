import Link from "next/link";

export default function MaintenancePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="space-y-4">
        <p className="text-sm font-medium text-slate-500">Skill Compass</p>
        <h1 className="text-3xl font-semibold tracking-tight">一時的に読み取り専用です</h1>
        <p className="leading-7 text-slate-600">
          クラウド環境への切り替え中です。閲覧は続けられますが、回答の送信や設定変更、Podcast生成は一時停止しています。
        </p>
        <Link className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-white" href="/">
          ホームへ戻る
        </Link>
      </section>
    </main>
  );
}
