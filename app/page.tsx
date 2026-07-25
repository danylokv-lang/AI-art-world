import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Link href="/lab" className="text-paper-300 underline">
        engine lab
      </Link>
    </main>
  );
}
