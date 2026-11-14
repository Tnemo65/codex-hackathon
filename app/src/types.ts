// Shared data contract between the app and the `api` Edge Function. Keep both sides in sync.

export type Wear = 'f' | 'm' | 'u';
export type Proportion = 'long_torso' | 'balanced' | 'long_legs';
export type FitPref = 'om' | 'vua' | 'rong';
export type Commute = 'xe_may' | 'o_to' | 'xe_buyt' | 'di_bo';
export type DressCode = 'dong_phuc' | 'lich_su' | 'thoai_mai';

export interface Profile {
  name?: string;
  wear: Wear;
  job: string; // one of JOBS
  dress_code: DressCode;
  occasions: string[]; // from OCCASIONS
  styles: string[]; // from STYLES_F / STYLES_M, or free text
  height_cm: number;
  weight_kg: number;
  proportion: Proportion;
  fit_pref: FitPref;
  commute: Commute;
  city: string; // "Hà Nội"
  body_photo_url?: string | null;
}

export type Kind = 'top' | 'bottom' | 'dress' | 'outer' | 'shoes' | 'bag';

export interface Item {
  id: string;
  name: string;
  kind: Kind;
  category: string; // e.g. "Áo sơ mi"
  color_name: string;
  color_hex: string;
  material: string;
  pattern: string;
  occasions: string[];
  length: string; // top/outer: "crop" | "ngang_hong" | "qua_hong" | "dai"; bottom/dress: "tren_goi" | "ngang_goi" | "mat_ca" | "cham_dat"; else ""
  rise: string; // bottom only: "cap_cao" | "cap_vua" | "cap_thap"; else ""
  fit: string; // "om" | "vua" | "rong"
  image_url: string; // original photo
  cutout_url: string | null; // background removed, when available
  wear_count: number;
  last_worn: string | null; // YYYY-MM-DD
  created_at: string;
}

// AI-suggested piece to buy; `query` is the Vietnamese keyword used to open shop searches.
export interface ShopSuggestion { name: string; kind: Kind; color_name: string; why: string; query: string; price_hint: string }

export interface WeatherPart {
  t: number; // °C
  cond: string; // "Nắng nhẹ", "Mưa rào", ...
  rain_pct: number; // 0-100
  wind_kmh: number;
}

export interface Weather {
  place: string;
  date: string; // YYYY-MM-DD
  morning: WeatherPart;
  afternoon: WeatherPart;
  evening: WeatherPart;
  t_min: number;
  t_max: number;
  uv_max: number;
  summary: string; // "Sáng 19° · Nắng nhẹ"
}

export interface Outfit {
  item_ids: string[];
  name: string;
  why: string; // why this outfit fits weather, occasion and commute
  fit_note: string; // comment tied to the user's body proportions
  warnings: string[]; // short reminders, e.g. "Chiều mưa rào, nhớ mang ô"
}

export type PlanStatus = 'suggested' | 'planned' | 'worn';

export interface Plan {
  date: string;
  status: PlanStatus;
  outfit: Outfit | null; // the selected one
  options: Outfit[]; // the 3 suggestions
  weather: Weather | null;
  context: { occasion: string; commute: Commute };
}

export const JOBS = ['Sinh viên', 'Dân văn phòng', 'Giáo viên', 'Y tế', 'Kinh doanh, bán hàng', 'Sáng tạo, freelancer', 'Kỹ thuật, kỹ sư', 'Khác'];
export const OCCASIONS = ['Đi làm', 'Đi học', 'Hẹn hò', 'Cà phê, đi chơi', 'Tiệc, đám cưới', 'Du lịch', 'Tập thể thao'];
export const STYLES_F = ['Công sở thanh lịch', 'Basic tối giản', 'Hàn Quốc', 'Bánh bèo', 'Cá tính', 'Vintage', 'Y2K', 'Streetwear', 'Old money', 'Sporty'];
export const STYLES_M = ['Basic tối giản', 'Lịch lãm công sở', 'Hàn Quốc', 'Streetwear', 'Smart casual', 'Old money', 'Thể thao', 'Vintage'];

export const COMMUTE_LABEL: Record<Commute, string> = { xe_may: 'Xe máy', o_to: 'Ô tô', xe_buyt: 'Xe buýt', di_bo: 'Đi bộ' };
export const PROPORTION_LABEL: Record<Proportion, string> = { long_torso: 'Lưng dài, chân ngắn', balanced: 'Cân đối', long_legs: 'Chân dài, lưng ngắn' };
export const FIT_LABEL: Record<FitPref, string> = { om: 'Ôm', vua: 'Vừa', rong: 'Rộng' };
export const KIND_LABEL: Record<Kind, string> = { top: 'Áo', bottom: 'Quần, chân váy', dress: 'Váy liền', outer: 'Áo khoác', shoes: 'Giày', bag: 'Túi' };

export const DEFAULT_PROFILE: Profile = {
  wear: 'f',
  job: 'Dân văn phòng',
  dress_code: 'lich_su',
  occasions: ['Đi làm'],
  styles: [],
  height_cm: 158,
  weight_kg: 50,
  proportion: 'balanced',
  fit_pref: 'vua',
  commute: 'xe_may',
  city: 'Hà Nội',
  body_photo_url: null,
};
