import Image from "next/image";

const sizes = {
  header: "w-[118px] sm:w-[146px]",
  login: "w-[168px] sm:w-[196px]",
} as const;

export function MastenWordmark({
  size = "header",
  priority = false,
  className = "",
}: {
  size?: keyof typeof sizes;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/masten-wordmark.webp"
      alt="Masten"
      width={300}
      height={59}
      priority={priority}
      unoptimized
      draggable={false}
      sizes={size === "login" ? "196px" : "146px"}
      className={`block h-auto max-w-full shrink-0 bg-transparent select-none ${sizes[size]} ${className}`}
    />
  );
}
