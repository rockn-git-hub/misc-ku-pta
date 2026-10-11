type MenuIconName = "open" | "save" | "pdf" | "more" | "add-table" | "range-select" | "participants" | "search" | "inspector";

/** 操作ボタンで文字色を継承する24pxの装飾アイコン */
export function MenuIcon({ name }: { name: MenuIconName }) {
  const shapes = {
    open: <><path d="M3 9V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1"/><path d="M4.5 20h14.2a2 2 0 0 0 1.9-1.4l2-7.6H5l-2 7.3A1.4 1.4 0 0 0 4.5 20Z"/></>,
    save: <><path d="M4 3h13l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/><path d="M13 5v2"/></>,
    pdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><g strokeWidth={1.2}><path d="M6.8 17v-5h1.1a1.3 1.3 0 0 1 0 2.6H6.8M10.9 12v5h.7c2.3 0 2.3-5 0-5ZM16 17v-5h2.5M16 14.3h2"/></g></>,
    more: <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
    "add-table": <><rect x="2.5" y="7" width="13" height="11" rx="2"/><path d="M5 4h2M11 4h2M5 21h2M11 21h2M18.5 3v7M15 6.5h7"/></>,
    "range-select": <><path d="M7 3H3v4M11 3h3M18 3h3v4M3 11v3M3 18v3h4M11 21h3M21 11v2"/><path d="m12 11 2.2 10 2.2-3.2 3.8 2 1.1-2-3.8-2Z"/></>,
    "participants": <><circle cx="7" cy="7" r="3"/><path d="M2.5 19v-2a4.5 4.5 0 0 1 9 0v2M15 6h6M15 12h6M15 18h6"/></>,
    "search": <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.2 15.2 5.3 5.3"/></>,
    "inspector": <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16M17 8h1M17 12h1M17 16h1"/></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>;
}
