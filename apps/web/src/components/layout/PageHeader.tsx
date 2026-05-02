import Link from "next/link";

export default function PageHeader({
  title,
  subtitle,
  newHref,
  newLabel = "+ Nuevo",
  show = true,
}: {
  title: string;
  subtitle?: string;
  newHref?: string;
  newLabel?: string;
  show?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {show && newHref && (
        <Link
          href={newHref}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 whitespace-nowrap"
        >
          {newLabel}
        </Link>
      )}
    </div>
  );
}
