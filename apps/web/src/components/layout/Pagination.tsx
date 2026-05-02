import Link from "next/link";

interface Props {
  page: number;
  pages: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}

export default function Pagination({ page, pages, basePath, searchParams }: Props) {
  if (pages <= 1) return null;
  const buildHref = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v != null && v !== "") sp.set(k, v);
    });
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="border-t p-3 flex justify-between items-center text-sm">
      <span className="text-muted-foreground">
        Página {page} de {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={buildHref(page - 1)} className="px-3 py-1 rounded border hover:bg-accent">
            ← Anterior
          </Link>
        )}
        {page < pages && (
          <Link href={buildHref(page + 1)} className="px-3 py-1 rounded border hover:bg-accent">
            Siguiente →
          </Link>
        )}
      </div>
    </div>
  );
}
