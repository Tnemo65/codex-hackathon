// Canvas view (Figma "todayCanvas"): item cut-outs in a loose grid on a soft pink panel, label under each.
// Pure presentational; cells fill the given height, no scrolling.
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { C, R } from '../theme';
import type { Item, Kind } from '../types';

const ORDER: Kind[] = ['outer', 'top', 'dress', 'bottom', 'shoes', 'bag'];
const PAD = 14, GAP = 8, LABEL_H = 16;

export function OutfitCanvas({ items, width, height, onPressItem }: { items: Item[]; width: number; height: number; onPressItem?: (item: Item) => void }) {
  const sorted = [...items].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const cols = sorted.length > 6 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(sorted.length / cols));
  const cellW = (width - PAD * 2 - GAP * (cols - 1)) / cols;
  const cellH = (height - PAD * 2 - GAP * (rows - 1)) / rows;
  const imgH = Math.max(8, cellH - LABEL_H - 4);

  return (
    <View style={{ width, height, backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' }}>
      {sorted.length === 0 ? (
        <Text style={{ position: 'absolute', top: height / 2 - 8, width, textAlign: 'center', fontSize: 13, color: C.sub }}>Chưa có món nào</Text>
      ) : null}
      {sorted.map((it, i) => (
        <Pressable
          key={it.id}
          onPress={() => onPressItem?.(it)}
          accessibilityRole="button"
          accessibilityLabel={it.name}
          style={{ position: 'absolute', left: PAD + (i % cols) * (cellW + GAP), top: PAD + Math.floor(i / cols) * (cellH + GAP), width: cellW, height: cellH, alignItems: 'center' }}
        >
          {/* plain photos sit in a rounded white card (radius on a `contain` Image alone would not round the photo) */}
          <View style={it.cutout_url ? null : { borderRadius: 12, overflow: 'hidden', backgroundColor: C.card }}>
            <Image source={{ uri: it.cutout_url ?? it.image_url }} style={{ width: cellW * 0.9, height: imgH }} resizeMode="contain" />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 10, color: C.text, marginTop: 4, maxWidth: cellW, textAlign: 'center' }}>{it.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}
