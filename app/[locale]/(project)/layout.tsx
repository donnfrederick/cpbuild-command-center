/**
 * Project workspace layout — replaces the global dashboard nav when a user
 * is working inside a specific project. All routes under (project)/ use this
 * shell instead of the (dashboard)/ layout.
 */
export default function ProjectGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
