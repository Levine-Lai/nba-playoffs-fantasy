import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel">
      <div className="panel-head">Page Not Found</div>
      <div className="panel-body space-y-3 text-sm text-slate-700">
        <p>The page you visited does not exist in this prototype.</p>
        <p>Use the navigation tabs above or go back to the home page.</p>
        <Link
          href="/"
          className="inline-flex rounded bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-darkBlue"
        >
          Back To Home
        </Link>
      </div>
    </section>
  );
}

