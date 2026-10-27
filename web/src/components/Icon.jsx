// Line icons on a 24 grid, drawn with currentColor so they follow the text they sit in.
const P = {
  home: <path d="M4 11.5 12 4.5l8 7V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  match: <path d="M5 19v-7M11 19V5M17 19v-10M3 19.5h18" />,
  coaches: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.4-3.4 2.8-5.3 6-5.3s5.6 1.9 6 5.3" /><circle cx="17" cy="9" r="2.4" /><path d="M16.4 14.3c2.6.2 4.3 1.9 4.6 4.6" /></>,
  table: <><circle cx="12" cy="12.5" r="4.8" /><circle cx="12" cy="3.6" r="1.6" /><circle cx="20.2" cy="9.6" r="1.6" /><circle cx="3.8" cy="9.6" r="1.6" /><circle cx="17" cy="20" r="1.6" /><circle cx="7" cy="20" r="1.6" /></>,
  live: <><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /><path d="M8.1 7.9a5.8 5.8 0 0 0 0 8.2M15.9 7.9a5.8 5.8 0 0 1 0 8.2M5.2 5a9.8 9.8 0 0 0 0 14M18.8 5a9.8 9.8 0 0 1 0 14" /></>,
  club: <path d="M8 20.5h8M12 16.5v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4.5a2.8 2.8 0 0 0 3 4.2M17 6h2.5a2.8 2.8 0 0 1-3 4.2" />,
  book: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8.5 15l2.5 2.5 4.5-4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />,
  memory: <path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v14l-6.5-3.8L5.5 20V6A1.5 1.5 0 0 1 7 4.5Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  down: <path d="m6 9 6 6 6-6" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="m9 5 7 7-7 7" />,
  mic: <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0m6 6v3" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.2" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  pause: <path d="M8 5.5v13M16 5.5v13" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  warn: <path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.2" />,
  download: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />,
  spark: <><path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9-4.9-1.8 4.9-1.8z" /><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  goals: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.6" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></>,
  you: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6" /></>,
  send: <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" /><circle cx="12" cy="10" r="2.4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  heart: <path d="M12 19.5s-7.5-4.4-7.5-9.8A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.3c0 5.4-7.5 9.8-7.5 9.8z" />,
  share: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v6.5h14V13" />,
  more: <><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></>,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  route: <><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" /></>,
  verify: <><path d="M12 3.5 5 6.5v5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9v-5z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
};

export default function Icon({ name, size = 20, className = "" }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {P[name]}
    </svg>
  );
}
