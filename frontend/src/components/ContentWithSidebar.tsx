interface ContentWithSidebarProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  sidebarClassName?: string;
}

export default function ContentWithSidebar({
  children,
  sidebar,
  className,
  contentClassName,
  sidebarClassName
}: ContentWithSidebarProps) {
  if (!sidebar) {
    return <div className={["space-y-5", className, contentClassName].filter(Boolean).join(" ")}>{children}</div>;
  }

  return (
    <div className={["grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_310px]", className].filter(Boolean).join(" ")}>
      <div className={["space-y-5", contentClassName].filter(Boolean).join(" ")}>{children}</div>
      <div className={sidebarClassName}>{sidebar}</div>
    </div>
  );
}
