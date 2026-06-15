# 2026-06-15 Ledger Repair Report

## Status
- Remote D1 repair was applied on 2026-06-15 with `node backend\scripts\repair-remote-ledger-2026-06-04.mjs --apply`.
- The repair covered finalized playoff scoring periods Day 1 through Day 44.
- The repair filled 73 missing actual ledger entries, changed 16 actual ledger entries, recalculated `user_states.overall_points` / `overall_rank`, and cleared `standing_payload_cache_v1`.
- The post-apply verification rerun was idempotent for actual points: `filled=0`, `changed=0`, `unchanged=1100`, `warnings=[]`.
- This follow-up reused the legacy 2026-06-04 repair script, so the generated SQL and backup artifact names still contain `2026-06-04`.

## Summary
- Mode: apply
- Processed users with complete rosters: 25
- Processed finalized periods: 44 (Day 1 through Day 44)
- Actual ledger entries filled: 73
- Actual ledger entries changed: 16
- Actual ledger entries unchanged: 1011
- Penalty ledger entries changed/removed: 0
- Repaired lock entries generated in output: 253
- SQL output: backend/tmp/repair-ledger-2026-06-04.sql
- Backup output: backend/tmp/repair-ledger-2026-06-04.backup.json

## Day Fill Counts

| Day | Period | Filled | Changed | Explicit Zero After Repair |
| --- | --- | ---: | ---: | ---: |
| Day 1 | day:2026-04-18 | 0 | 0 | 1 |
| Day 2 | day:2026-04-19 | 0 | 0 | 0 |
| Day 3 | day:2026-04-20 | 0 | 0 | 1 |
| Day 4 | day:2026-04-21 | 0 | 0 | 0 |
| Day 5 | day:2026-04-22 | 0 | 0 | 0 |
| Day 6 | day:2026-04-23 | 0 | 0 | 1 |
| Day 7 | day:2026-04-24 | 0 | 0 | 0 |
| Day 8 | day:2026-04-25 | 0 | 0 | 0 |
| Day 9 | day:2026-04-26 | 0 | 0 | 0 |
| Day 10 | day:2026-04-27 | 0 | 0 | 0 |
| Day 11 | day:2026-04-28 | 0 | 0 | 0 |
| Day 12 | day:2026-04-29 | 0 | 0 | 2 |
| Day 13 | day:2026-04-30 | 0 | 0 | 0 |
| Day 14 | day:2026-05-01 | 0 | 0 | 2 |
| Day 15 | day:2026-05-02 | 0 | 0 | 2 |
| Day 16 | day:2026-05-03 | 0 | 0 | 2 |
| Day 17 | day:2026-05-04 | 0 | 0 | 1 |
| Day 18 | day:2026-05-05 | 0 | 0 | 0 |
| Day 19 | day:2026-05-06 | 0 | 1 | 1 |
| Day 20 | day:2026-05-07 | 0 | 1 | 0 |
| Day 21 | day:2026-05-08 | 0 | 1 | 1 |
| Day 22 | day:2026-05-09 | 0 | 1 | 0 |
| Day 23 | day:2026-05-10 | 0 | 1 | 1 |
| Day 24 | day:2026-05-11 | 0 | 1 | 0 |
| Day 25 | day:2026-05-12 | 0 | 1 | 1 |
| Day 26 | day:2026-05-13 | 0 | 1 | 2 |
| Day 27 | day:2026-05-15 | 0 | 1 | 0 |
| Day 28 | day:2026-05-17 | 0 | 1 | 4 |
| Day 29 | day:2026-05-18 | 0 | 1 | 0 |
| Day 30 | day:2026-05-19 | 0 | 1 | 6 |
| Day 31 | day:2026-05-20 | 0 | 1 | 0 |
| Day 32 | day:2026-05-21 | 0 | 1 | 4 |
| Day 33 | day:2026-05-22 | 0 | 0 | 0 |
| Day 34 | day:2026-05-23 | 0 | 0 | 4 |
| Day 35 | day:2026-05-24 | 0 | 0 | 1 |
| Day 36 | day:2026-05-25 | 0 | 0 | 4 |
| Day 37 | day:2026-05-26 | 0 | 0 | 1 |
| Day 38 | day:2026-05-28 | 0 | 1 | 1 |
| Day 39 | day:2026-05-30 | 0 | 0 | 1 |
| Day 40 | day:2026-06-03 | 0 | 1 | 1 |
| Day 41 | day:2026-06-05 | 20 | 0 | 1 |
| Day 42 | day:2026-06-08 | 18 | 0 | 1 |
| Day 43 | day:2026-06-10 | 17 | 0 | 1 |
| Day 44 | day:2026-06-13 | 18 | 0 | 1 |

## Largest User Total Changes

| User | Team | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| kusuri | Rudy Fernondez | 3171 | 5780 | 2609 |
| orange | orange | 4572 | 5342 | 770 |
| OldTrafford | OldTrafford | 4771 | 5525 | 754 |
| 鲨鱼一定会逆转 | 鲨鱼一定会逆转 | 3353 | 4045 | 692 |
| conan joe | conan joe | 5109 | 5684 | 575 |
| 卧虎完蛋了 | 卧虎完蛋了 | 4217 | 4734 | 517 |
| northlions | northlions | 4464 | 4884 | 420 |
| KIMI | KIMI | 4234 | 4587 | 353 |
| Hi Young Fernandez | Hi Young Fernandez | 3294 | 3625 | 331 |
| okc team | okc team | 2917 | 3241 | 324 |
| Test1 | 蒂尔尼想打篮球 | 4823 | 5095 | 272 |
| 条条 | 条条 | 3132 | 3398 | 266 |
| Magic shuan | Magic shuan | 2635 | 2885 | 250 |
| acidboy | acidboy | 2856 | 3076 | 220 |
| NBenA | NBenA | 2811 | 3031 | 220 |

## Users With Changes

### 蒂尔尼想打篮球 (Test1, user 9)
Total: 4823 -> 5095 (+272)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 103 | created |
| Day 42 | missing | 83 | created |
| Day 43 | missing | 86 | created |

### acidboy (acidboy, user 10)
Total: 2856 -> 3076 (+220)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 56 | created |
| Day 42 | missing | 66 | created |
| Day 43 | missing | 48 | created |
| Day 44 | missing | 50 | created |

### nbw (nbw, user 11)
Total: 3432 -> 3605 (+173)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 41 | created |
| Day 42 | missing | 40 | created |
| Day 43 | missing | 39 | created |
| Day 44 | missing | 53 | created |

### 鬼嗨！重生失败！ (吴佳慧会家务, user 12)
Total: 5536 -> 5536 (+0)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 7 | 53 | 53 | replaced |
| Day 33 | 158 | 158 | replaced |
| Day 34 | 101 | 101 | replaced |
| Day 35 | 121 | 121 | replaced |
| Day 36 | 111 | 111 | replaced |
| Day 37 | 144 | 144 | replaced |

### NBenA (NBenA, user 13)
Total: 2811 -> 3031 (+220)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 1 | 73 | 73 | replaced |
| Day 41 | missing | 56 | created |
| Day 42 | missing | 66 | created |
| Day 43 | missing | 48 | created |
| Day 44 | missing | 50 | created |

### A1A1 (A1A1, user 14)
Total: 5005 -> 5187 (+182)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 40 | 177 | 144 | kept |
| Day 41 | 203 | 203 | created |
| Day 42 | missing | 215 | created |
| Day 44 | 177 | 177 | created |

### 静安赫尔特 (静安赫尔特, user 15)
Total: 2552 -> 2552 (+0)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 0 | created |
| Day 42 | missing | 0 | created |
| Day 43 | missing | 0 | created |
| Day 44 | missing | 0 | created |

### Rudy Fernandez (鬼嗨！重生！, user 16)
Total: 6307 -> 6307 (+0)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 28 | 46 | 46 | replaced |

### 陈昊宇小宇宙 (陈昊宇小宇宙, user 17)
Total: 5666 -> 5862 (+196)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 32 | 64 | 64 | replaced |
| Day 33 | 168 | 168 | replaced |
| Day 34 | 58 | 58 | replaced |
| Day 35 | 147 | 147 | replaced |
| Day 39 | 165 | 165 | replaced |
| Day 41 | missing | 196 | created |

### 鲨鱼一定会逆转 (鲨鱼一定会逆转, user 18)
Total: 3353 -> 4045 (+692)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 7 | 115 | 115 | replaced |
| Day 41 | missing | 168 | created |
| Day 42 | missing | 190 | created |
| Day 43 | missing | 178 | created |
| Day 44 | missing | 156 | created |

### orange (orange, user 19)
Total: 4572 -> 5342 (+770)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 7 | 149 | 149 | replaced |
| Day 41 | missing | 195 | created |
| Day 42 | missing | 195 | created |
| Day 43 | missing | 189 | created |
| Day 44 | missing | 191 | created |

### 卧虎完蛋了 (卧虎完蛋了, user 20)
Total: 4217 -> 4734 (+517)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 121 | created |
| Day 42 | missing | 130 | created |
| Day 43 | missing | 137 | created |
| Day 44 | missing | 129 | created |

### Magic shuan (Magic shuan, user 21)
Total: 2635 -> 2885 (+250)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 66 | created |
| Day 42 | missing | 46 | created |
| Day 43 | missing | 72 | created |
| Day 44 | missing | 66 | created |

### okc team (okc team, user 22)
Total: 2917 -> 3241 (+324)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 72 | created |
| Day 42 | missing | 94 | created |
| Day 43 | missing | 85 | created |
| Day 44 | missing | 73 | created |

### Rudy Fernondez (kusuri, user 23)
Total: 3171 -> 5780 (+2609)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 19 | 0 | 107 | kept |
| Day 20 | 0 | 138 | kept |
| Day 21 | 0 | 159 | kept |
| Day 22 | 0 | 170 | kept |
| Day 23 | 0 | 143 | kept |
| Day 24 | 0 | 118 | kept |
| Day 25 | 0 | 200 | kept |
| Day 26 | 0 | 66 | kept |
| Day 27 | 0 | 149 | kept |
| Day 28 | 0 | 60 | kept |
| Day 29 | 0 | 167 | kept |
| Day 30 | 0 | 135 | kept |
| Day 31 | 0 | 160 | kept |
| Day 32 | 0 | 110 | replaced |
| Day 33 | 140 | 140 | replaced |
| Day 34 | 125 | 125 | replaced |
| Day 35 | 125 | 125 | replaced |
| Day 38 | 0 | 145 | replaced |
| Day 41 | missing | 208 | created |
| Day 42 | 203 | 203 | created |
| Day 43 | missing | 191 | created |
| Day 44 | missing | 183 | created |

### fitz (fitz, user 24)
Total: 5575 -> 5725 (+150)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 7 | 94 | 94 | replaced |
| Day 29 | 214 | 214 | replaced |
| Day 44 | missing | 150 | created |

### okc (okc, user 25)
Total: 2754 -> 2974 (+220)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 56 | created |
| Day 42 | missing | 66 | created |
| Day 43 | missing | 48 | created |
| Day 44 | missing | 50 | created |

### Hi Young Fernandez (Hi Young Fernandez, user 26)
Total: 3294 -> 3625 (+331)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 81 | created |
| Day 42 | missing | 108 | created |
| Day 43 | missing | 73 | created |
| Day 44 | missing | 69 | created |

### PLAYOFFantasis (PLAYOFFantasis, user 27)
Total: 5492 -> 5658 (+166)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 32 | 57 | 57 | replaced |
| Day 34 | 80 | 80 | replaced |
| Day 35 | 154 | 154 | replaced |
| Day 36 | 94 | 94 | replaced |
| Day 38 | 163 | 163 | replaced |
| Day 41 | missing | 166 | created |

### 条条 (条条, user 28)
Total: 3132 -> 3398 (+266)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 78 | created |
| Day 42 | missing | 80 | created |
| Day 43 | missing | 52 | created |
| Day 44 | missing | 56 | created |

### OldTrafford (OldTrafford, user 30)
Total: 4771 -> 5525 (+754)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 32 | 78 | 78 | replaced |
| Day 34 | 89 | 89 | replaced |
| Day 35 | 147 | 147 | replaced |
| Day 36 | 87 | 87 | replaced |
| Day 37 | 182 | 182 | replaced |
| Day 39 | 183 | 183 | replaced |
| Day 41 | missing | 192 | created |
| Day 42 | missing | 207 | created |
| Day 43 | missing | 186 | created |
| Day 44 | missing | 169 | created |

### 座山雕 (座山雕, user 31)
Total: 5689 -> 5689 (+0)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 32 | 95 | 95 | replaced |
| Day 33 | 134 | 134 | replaced |
| Day 34 | 90 | 90 | replaced |
| Day 35 | 131 | 131 | replaced |
| Day 36 | 79 | 79 | replaced |
| Day 38 | 156 | 156 | replaced |

### conan joe (conan joe, user 32)
Total: 5109 -> 5684 (+575)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 185 | created |
| Day 42 | missing | 212 | created |
| Day 44 | missing | 178 | created |

### northlions (northlions, user 33)
Total: 4464 -> 4884 (+420)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 41 | missing | 98 | created |
| Day 42 | missing | 130 | created |
| Day 43 | missing | 101 | created |
| Day 44 | missing | 91 | created |

### KIMI (KIMI, user 34)
Total: 4234 -> 4587 (+353)

| Day | Before | After | Lock |
| --- | ---: | ---: | --- |
| Day 7 | 19 | 19 | replaced |
| Day 41 | missing | 81 | created |
| Day 42 | missing | 104 | created |
| Day 43 | missing | 97 | created |
| Day 44 | missing | 71 | created |
