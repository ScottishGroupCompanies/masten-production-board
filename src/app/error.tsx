"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold leading-snug">The board didn’t load</h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">The shop data could not be read. Try again, and if it keeps failing, restart the app.</p>
        <button type="button" onClick={reset} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
          Try again
        </button>
      </div>
    </div>
  );
}
