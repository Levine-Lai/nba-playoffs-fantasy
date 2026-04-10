import { Player } from "@/lib/types";

interface PlayerCardProps {
  player: Player;
  showPoints?: boolean;
  captain?: boolean;
}

export default function PlayerCard({ player, showPoints, captain }: PlayerCardProps) {
  const tone = player.color === "hot" ? "from-[#ec1459] to-[#be1244]" : "from-[#2d63cf] to-[#1f4ea1]";

  return (
    <article className="w-full max-w-[210px] overflow-hidden rounded border border-slate-200 bg-white shadow-panel">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-1 text-xs text-slate-500">
        <span>{player.position}</span>
        {captain ? <span className="font-semibold text-brand-pink">Captain</span> : <span>{player.team}</span>}
      </header>

      <div className="px-3 py-3">
        <div className="flex items-end justify-between">
          <h3 className="text-2xl font-semibold uppercase leading-none">{player.name}</h3>
          <span className="text-3xl font-semibold text-brand-blue">{player.team}</span>
        </div>

        {!showPoints ? (
          <p className="mt-2 text-xs text-slate-500">
            Next: {player.nextOpponent ?? "TBD"} | Upcoming: {(player.upcoming ?? []).join(", ") || "TBD"}
          </p>
        ) : null}
      </div>

      <footer className={`bg-gradient-to-r px-3 py-2 text-center text-3xl font-semibold text-white ${tone}`}>
        {showPoints ? player.points ?? 0 : player.salary.toFixed(1)}
      </footer>
    </article>
  );
}

