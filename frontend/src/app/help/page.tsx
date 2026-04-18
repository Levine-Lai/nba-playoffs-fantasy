const scoringRules = [
  ["得分", "+1"],
  ["篮板", "+1"],
  ["助攻", "+2"],
  ["抢断", "+3"],
  ["盖帽", "+3"],
  ["失误", "-1"]
] as const;

export default function HelpPage() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="panel overflow-hidden">
        <div className="panel-head">计分规则</div>
        <div className="panel-body p-3 sm:p-5">
          <table className="table-shell table-fixed">
            <thead>
              <tr>
                <th className="w-[60%] text-[12px] sm:text-sm">项目</th>
                <th className="text-[12px] sm:text-sm">分值</th>
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
