const scoringRules = [
  ["得分", "+1", "每得到 1 分，Fantasy 记 1 分。"],
  ["篮板", "+1", "前场篮板和后场篮板统一按 1 分计算。"],
  ["助攻", "+2", "每次助攻记 2 分。"],
  ["抢断", "+3", "每次抢断记 3 分。"],
  ["盖帽", "+3", "每次盖帽记 3 分。"],
  ["失误", "-1", "每次失误扣 1 分。"]
] as const;

const transferStages = [
  {
    title: "Day 1 DDL 之前",
    items: [
      "可以无限换人。",
      "这段时间只是建队期，不消耗季后赛 FT。",
      "不会产生换人扣分。",
      "Wildcard 和 All-Star 都不能开启。"
    ]
  },
  {
    title: "Day 1 DDL 之后",
    items: [
      "正式进入季后赛交易期。",
      "整个季后赛总共只有 6 个 FT。",
      "6 个 FT 用完之后，每多换 1 人扣 50 分。",
      "Wildcard 和 All-Star 在这个阶段才可使用。"
    ]
  }
] as const;

const chipRules = [
  {
    label: "Wildcard",
    detail: "该比赛日内的正常换人不扣分，确认后的阵容会继续保留，不会回滚。"
  },
  {
    label: "All-Star",
    detail: "该比赛日内可以无限换人且忽略预算限制，比赛日结束后阵容恢复到使用前。"
  }
] as const;

const transferNotes = [
  "Points 会在 Day 1 deadline 之后才解锁显示。",
  "Standing 显示的是有效得分，允许出现负分。",
  "系统最多只计算 5 名有效球员的分数。",
  "有比赛的首发优先计分；没有比赛的首发会按替补席顺位递补。",
  "最终有效阵型仍必须满足 3BC+2FC 或 2BC+3FC。",
  "如果递补后只能形成少于 5 人的合法阵型，就按该有效人数计分。"
] as const;

export default function HelpPage() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="panel overflow-hidden">
        <div className="panel-head">计分规则</div>
        <div className="panel-body p-3 sm:p-5">
          <div className="overflow-x-auto">
            <table className="table-shell table-fixed">
              <thead>
                <tr>
                  <th className="w-[24%] text-[12px] sm:text-sm">项目</th>
                  <th className="w-[18%] text-[12px] sm:text-sm">分值</th>
                  <th className="text-[12px] sm:text-sm">说明</th>
                </tr>
              </thead>
              <tbody>
                {scoringRules.map(([label, value, detail]) => (
                  <tr key={label}>
                    <td className="break-words text-[12px] font-semibold text-slate-900 sm:text-sm">{label}</td>
                    <td className={`text-[12px] font-bold sm:text-sm ${value.startsWith("-") ? "text-rose-700" : "text-emerald-700"}`}>
                      {value}
                    </td>
                    <td className="break-words text-[12px] leading-5 text-slate-600 sm:text-sm">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-head">换人与 FT 规则</div>
        <div className="panel-body space-y-4 p-3 sm:space-y-5 sm:p-5">
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            {transferStages.map((stage) => (
              <article
                key={stage.title}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4 sm:py-4"
              >
                <h2 className="text-[15px] font-semibold leading-5 text-slate-900 sm:text-base">{stage.title}</h2>
                <ul className="mt-3 space-y-2 text-[12.5px] leading-5 text-slate-600 sm:text-sm">
                  {stage.items.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 sm:px-4 sm:py-4">
            <div className="grid gap-3 lg:grid-cols-2">
              {chipRules.map((chip) => (
                <article key={chip.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <h3 className="text-sm font-semibold text-slate-900 sm:text-[15px]">{chip.label}</h3>
                  <p className="mt-1 text-[12.5px] leading-5 text-slate-600 sm:text-sm">{chip.detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
              <h3 className="text-sm font-semibold text-slate-900 sm:text-[15px]">补充说明</h3>
              <ul className="mt-3 space-y-2 text-[12.5px] leading-5 text-slate-600 sm:text-sm">
                {transferNotes.map((note) => (
                  <li key={note} className="flex gap-2.5">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-pink" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
