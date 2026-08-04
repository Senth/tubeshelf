/**
 * The TubeShelf icon. Two drawings rather than one recoloured drawing, because
 * the theme is applied by a `dark` class on <html> and these render server-side
 * where the active theme is not known.
 */

export function TubeShelfMark({ size = 80 }: { size?: number }) {
  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="dark:hidden"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="100" height="100" rx="18" fill="#e0e0e0" />
        <rect x="18" y="58" width="64" height="12" fill="#333" />
        <rect x="18" y="66" width="64" height="4" fill="#555" />
        <rect x="26" y="38" width="12" height="26" fill="#666" />
        <rect x="44" y="32" width="12" height="32" fill="#888" />
        <polygon points="62,32 78,50 62,64" fill="#d32f2f" />
      </svg>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="hidden dark:block"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="100" height="100" rx="18" fill="#1e1e1e" />
        <rect x="18" y="58" width="64" height="12" fill="#3b3b3b" />
        <rect x="18" y="66" width="64" height="4" fill="#2a2a2a" />
        <rect x="26" y="38" width="12" height="26" fill="#666" />
        <rect x="44" y="32" width="12" height="32" fill="#777" />
        <polygon points="62,32 78,50 62,64" fill="#d32f2f" />
      </svg>
    </>
  );
}
