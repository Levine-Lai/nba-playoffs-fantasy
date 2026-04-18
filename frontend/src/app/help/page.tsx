const playoffRules = [
  "Day 1 deadline before lock: unlimited transfers are allowed.",
  "After the Day 1 deadline, each team gets 6 free transfers for the whole playoffs.",
  "After those 6 free transfers are used, every extra normal transfer costs -50 points.",
  "Each manager has 1 Wildcard and 1 All-Star chip, with the same behavior as regular season chips.",
  "If you activate Wildcard or All-Star after already making transfers for the same gameday, those confirmed transfers stay, but that gameday no longer uses playoff FT or transfer penalties.",
  "There is no limit on how many players you can hold from the same NBA team."
] as const;

const scoringRules = [
  ["Points", "+1"],
  ["Rebounds", "+1"],
  ["Assists", "+2"],
  ["Steals", "+3"],
  ["Blocks", "+3"],
  ["Turnovers", "-1"]
] as const;

export default function HelpPage() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="panel overflow-hidden">
        <div className="panel-head">Playoff Rules</div>
        <div className="panel-body p-4 sm:p-5">
          <ul className="space-y-3 text-sm text-slate-800 sm:text-[15px]">
            {playoffRules.map((rule) => (
              <li key={rule} className="flex gap-3">
                <span className="mt-[2px] h-2 w-2 shrink-0 rounded-full bg-brand-blue" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-head">Scoring Rules</div>
        <div className="panel-body p-3 sm:p-5">
          <table className="table-shell table-fixed">
            <thead>
              <tr>
                <th className="w-[60%] text-[12px] sm:text-sm">Category</th>
                <th className="text-[12px] sm:text-sm">Points</th>
              </tr>
            </thead>
            <tbody>
              {scoringRules.map(([label, value]) => (
                <tr key={label}>
                  <td className="break-words text-[13px] font-semibold text-slate-900 sm:text-sm">{label}</td>
                  <td className={`text-[13px] font-bold sm:text-sm ${value.startsWith("-") ? "text-rose-700" : "text-emerald-700"}`}>
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
