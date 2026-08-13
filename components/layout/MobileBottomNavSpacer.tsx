/**
 * Reserves in-flow space for the fixed mobile bottom nav pill. The connectivity
 * strip is position:fixed above this clearance (see globals.css mobile rules).
 */
export function MobileBottomNavSpacer() {
  return (
    <div
      className="mobile-only"
      aria-hidden
      data-mobile-bottom-nav-spacer
      style={{
        flexShrink: 0,
        height: "calc(var(--mobile-bottom-nav-clearance, 86px) + env(safe-area-inset-bottom, 0px))",
      }}
    />
  );
}
