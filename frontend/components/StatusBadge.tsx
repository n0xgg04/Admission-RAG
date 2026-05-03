import { clsx } from "@/lib/utils";

export function StatusBadge({
  ok,
  label
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        ok
          ? "border-teal-200 bg-teal-50 text-teal-800"
          : "border-rose-200 bg-rose-50 text-rose-700"
      )}
    >
      {label}
    </span>
  );
}
