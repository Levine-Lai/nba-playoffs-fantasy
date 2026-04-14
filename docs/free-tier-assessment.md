# Free Tier Assessment

Assessment date: April 14, 2026.

## Short Answer

- `Vercel Hobby` is enough for the frontend for a personal / light-use version of this project.
- `Cloudflare Workers Free + D1 Free` is enough for storage, query count, and low request volume.
- The main risk is **Cloudflare Workers Free CPU time on auth routes**, because the current backend preserves `bcryptjs` password hashing for compatibility with existing users and data.

So the honest conclusion is:

- For a personal demo, private testing group, or very light usage: the free tiers are probably usable.
- For a stable public launch that you do not want to babysit: the backend free tier is **not comfortable enough** because of the CPU limit on `register` / `login`.

## Official Limits Used For This Assessment

Cloudflare Workers official limits:

- 100,000 requests per day on Workers Free
- 10 ms CPU time per HTTP request on Workers Free
- 50 subrequests per invocation on Workers Free

Source:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

Cloudflare D1 official limits:

- 10 databases per account on Free
- 500 MB maximum per database on Free
- 5 GB maximum storage per account on Free
- 50 D1 queries per Worker invocation on Free

Source:

- https://developers.cloudflare.com/d1/platform/limits/

Vercel Hobby official limits / guidance:

- 1,000,000 Edge Requests
- 4 CPU-hours active CPU
- 360 GB-hours provisioned memory
- up to 60s max function duration on Hobby
- typical monthly fair-use guidance: up to 100 GB Fast Data Transfer
- typical monthly fair-use guidance: up to 10 GB Fast Origin Transfer
- Hobby is for non-commercial personal use

Source:

- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/limits/fair-use-guidelines
- https://vercel.com/docs/manage-cdn-usage

## Project-Specific Fit

### 1. Frontend on Vercel

This frontend is a standard Next.js app with mostly static pages and client-side API calls to Cloudflare.

That means:

- Vercel Function usage is near zero for normal browsing, because the app is not using a heavy server-side API layer on Vercel.
- The main Vercel resource is CDN transfer.
- For a small private league product, Vercel Hobby is fine unless traffic or media transfer becomes unexpectedly large.

Practical estimate:

- If an average visit transfers around `1 MB`, then `100 GB` supports roughly `100,000 visits/month`, about `3,300 visits/day`.
- If an average visit transfers around `2 MB`, then `100 GB` supports roughly `50,000 visits/month`, about `1,600 visits/day`.

For this app, those numbers are usually enough for personal / friend-group usage.

### 2. Backend on Cloudflare Workers + D1

For raw request volume, the backend is okay on Free for a small project.

Example:

- `300 DAU * 20 API requests/day = 6,000 requests/day`
- `1,000 DAU * 20 API requests/day = 20,000 requests/day`
- `5,000 DAU * 20 API requests/day = 100,000 requests/day`

So request count alone is not the first problem unless usage becomes fairly large.

### 3. D1 storage and query count

Current data shape is tiny:

- player pool is only hundreds of rows
- users, lineups, sessions, and leagues are small relational tables
- schedule cache is one JSON document

This is comfortably below `500 MB`.

Per-request D1 query count is also well below the free limit of `50` in normal routes:

- `/api/lineup`, `/api/players`, `/api/transactions/options`: low
- `/api/profile`: higher than others, but still not close to 50 in normal usage

So D1 Free is not the bottleneck here.

### 4. The real problem: auth CPU cost

This project intentionally preserves existing auth behavior with `bcryptjs`.

Local timing sample from this branch:

- `bcryptjs.hashSync(..., 10)` took about `84 ms`
- `bcryptjs.compareSync(...)` took about `72 ms`

That matters because Cloudflare Workers Free only includes `10 ms CPU` per HTTP request.

Even allowing for runtime differences between local Node and Workers, this is the one limit that does **not** have comfortable headroom.

What this means in practice:

- `register` is the riskiest route
- `login` is also risky
- most non-auth routes are much safer because waiting on D1 or external fetch does not count as CPU time the same way pure JS hashing does

## My Conclusion

### Frontend

- `Vercel Hobby`: yes, good enough for this project's frontend in personal / small-scale use.

### Backend

- `Cloudflare Workers Free + D1 Free`: enough for storage and light traffic
- but **not a strong yes** for long-term reliable auth because `bcryptjs` is likely to be the first place that hits the free CPU ceiling

## Recommendation

Use one of these two paths:

### Option A: Stay functionally identical and keep auth compatible

Use the code in this branch as-is, but assume:

- frontend can stay on Vercel Hobby
- backend should ideally move to a paid Cloudflare Workers plan if you want peace of mind

This is the safest option for compatibility.

### Option B: Rework auth later if you insist on all-free

Possible future work:

- move away from `bcryptjs` on the Worker path
- adopt a Workers-friendlier auth strategy
- migrate old users gradually

I did **not** do this in this branch because your requirement was to preserve existing functionality and avoid behavior drift.

## Final Judgement

If your goal is:

- personal use
- small private league
- low daily sign-in volume

then the free stack is likely acceptable.

If your goal is:

- reliable public usage
- many new registrations
- no surprise auth failures

then the frontend can remain free, but the backend should not be treated as safely covered by Cloudflare Free forever.
