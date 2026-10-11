/** Biểu tượng Isola: núi trong vòng tròn (vòng teal + đĩa navy + núi/sóng trắng). */
export default function BrandLogo({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      {/* vòng teal */}
      <circle cx="50" cy="50" r="46" fill="none" stroke="#3f8a9c" strokeWidth="5" />
      {/* đĩa navy */}
      <circle cx="50" cy="50" r="38" fill="#1e2f5f" />
      {/* núi */}
      <path fill="#ffffff" d="M24 62 L39 43 L43.5 47.5 L57 27 L64 37.5 L61 39.5 L67.5 41.5 L76 62 Z" />
      {/* khe tuyết */}
      <path fill="none" stroke="#1e2f5f" strokeWidth="2.2" strokeLinecap="round" d="M51 37 L41 54" />
      {/* sóng */}
      <path fill="#ffffff" d="M26 69.5 Q41 61.5 57 67 Q66 70 72 67 Q63 77 46 72.5 Q36 70 29 74 Z" />
    </svg>
  )
}
