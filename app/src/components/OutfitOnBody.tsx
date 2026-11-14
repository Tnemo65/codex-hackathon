// "Trên người": the outfit drawn on a neutral figure built from the user's proportions (see src/body.ts).
// Pure presentational: no network, no storage. All coordinates derive from width/height.
import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { Ellipse, Line, Path, Text as SvgText } from 'react-native-svg';
import { bodyMetrics, figureFrame, layeredItems, PANEL, slotBox, type BodyMetrics, type Frame } from '../body';
import { C, R } from '../theme';
import type { Item, Kind, Profile } from '../types';
import { PROPORTION_LABEL } from '../types';

const SKIN = '#E6DEDA'; // light warm grey mannequin
const THUMB_ORDER: Kind[] = ['outer', 'top', 'dress', 'bottom', 'shoes', 'bag'];

type Pt = [number, number];
type Seg = { p: Pt; c?: Pt }; // point, optional quadratic control (both in figure units, x relative to centre)

/** Silhouette outline (torso + legs) as one closed path; left half is listed, right half is mirrored. */
function silhouettePath(m: BodyMetrics, f: Frame): string {
  const X = (x: number) => (f.cx + x * f.fh).toFixed(1);
  const Y = (y: number) => (f.top + y * f.fh).toFixed(1);
  const { shoulderHW: sh, waistHW: wa, hipHW: hi } = m;
  const neck = 0.024, gap = 0.006;
  const kc = hi * 0.45, kw = 0.034; // knee: leg centre, half-width
  const ac = hi * 0.4, aw = 0.019; // ankle
  const left: Seg[] = [
    { p: [-neck, m.chin + 0.01] },
    { p: [-neck, m.shoulders - 0.01] },
    { p: [-sh + 0.02, m.shoulders] },
    { p: [-sh, m.shoulders + 0.03], c: [-sh, m.shoulders] },
    { p: [-sh * 0.88, m.armpit] },
    { p: [-wa, m.waist], c: [-wa * 1.02, (m.armpit + m.waist) / 2 + 0.02] },
    { p: [-hi, m.hips], c: [-hi * 0.98, m.waist + (m.hips - m.waist) * 0.45] },
    { p: [-(kc + kw), m.knees], c: [-hi * 1.0, (m.hips + m.knees) / 2 - 0.03] },
    { p: [-(ac + aw), m.ankles], c: [-(kc + kw * 0.9), (m.knees + m.ankles) / 2] },
    { p: [-(ac + aw + 0.008), m.feet] },
    { p: [-(ac - aw), m.feet] },
    { p: [-(ac - aw), m.ankles] },
    { p: [-(kc - kw), m.knees], c: [-(ac - aw * 1.3), (m.knees + m.ankles) / 2] },
    { p: [-gap, m.crotch], c: [-(gap + 0.012), (m.knees + m.crotch) / 2] },
  ];
  const cmd = (s: Seg, p: Pt) => (s.c ? `Q${X(s.c[0])},${Y(s.c[1])} ${X(p[0])},${Y(p[1])}` : `L${X(p[0])},${Y(p[1])}`);
  let d = `M${X(left[0].p[0])},${Y(left[0].p[1])}`;
  for (let i = 1; i < left.length; i++) d += cmd(left[i], left[i].p);
  // Right half: walk back up, mirrored. Segment i (p[i-1] -> p[i], control c[i]) reversed goes p[i] -> p[i-1].
  const mir = (p: Pt): Pt => [-p[0], p[1]];
  d += `L${X(gap)},${Y(m.crotch)}`;
  for (let i = left.length - 1; i >= 1; i--) {
    const s = left[i];
    d += cmd({ p: mir(left[i - 1].p), c: s.c && mir(s.c) }, mir(left[i - 1].p));
  }
  return d + 'Z';
}

/** Arms as thick round-capped strokes; arm length is fixed so only torso vs legs changes with proportion. */
function armPath(m: BodyMetrics, f: Frame, s: 1 | -1): string {
  const X = (x: number) => (f.cx + s * x * f.fh).toFixed(1);
  const Y = (y: number) => (f.top + y * f.fh).toFixed(1);
  const sh = m.shoulderHW;
  return `M${X(sh - 0.015)},${Y(m.shoulders + 0.025)} Q${X(sh + 0.03)},${Y(0.36)} ${X(m.hipHW + 0.04)},${Y(0.53)}`;
}

// Width / height of a remote image (1 until it is known).
function useAspect(uri: string): number {
  const [aspect, setAspect] = useState(1);
  useEffect(() => {
    let live = true;
    Image.getSize(uri, (w, h) => { if (live && w > 0 && h > 0) setAspect(w / h); }, () => {});
    return () => { live = false; };
  }, [uri]);
  return aspect;
}

function ItemImage({ item, box }: { item: Item; box: { x: number; y: number; w: number; h: number } }) {
  const uri = item.cutout_url ?? item.image_url;
  const aspect = useAspect(uri);
  const pos = { position: 'absolute' as const, left: box.x, top: box.y, width: box.w, height: box.h };
  if (item.cutout_url) {
    // Cut-outs fill their own canvas: trousers and dresses span the slot from waistband to hem,
    // other pieces get a square as big as the slot's longer side so they are not shrunk into a narrow box.
    const tall = item.kind === 'bottom' || item.kind === 'dress';
    const h = tall ? box.h : Math.max(box.w, box.h);
    const w = tall ? box.h * aspect : h;
    return <Image source={{ uri }} style={{ position: 'absolute', left: box.x + box.w / 2 - w / 2, top: box.y, width: w, height: h }} resizeMode="contain" />;
  }
  // Plain photo: a white-bordered card pinned on the figure; `contain` keeps the hem visible.
  return (
    <View style={[pos, { borderRadius: 10, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: C.card, overflow: 'hidden' }]}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </View>
  );
}

export function OutfitOnBody({ items, profile, width, height }: { items: Item[]; profile: Profile | null; width: number; height: number }) {
  const m = bodyMetrics(profile);
  const f = figureFrame(m, width, height);
  const areaW = width * PANEL.areaFrac;
  const waistY = f.top + m.waist * f.fh;
  const lineHalf = Math.min(areaW / 2 - 4, 0.27 * f.fh); // reaches past the garments on both sides
  const armW = 0.046 * f.fh;
  const worn = layeredItems(items);

  // Right column thumbnails
  const thumbs = [...items].sort((a, b) => THUMB_ORDER.indexOf(a.kind) - THUMB_ORDER.indexOf(b.kind));
  const colX = areaW, colW = width - areaW - 8;
  const cellH = thumbs.length ? Math.min((height - 16) / thumbs.length, colW * 1.25) : 0;
  const labelH = 14;

  return (
    <View style={{ width, height, backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' }}>
      <Svg width={areaW} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Path d={armPath(m, f, -1)} stroke={SKIN} strokeWidth={armW} strokeLinecap="round" fill="none" />
        <Path d={armPath(m, f, 1)} stroke={SKIN} strokeWidth={armW} strokeLinecap="round" fill="none" />
        <Path d={silhouettePath(m, f)} fill={SKIN} />
        <Ellipse cx={f.cx} cy={f.top + 0.062 * f.fh} rx={0.046 * f.fh} ry={0.062 * f.fh} fill={SKIN} />
      </Svg>

      {worn.map((it) => <ItemImage key={it.id} item={it} box={slotBox(it, m, f)} />)}

      {/* Natural waist marker, drawn above the clothes so the proportion difference stays visible */}
      <Svg width={areaW} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Line x1={f.cx - lineHalf} y1={waistY} x2={f.cx + lineHalf} y2={waistY} stroke={C.wine} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 3" />
        <SvgText x={f.cx + lineHalf} y={waistY - 3} fontSize={11} fill={C.wine} fillOpacity={0.8} textAnchor="end">eo</SvgText>
      </Svg>

      {thumbs.map((it, i) => (
        <View key={it.id} style={{ position: 'absolute', left: colX, top: 8 + i * cellH, width: colW, height: cellH, alignItems: 'center', justifyContent: 'center' }}>
          <View style={it.cutout_url ? null : { borderRadius: 8, overflow: 'hidden', backgroundColor: C.card }}>
            <Image source={{ uri: it.cutout_url ?? it.image_url }} style={{ width: colW - 8, height: Math.max(8, cellH - labelH - 6) }} resizeMode="contain" />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: C.text, marginTop: 2, maxWidth: colW, textAlign: 'center' }}>{it.name}</Text>
        </View>
      ))}

      {profile ? (
        <Text numberOfLines={1} style={{ position: 'absolute', left: 12, bottom: 6, maxWidth: areaW - 12, fontSize: 11, color: C.sub }}>
          {`${Math.round(profile.height_cm)} cm · ${PROPORTION_LABEL[profile.proportion] ?? ''}`}
        </Text>
      ) : null}
    </View>
  );
}
