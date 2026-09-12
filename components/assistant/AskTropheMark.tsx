/** AG2 V02 at compact sizes; approved V03 at display sizes. */
export function AskTropheMark({ size = 24 }: { size?: number }) {
if (size >= 28) return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">  <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">

    <rect x="3.25" y="5.4" width="3.45" height="6.2" rx=".9" strokeWidth="1.55"/>
    <path d="M4.1 7.05h1.75M4.1 9.95h1.75" strokeWidth=".9"/>
    <rect x="25.3" y="5.4" width="3.45" height="6.2" rx=".9" strokeWidth="1.55"/>
    <path d="M26.15 7.05h1.75M26.15 9.95h1.75" strokeWidth=".9"/>
    <path d="M6.7 8.5h18.6" strokeWidth="1.95"/>
    <path d="M8.25 7.45v2.1M23.75 7.45v2.1" strokeWidth="1.1"/>

    <path d="M11.1 13.25h9.8M12.15 14.9h7.7" strokeWidth="1.55"/>
    <path d="M12.95 15.1v7.25M14.95 15.1v7.25M17.05 15.1v7.25M19.05 15.1v7.25" strokeWidth="1.05"/>
    <path d="M12.3 22.85h7.4M11.3 25.05h9.4M10.15 27.1h11.7" strokeWidth="1.6"/>
  </g>
</svg>;
return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">

    <rect x="3.65" y="5.3" width="2.45" height="4.4" rx=".72" strokeWidth="1.35" />
    <rect x="17.9" y="5.3" width="2.45" height="4.4" rx=".72" strokeWidth="1.35" />
    <path d="M6.1 7.5h11.8" strokeWidth="1.7" />
    <path d="M4.55 7.5h.65M18.8 7.5h.65" strokeWidth=".95" />

    <path d="M9.35 10.35h5.3M10.1 11.55h3.8" strokeWidth="1.3" />
    <path d="M10.55 11.55v5.35M12 11.55v5.35M13.45 11.55v5.35" strokeWidth=".9" />
    <path d="M9.75 17.35h4.5M8.85 19.05h6.3" strokeWidth="1.4" />
  </g>
</svg>;
}
