import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold leading-snug">Admins only</h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">The users page is not available for staff accounts.</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Back to the board
        </Link>
      </div>
    </div>
  );
}
