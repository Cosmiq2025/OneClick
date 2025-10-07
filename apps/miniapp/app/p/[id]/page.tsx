export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import UnlockButton from "@/app/components/UnlockButton";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:4021").replace(/\/$/, "");

async function getPost(id: string) {
  try {
    const res = await fetch(`${API_BASE}/api/posts/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function PostPage({ params }: { params: { id: string } }) {
  const data = await getPost(params.id);
  if (!data?.ok) return <main className="p-8">Post not found</main>;

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <p className="text-sm text-gray-500">
        Unlock for ${Number(data.priceUsd ?? 1).toFixed(2)} (USDC on Base)
      </p>

      <section className="relative overflow-hidden rounded border">
        <div
          className="text-gray-700 p-4"
          dangerouslySetInnerHTML={{ __html: data.preview }}
        />
        <div className="absolute inset-0 backdrop-blur-sm pointer-events-none" />
      </section>

      <UnlockButton postId={params.id} />
    </main>
  );
}
