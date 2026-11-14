// Design tokens from the Figma file "Tủ đồ thông minh — Outfit mỗi ngày" (frame "Component & màu").
export const C = {
  bg: '#FCF8F8', // Nền
  card: '#FFFFFF',
  pink: '#F9DFDF', // Bề mặt chọn: secondary buttons, selected chips, banners
  pinkSoft: '#FBEFEF', // Nền phụ: canvas / image backdrops
  accent: '#F5AFAF', // Màu nhấn
  wine: '#762E48', // Nút & chữ nhấn: primary buttons, active tab
  text: '#30232A', // Chữ chính
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
