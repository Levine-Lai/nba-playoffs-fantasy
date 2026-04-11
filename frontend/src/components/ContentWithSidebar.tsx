interface ContentWithSidebarProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export default function ContentWithSidebar({ children, sidebar }: ContentWithSidebarProps) {
  if (!sidebar) {
    return <div className="space-y-5">{children}</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_310px]">
      <div className="space-y-5">{children}</div>
      <div>{sidebar}</div>
    </div>
  );
}
