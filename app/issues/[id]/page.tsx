import Link from "next/link";
import IssueView from "./IssueView";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Dashboard
        </Link>
        <h1 className="text-base font-semibold text-gray-900">Issue Detail</h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <IssueView id={id} />
      </div>
    </div>
  );
}
