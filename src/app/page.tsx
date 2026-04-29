import Link from "next/link";
import { format } from "date-fns";
import { getActiveSession, listPastSessions } from "@/lib/sessions";
import { StartRetroButton } from "@/components/retro/StartRetroButton";
import { LobbyListener } from "@/components/retro/LobbyListener";
import { ActiveRetroAdminControls } from "@/components/retro/ActiveRetroAdminControls";
import { PastSearchInput } from "@/components/retro/PastSearchInput";
import { getClientId } from "@/lib/identity";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [active, past, clientId] = await Promise.all([
    getActiveSession(),
    listPastSessions({ search: q ?? undefined }),
    getClientId(),
  ]);
  const isActiveAdmin = !!active && active.adminClientId === clientId;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-10">
      <LobbyListener />
      <section className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Cloudchipr Retros</h1>
        <p className="text-[var(--color-muted)] text-sm sm:text-base">A calmer place to look back on the sprint.</p>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 sm:p-6 shadow-soft">
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Active retro</h2>
            {active ? (
              <p className="text-sm text-[var(--color-muted)]">
                {active.title} · started {format(new Date(active.startedAt), "MMM d, HH:mm")}
              </p>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">No retro is active right now.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <>
                {isActiveAdmin && <ActiveRetroAdminControls sessionId={active.id} />}
                <Link
                  href={`/r/${active.id}`}
                  className="inline-flex h-10 items-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-fg)] hover:opacity-90"
                >
                  Join retro
                </Link>
              </>
            ) : (
              <StartRetroButton />
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold">Past retros</h2>
          <PastSearchInput />
        </div>
        {past.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-muted)]">
            No past retros yet.
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {past.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/r/${p.id}`}
                  className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 hover:border-[var(--color-primary)] transition shadow-soft"
                >
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-[var(--color-muted)] mt-1">
                    Closed {p.endedAt ? format(new Date(p.endedAt), "MMM d, yyyy") : "-"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
