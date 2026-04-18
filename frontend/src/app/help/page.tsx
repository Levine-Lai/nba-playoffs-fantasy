const scoringRows = [
  { event: "得分", value: "1 分", note: "每得到 1 分记 1 个 fantasy point" },
  { event: "篮板", value: "1 分", note: "前后场篮板统一计算" },
  { event: "助攻", value: "2 分", note: "每次助攻记 2 分" },
  { event: "抢断", value: "3 分", note: "高价值防守数据" },
  { event: "盖帽", value: "3 分", note: "高价值防守数据" },
  { event: "失误", value: "-1 分", note: "每次失误扣 1 分" },
  { event: "Captain 加成", value: "1.5 倍", note: "只对被计入的 Captain 当日分数生效" }
] as const;

const lineupRows = [
  { item: "阵容规模", rule: "每支队伍固定 10 人" },
  { item: "初始建队", rule: "必须正好选择 5 名 BC 和 5 名 FC，总薪资不超过 100" },
  { item: "每日首发", rule: "每个比赛日提交 5 名首发，其他 5 人为替补" },
  { item: "合法阵型", rule: "首发或最终有效得分阵容必须满足 3BC+2FC 或 2BC+3FC" },
  { item: "Captain", rule: "Captain 需要从首发 5 人中选择，计分时享受 1.5 倍加成" }
] as const;

const transferRows = [
  {
    stage: "Day 1 DDL 前",
    transfer: "无限换人",
    ft: "不消耗 FT",
    penalty: "0",
    chips: "WC / AS 均不可用"
  },
  {
    stage: "Day 1 DDL 后",
    transfer: "进入正式交易期",
    ft: "整个季后赛共 6 个 FT",
    penalty: "FT 用完后每换 1 人 -50",
    chips: "WC / AS 解锁"
  }
] as const;

const chipRows = [
  {
    chip: "Wildcard",
    effect: "该比赛日内正常交易不扣分",
    limit: "整个季后赛 1 次",
    restore: "不会回滚阵容，确认后的阵容会继续保留"
  },
  {
    chip: "All-Star",
    effect: "该比赛日内无限换人且忽略预算限制",
    limit: "整个季后赛 1 次",
    restore: "该比赛日结束后，阵容恢复到使用前的版本"
  }
] as const;

const overviewItems = [
  "本游戏只覆盖 NBA 季后赛，不计入附加赛。",
  "季后赛每个有比赛的自然日会被编号为 Day 1、Day 2、Day 3……",
  "每个比赛日的 deadline 是当天第一场比赛开始前 30 分钟。",
  "在某个比赛日 deadline 之后，那个比赛日的锁定阵容就成为该日的计分阵容。"
] as const;

const autoSubItems = [
  "系统最多只计算 5 名有效球员的得分。",
  "有比赛的首发优先计分；没有比赛的首发会留下空位。",
  "空位会按照替补席顺位依次递补，但递补后仍必须满足合法阵型。",
  "如果你的有效球员只能组成 3BC+1FC 或 2BC+2FC 这类不满 5 人但合法的组合，就按该有效人数计分，不会强行补到 5 人。",
  "排行榜显示的就是最终有效分数，所以允许出现负分。"
] as const;

const standingItems = [
  "Standing 支持查看 Overall 和每个 Day 的分数。",
  "TOT 为累计总分，包含转会扣分，因此可能出现负数。",
  "Day 1 deadline 之前，Points 页面和相关分数展示会保持隐藏。",
  "Day 1 deadline 之后，可以从 Standing 点击队名进入对应队伍的 Points 页面查看当期阵容和得分。"
] as const;

export default function HelpPage() {
  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <div className="panel-head">游戏规则</div>
        <div className="panel-body space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#0b1f3a_0%,#143a73_55%,#1f5fbf_100%)] px-5 py-6 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">NBA Playoff Fantasy</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">中文游戏规则总览</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-sky-50 sm:text-base">
              这是一款只覆盖季后赛阶段的 NBA Fantasy Salary Cap 游戏。你需要在工资帽内组建 10 人阵容，在每个比赛日截止前锁定首发，
              通过真实比赛数据获取积分，并在 Standing 中与所有玩家竞争排名。
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">一眼看懂</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {overviewItems.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-blue" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">核心流程</h2>
              <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                <li>
                  <span className="font-semibold text-slate-900">1.</span> 注册账号并创建球队，完成 10 人初始阵容。
                </li>
                <li>
                  <span className="font-semibold text-slate-900">2.</span> 在每个比赛日 deadline 前调整阵容、设置首发和 Captain。
                </li>
                <li>
                  <span className="font-semibold text-slate-900">3.</span> deadline 后系统按有效阵型自动计算该比赛日分数。
                </li>
                <li>
                  <span className="font-semibold text-slate-900">4.</span> 分数进入 Standing，累计形成 Overall 和 TOT 排名。
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">阵容与首发规则</div>
        <div className="panel-body space-y-4 overflow-x-auto">
          <table className="table-shell min-w-[680px]">
            <thead>
              <tr>
                <th>项目</th>
                <th>规则</th>
              </tr>
            </thead>
            <tbody>
              {lineupRows.map((row) => (
                <tr key={row.item}>
                  <td className="font-semibold text-slate-900">{row.item}</td>
                  <td>{row.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-semibold text-slate-900">自动递补与有效人数</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {autoSubItems.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-pink" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">计分规则</div>
        <div className="panel-body overflow-x-auto">
          <table className="table-shell min-w-[720px]">
            <thead>
              <tr>
                <th>事件</th>
                <th>Fantasy 分值</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {scoringRows.map((row) => (
                <tr key={row.event}>
                  <td className="font-semibold text-slate-900">{row.event}</td>
                  <td>{row.value}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">换人与 FT 规则</div>
        <div className="panel-body space-y-4 overflow-x-auto">
          <table className="table-shell min-w-[780px]">
            <thead>
              <tr>
                <th>阶段</th>
                <th>换人模式</th>
                <th>FT</th>
                <th>扣分</th>
                <th>卡牌状态</th>
              </tr>
            </thead>
            <tbody>
              {transferRows.map((row) => (
                <tr key={row.stage}>
                  <td className="font-semibold text-slate-900">{row.stage}</td>
                  <td>{row.transfer}</td>
                  <td>{row.ft}</td>
                  <td>{row.penalty}</td>
                  <td>{row.chips}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">卡牌说明</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="table-shell min-w-[760px]">
                <thead>
                  <tr>
                    <th>卡牌</th>
                    <th>效果</th>
                    <th>使用次数</th>
                    <th>比赛日结束后</th>
                  </tr>
                </thead>
                <tbody>
                  {chipRows.map((row) => (
                    <tr key={row.chip}>
                      <td className="font-semibold text-slate-900">{row.chip}</td>
                      <td>{row.effect}</td>
                      <td>{row.limit}</td>
                      <td>{row.restore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Standing 与 Points 说明</div>
        <div className="panel-body">
          <ul className="space-y-2 text-sm leading-6 text-slate-700">
            {standingItems.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">补充说明</div>
        <div className="panel-body text-sm leading-6 text-slate-700">
          <p>
            如果某条页面文案与这里不一致，以当前 Help 页和实际系统行为为准。后续如果你继续调整 FT、卡牌、计分或自动递补规则，
            建议同步更新本页，保证用户看到的规则始终和后台逻辑一致。
          </p>
        </div>
      </section>
    </div>
  );
}
