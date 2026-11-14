// Body geometry for the "Trên người" view. Pure functions, no React.
// Model: y values are fractions of the figure height (0 = head top, 1 = soles); half-widths are ALSO fractions of the
// figure height so the figure keeps a human aspect. Head and shoulders stay fixed; proportion moves waist/hips/crotch, height scales the whole figure.
import type { Item, Kind, Profile } from './types';

export interface BodyMetrics {
  figH: number; // figure height as a fraction of the usable panel height
  headTop: number; chin: number; shoulders: number; armpit: number;
  waist: number; hips: number; crotch: number; knees: number; ankles: number; feet: number;
  shoulderHW: number; waistHW: number; hipHW: number;
  legLen: number; // crotch to soles
}

const H_MIN = 150, H_MAX = 180, FIG_MIN = 0.8, FIG_MAX = 0.96;
const LEG_LEN = { long_torso: 0.44, balanced: 0.47, long_legs: 0.5 } as const;
const WAIST_ABOVE_CROTCH = 0.15; // balanced natural waist sits 0.15 above the crotch
const WAIST_GAIN = 1.2; // waist moves a bit more than the crotch so the torso change reads clearly
const HIPS_ABOVE_CROTCH = 0.045;
const BMI_SLIM = 17, BMI_FULL = 30;
const NULL_PROFILE = { height_cm: 160, weight_kg: 52, proportion: 'balanced', wear: 'f' } as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function bodyMetrics(profile: Profile | null): BodyMetrics {
  const p = profile ?? NULL_PROFILE;
  const h = p.height_cm > 0 ? p.height_cm : 160;
  const figH = lerp(FIG_MIN, FIG_MAX, clamp01((h - H_MIN) / (H_MAX - H_MIN)));
  const legLen = LEG_LEN[p.proportion] ?? LEG_LEN.balanced;
  const crotch = 1 - legLen;
  const shift = crotch - (1 - LEG_LEN.balanced); // + = longer torso
  const bmi = (p.weight_kg > 0 ? p.weight_kg : 52) / Math.pow(h / 100, 2);
  const build = clamp01((bmi - BMI_SLIM) / (BMI_FULL - BMI_SLIM)); // 0 slim .. 1 full
  const male = p.wear === 'm';
  return {
    figH,
    headTop: 0, chin: 0.12, shoulders: 0.18, armpit: 0.25,
    waist: 1 - LEG_LEN.balanced - WAIST_ABOVE_CROTCH + shift * WAIST_GAIN,
    hips: crotch - HIPS_ABOVE_CROTCH,
    crotch,
    knees: 1 - legLen * 0.55,
    ankles: 0.96,
    feet: 1,
    shoulderHW: (0.113 + 0.012 * build) * (male ? 1.08 : 1),
    waistHW: lerp(0.064, 0.1, build) * (male ? 1.05 : 1),
    hipHW: lerp(0.095, 0.132, build) * (male ? 0.92 : 1),
    legLen,
  };
}

// ---- Slot boxes (pixels) for each garment kind ----
export interface Box { x: number; y: number; w: number; h: number }
/** Figure placement in pixels: horizontal centre, y of head top, figure height. */
export interface Frame { cx: number; top: number; fh: number }

export const LAYER_ORDER: Kind[] = ['bottom', 'top', 'dress', 'outer', 'bag', 'shoes'];

function topHem(m: BodyMetrics, length: string): number {
  switch (length) {
    case 'crop': return m.waist - 0.03;
    case 'qua_hong': return m.hips + 0.05;
    case 'dai': return (m.crotch + m.knees) / 2; // mid-thigh
    default: return m.hips; // ngang_hong / unknown
  }
}
function lowerHem(m: BodyMetrics, length: string, fallback: number): number {
  switch (length) {
    case 'tren_goi': return m.knees - 0.05;
    case 'ngang_goi': return m.knees;
    case 'mat_ca': return m.ankles;
    case 'cham_dat': return m.feet - 0.005;
    default: return fallback;
  }
}
function waistband(m: BodyMetrics, rise: string): number {
  if (rise === 'cap_cao') return m.waist - 0.035;
  if (rise === 'cap_thap') return m.hips - 0.02;
  return m.waist; // cap_vua / unknown
}

/** Box for one item, in pixels. Bottom/dress boxes are wide so `contain` images are usually height-limited (waistband/hem land on the
 *  slot edges); top/outer follow 2.3 x shoulder width, so a wide top photo is centred and its hem lands only approximately. */
export function slotBox(item: Item, m: BodyMetrics, f: Frame): Box {
  const wide = item.fit === 'rong' ? 1.18 : 1;
  const topW = 2.3 * m.shoulderHW * wide;
  let y0: number, y1: number, w: number, xc = 0;
  switch (item.kind) {
    case 'top': y0 = m.shoulders - 0.03; y1 = topHem(m, item.length); w = topW; break;
    case 'outer': y0 = m.shoulders - 0.035; y1 = topHem(m, item.length) + 0.03; w = topW * 1.15; break;
    case 'bottom': y0 = waistband(m, item.rise); y1 = lowerHem(m, item.length, m.ankles); w = 2 * m.hipHW * 1.35 * wide; break;
    case 'dress': y0 = m.shoulders - 0.02; y1 = lowerHem(m, item.length, m.knees); w = Math.max(topW, 2 * m.hipHW * 1.45) * wide; break;
    case 'shoes': y0 = m.ankles - 0.025; y1 = m.feet + 0.01; w = 2 * m.hipHW * 1.15; break;
    default: { // bag: beside the hip on the viewer's left (as in Figma), away from the thumbnail column
      const s = 0.13;
      y0 = m.hips - s * 0.6; y1 = y0 + s; w = s; xc = -(m.hipHW + 0.02 + s / 2);
    }
  }
  return { x: f.cx + (xc - w / 2) * f.fh, y: f.top + y0 * f.fh, w: w * f.fh, h: (y1 - y0) * f.fh };
}

/** First item per kind, back-to-front. */
export function layeredItems(items: Item[]): Item[] {
  return LAYER_ORDER.map((k) => items.find((it) => it.kind === k)).filter((it): it is Item => !!it);
}

/** Panel layout shared by the component and checks: left area for the figure, feet anchored above the caption strip. */
export const PANEL = { areaFrac: 0.68, padTop: 10, padBottom: 24, maxWidthPerH: 0.6 };
export function figureFrame(m: BodyMetrics, width: number, height: number): Frame {
  const areaW = width * PANEL.areaFrac;
  const usableH = height - PANEL.padTop - PANEL.padBottom;
  const fh = Math.min(m.figH * usableH, areaW / PANEL.maxWidthPerH);
  return { cx: areaW / 2, top: PANEL.padTop + usableH - fh, fh };
}
