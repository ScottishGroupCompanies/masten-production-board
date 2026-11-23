import { MastenWordmark } from "@/components/masten-wordmark";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f8f5ef] text-zinc-900">
      <div className="text-center">
        <MastenWordmark size="login" priority />
        <p className="mt-3 text-base text-zinc-700">Opening the floor board…</p>
      </div>
    </div>
  );
}
