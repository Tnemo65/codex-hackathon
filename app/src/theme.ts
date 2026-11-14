// Design tokens estimated from the Figma file "Tủ đồ thông minh — Outfit mỗi ngày".
export const C = {
  bg: '#FBF6F5',
  card: '#FFFFFF',
  pink: '#F9E1E3', // secondary buttons, selected chips, banners
  pinkSoft: '#FCEEEF', // canvas / image backdrops
  wine: '#6F2A46', // primary buttons, active tab
  text: '#2A2327',
  sub: '#7A6F74',
  line: '#EEE3E3',
  ok: '#2F6B4F',
  okBg: '#E3F0E8',
  danger: '#A1281C',
  dim: 'rgba(42,35,39,0.45)',
};

export const R = { card: 20, button: 14, chip: 12, image: 18 };
export const S = { page: 20, gap: 12 };

export const T = {
  h1: { fontSize: 24, fontWeight: '700' as const, color: C.text },
  h2: { fontSize: 18, fontWeight: '700' as const, color: C.text },
  body: { fontSize: 15, color: C.text },
  sub: { fontSize: 13, color: C.sub },
  small: { fontSize: 11, color: C.sub },
};
