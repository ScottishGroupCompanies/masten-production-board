import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold leading-snug">That card isn’t on the board</h1>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Back to the board
        </Link>
      </div>
    </div>
  );
}
