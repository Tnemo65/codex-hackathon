// "Tủ đồ" screen: grid, filter, add-item sheet, and navigation into ReviewItem.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { api } from '../api';
import { ShopCatalog } from '../components/ShopCatalog';
import { StatusMark } from '../components/StatusMark';
import { ThoughtLine } from '../components/ThoughtLine';
import { UndoToast } from '../components/UndoToast';
import { pickPhoto, takePhoto, type Photo } from '../photo';
import { C, R, S, T } from '../theme';
import { type Detection, type Item, type Kind, type Profile } from '../types';
import { Banner, Button, Card, ErrorBox, Icon, Loading, Screen, Sheet } from '../ui';
import ReviewItem from './ReviewItem';

type Filter = 'all' | 'top' | 'bottom' | 'acc';
const FILTERS: { key: Filter; label: string; kinds: Kind[] }[] = [
  { key: 'all', label: 'Tất cả', kinds: [] },
  { key: 'top', label: 'Áo', kinds: ['top', 'outer'] },
  { key: 'bottom', label: 'Quần / váy', kinds: ['bottom', 'dress'] },
  { key: 'acc', label: 'Phụ kiện', kinds: ['shoes', 'bag'] },
];
const GRID_GAP = 10;
const KIND_LABEL: Record<Kind, string> = { top: 'Áo', bottom: 'Quần / váy', dress: 'Váy liền', outer: 'Áo khoác', shoes: 'Giày', bag: 'Túi' };

type Piece = { id: string; name: string; state: 'running' | 'done' | 'failed'; start: number };

// One row on the waiting screen: status mark, name and seconds spent (frozen once finished).
function PieceRow({ piece }: { piece: Piece }) {
  const [now, setNow] = useState(Date.now());
  const frozen = useRef<number | null>(null);
  useEffect(() => {
    if (piece.state !== 'running') return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [piece.state]);
  if (piece.state !== 'running' && frozen.current === null) frozen.current = Date.now();
  const secs = Math.max(0, Math.round(((piece.state === 'running' ? now : frozen.current ?? now) - piece.start) / 1000));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
      <StatusMark state={piece.state} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.text }}>{piece.name}</Text>
      <Text style={T.sub}>{`${secs}s`}</Text>
    </View>
  );
}

export default function Wardrobe({ items, profile, loading, itemsError, onRetryItems, removeBg, onReload, autoAdd, onAutoAddHandled, onOpenProfile, onOpenStudio }: { items: Item[]; profile: Profile; loading: boolean; itemsError: string | null; onRetryItems: () => void; removeBg: boolean; onReload: () => Promise<void>; autoAdd: 'camera' | 'library' | null; onAutoAddHandled: () => void; onOpenProfile: () => void; onOpenStudio: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<'mine' | 'shop'>('mine');
  const [query, setQuery] = useState('');
  const { width } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<{ uri: string; mode: 'detect' | 'split'; note?: string } | null>(null); // photo AI is reading
  const [scan, setScan] = useState<{ photo: Photo; detections: Detection[]; picked: boolean[] } | null>(null); // 2+ pieces waiting for confirm
  const [added, setAdded] = useState<string | null>(null);
  const [multiWait, setMultiWait] = useState<string[]>([]); // ids of items added from one photo still waiting for their cut-out
  const [error, setError] = useState<string | null>(null);
  const [errorRetry, setErrorRetry] = useState<(() => void) | null>(null);
  const [review, setReview] = useState<{ item: Item; isNew: boolean } | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]); // per-item cut-out progress on the multi-item waiting screen
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null); // hidden from the grid, deleted when the undo fuse ends
  const [staleDeleteId, setStaleDeleteId] = useState<string | null>(null); // keep a deleted item hidden until a successful refresh
  const pendingRef = useRef<{ id: string; name: string } | null>(null);
  const [cut, setCut] = useState<{ id: string; url: string | null } | null>(null); // new item and its cut-out once ready

  // The server cuts the background out after it has answered (about 10 s), so ask again until the cut-out is there.
  const waitingId = cut && !cut.url ? cut.id : null;
  useEffect(() => {
    if (!waitingId) return;
    let tries = 0;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (!live) return;
      tries += 1;
      const url = await api.itemsList().then((r) => r.items.find((i) => i.id === waitingId)?.cutout_url ?? null).catch(() => null);
      if (!live) return;
      if (url) { setCut({ id: waitingId, url }); onReload().catch(() => {}); }
      else if (tries >= 12) { setCut(null); return; }
      if (!url) timer = setTimeout(() => { void poll(); }, 4000);
    };
    timer = setTimeout(() => { void poll(); }, 4000);
    return () => { live = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingId]);

  const multiKey = multiWait.join(',');
  useEffect(() => {
    if (!multiKey) return;
    let tries = 0;
    let live = true;
    const ids = multiKey.split(',');
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (!live) return;
      tries += 1;
      const list = await api.itemsList().then((r) => r.items).catch(() => null);
      if (!live) return;
      if (list) {
        const left = ids.filter((id) => !list.find((i) => i.id === id)?.cutout_url);
        if (left.length < ids.length) {
          await onReload().catch(() => {});
          if (!live) return;
        }
        if (left.length === 0) { setMultiWait([]); return; }
        if (tries < 15) {
          if (left.join(',') !== multiKey) setMultiWait(left);
          timer = setTimeout(() => { void poll(); }, 4000);
          return;
        }
      } else if (tries < 15) {
        timer = setTimeout(() => { void poll(); }, 4000);
        return;
      }
      setMultiWait([]);
    };
    timer = setTimeout(() => { void poll(); }, 4000);
    return () => { live = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiKey]);

  const processPhoto = async (photo: Photo) => {
    setError(null); setErrorRetry(null);
    try {
      setAdded(null);
      setBusy({ uri: photo.uri, mode: 'detect' });
      const { detections } = await api.itemsDetect(photo.base64);
      if (detections.length > 1) {
        setScan({ photo, detections, picked: detections.map(() => true) });
        return;
      }
      const { item } = await api.itemAdd(photo.base64, removeBg);
      await refreshAfterChange('Đã thêm món đồ');
      setReview({ item, isNew: true });
      if (removeBg && !item.cutout_url) setCut({ id: item.id, url: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
      setErrorRetry(() => () => { void processPhoto(photo); });
    } finally {
      setBusy(null);
    }
  };

  const add = async (picker: () => Promise<Photo | null>) => {
    setSheet(false);
    setError(null); setErrorRetry(null);
    try {
      const photo = await picker();
      if (photo) await processPhoto(photo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
      setErrorRetry(() => () => { void add(picker); });
    }
  };

  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!autoAdd || handled.current === autoAdd) return;
    handled.current = autoAdd;
    add(autoAdd === 'camera' ? takePhoto : pickPhoto).finally(() => { handled.current = null; onAutoAddHandled(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdd]);

  const back = () => setReview(null);

  // Really delete the item whose undo window ended; on failure show it again with the error.
  // Refresh can fail after the server has already deleted the item. Keep that failure distinct
  // from the delete itself so Retry only reloads the wardrobe instead of repeating DELETE.
  const refreshAfterDelete = async () => {
    try {
      await onReload();
      setStaleDeleteId(null);
      setError(null);
      setErrorRetry(null);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Có lỗi xảy ra.';
      setError(`Đã xoá món đồ. Chưa tải lại được tủ: ${detail}`);
      setErrorRetry(() => refreshAfterDelete);
    }
  };

  // The mutation already succeeded, so retry only the list refresh and never repeat the write.
  const refreshAfterChange = async (successMessage: string) => {
    const reportError = (e: unknown) => {
      const detail = e instanceof Error ? e.message : 'Có lỗi xảy ra.';
      setError(`${successMessage}, nhưng chưa tải lại được tủ: ${detail}`);
    };
    const retryRefresh = async () => {
      try {
        await onReload();
        setError(null);
        setErrorRetry(null);
      } catch (e) {
        reportError(e);
      }
    };
    try {
      await onReload();
      setError(null);
      setErrorRetry(null);
    } catch (e) {
      reportError(e);
      setErrorRetry(() => () => { void retryRefresh(); });
    }
  };

  const commitDelete = (p: { id: string; name: string }) => {
    setError(null); setErrorRetry(null);
    if (pendingRef.current?.id === p.id) pendingRef.current = null;
    api.itemDelete(p.id)
      .then(() => {
        setStaleDeleteId(p.id);
        void refreshAfterDelete();
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Không xoá được món đồ.');
        setErrorRetry(() => () => commitDelete(p));
      })
      .finally(() => setPendingDelete((cur) => (cur?.id === p.id ? null : cur)));
  };
  const startDelete = (item: Item) => {
    if (pendingRef.current) commitDelete(pendingRef.current);
    const p = { id: item.id, name: item.name };
    pendingRef.current = p;
    setPendingDelete(p);
    back();
  };
  useEffect(() => () => { if (pendingRef.current) { const p = pendingRef.current; pendingRef.current = null; api.itemDelete(p.id).catch(() => {}); } }, []);

  const addPicked = async () => {
    if (!scan) return;
    const { photo, detections, picked } = scan;
    setError(null); setErrorRetry(null);
    setBusy({ uri: photo.uri, mode: 'split' });
    try {
      const { items: created } = await api.itemsAddMany(photo.base64, detections.filter((_, i) => picked[i]), removeBg);
      // Wait for the cut-outs here, on the waiting screen (about 10-15 s), so the wardrobe opens complete
      // instead of saying "added" and then making the user wait again.
      let pending = removeBg ? created.filter((i) => !i.cutout_url).map((i) => i.id) : [];
      const total = pending.length;
      const t0 = Date.now();
      setPieces(created.map((i) => ({ id: i.id, name: i.name, state: pending.includes(i.id) ? 'running' : 'done', start: t0 })));
      for (let tries = 0; pending.length && tries < 15; tries++) {
        setBusy({ uri: photo.uri, mode: 'split', note: `Đã tách nền ${total - pending.length}/${total} món` });
        await new Promise((r) => setTimeout(r, 3000));
        const list = await api.itemsList().then((r) => r.items).catch(() => null);
        if (list) pending = pending.filter((id) => !list.find((i) => i.id === id)?.cutout_url);
        setPieces((ps) => ps.map((p) => (p.state === 'running' && !pending.includes(p.id) ? { ...p, state: 'done' } : p)));
      }
      if (pending.length) {
        setPieces((ps) => ps.map((p) => (pending.includes(p.id) ? { ...p, state: 'failed' } : p)));
        await new Promise((r) => setTimeout(r, 1200));
      }
      await refreshAfterChange(`Đã thêm ${created.length} món`);
      setScan(null);
      setAdded(pending.length ? `Đã thêm ${created.length} món · còn ${pending.length} ảnh đang tách nền` : `Đã thêm ${created.length} món`);
      if (pending.length) setMultiWait(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
      setErrorRetry(() => () => { void addPicked(); });
    } finally {
      setBusy(null);
      setPieces([]);
    }
  };

  if (review) {
    const { item, isNew } = review;
    return (
      <ReviewItem
        item={item}
        isNew={isNew}
        cutout={cut?.id === item.id ? cut.url : null}
        cutting={cut?.id === item.id && !cut.url}
        refreshError={error ?? itemsError}
        onRetryRefresh={errorRetry ?? onRetryItems}
        onBack={back}
        onSave={async (patch) => {
          await api.itemUpdate(item.id, patch);
          back();
          await refreshAfterChange('Đã lưu món đồ');
        }}
        onDelete={async () => { startDelete(item); }}
      />
    );
  }

  if (busy) {
    // Show the photo being read instead of a blank blocking spinner.
    const split = busy.mode === 'split';
    return (
      <Screen title="Thêm món đồ" subtitle={split ? 'AI đang tách từng món từ ảnh' : 'AI đang nhận diện món đồ trong ảnh'} scroll={false}>
        <View style={{ flex: 1, backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' }}>
          <Image source={{ uri: busy.uri }} resizeMode="contain" style={{ flex: 1 }} accessibilityLabel="Ảnh món đồ vừa chọn" />
        </View>
        {split ? (
          <>
            <ThoughtLine title="AI đang tách từng món" steps={['Lưu ảnh gốc', 'Tách từng món khỏi ảnh', 'Lưu vào tủ đồ', 'Tách nền từng món']} />
            {busy.note ? <Text style={[T.sub, { textAlign: 'center' }]}>{busy.note}</Text> : null}
            {pieces.length ? (
              <Card style={{ gap: 2, paddingVertical: 8 }}>
                {pieces.map((p) => <PieceRow key={p.id} piece={p} />)}
              </Card>
            ) : null}
          </>
        ) : (
          <ThoughtLine title="AI đang nhận diện" steps={[
            'Tìm từng món trong ảnh',
            'Đọc loại, màu, chất liệu từng món',
            'Gộp món trùng',
          ]} />
        )}
      </Screen>
    );
  }

  if (scan) {
    const { photo, detections, picked } = scan;
    const k = picked.filter(Boolean).length;
    const toggle = (idx: number) => setScan({ ...scan, picked: picked.map((v, i) => (i === idx ? !v : v)) });
    return (
      <Screen title="Kiểm tra món đồ" subtitle={`${detections.length} món từ 1 ảnh`}
        onBack={() => setScan(null)}
        footer={(
          <View style={{ gap: 8 }}>
            <Button title={`Thêm ${k} món`} disabled={k === 0} onPress={addPicked} />
            <Button title="Chụp lại" kind="outline" onPress={() => setScan(null)} />
          </View>
        )}>
        {error ? <ErrorBox message={error} onRetry={addPicked} /> : null}
        <View style={{ height: 120, backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' }}>
          <Image source={{ uri: photo.uri }} resizeMode="contain" style={{ flex: 1 }} accessibilityLabel="Ảnh gốc" />
        </View>
        {detections.map((d, idx) => (
          <Pressable key={idx} onPress={() => toggle(idx)} accessibilityRole="checkbox" accessibilityState={{ checked: picked[idx] }} accessibilityLabel={d.name}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 8, backgroundColor: C.card, borderRadius: R.card, borderWidth: 1, borderColor: C.line }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="hanger" size={22} color={C.wine} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{d.name}</Text>
              <Text numberOfLines={1} style={T.sub}>{`${KIND_LABEL[d.kind] ?? d.kind} · Độ chính xác ${Math.round(d.confidence)}%`}</Text>
            </View>
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: picked[idx] ? C.wine : 'transparent', borderWidth: 2, borderColor: picked[idx] ? C.wine : C.line }}>
              {picked[idx] ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
            </View>
          </Pressable>
        ))}
      </Screen>
    );
  }

  const kinds = FILTERS.find((f) => f.key === filter)!.kinds;
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => i.id !== pendingDelete?.id && i.id !== staleDeleteId && (filter === 'all' || kinds.includes(i.kind))
    && (!q || [i.name, i.category, i.color_name].some((v) => v?.toLowerCase().includes(q))));
  // Measured grid width (a web scrollbar or safe-area makes it narrower than the window), so 3 tiles always fit and fill the row.
  const tile = Math.floor(((gridW || Math.min(width, 520) - S.page * 2) - 2 * GRID_GAP) / 3);

  return (
    <>
      <Screen title="Tủ đồ" subtitle={`${items.length} món`}
        right={(
          <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel="Hồ sơ"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="user" size={20} color={C.wine} />
          </Pressable>
        )}
        scroll={false}
        footer={tab === 'mine' ? <Button title="Thêm đồ" onPress={() => setSheet(true)} /> : undefined}>
        <View style={{ flexDirection: 'row', height: 44, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.chip, overflow: 'hidden' }}>
          {([['mine', 'Tủ của tôi'], ['shop', 'Gợi ý mua']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="button" accessibilityState={{ selected: tab === k }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === k ? C.pink : 'transparent' }}>
              <Text style={{ fontSize: 14, fontWeight: tab === k ? '700' : '500', color: tab === k ? C.wine : C.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {tab === 'shop' ? (
          <>
            {itemsError ? <ErrorBox message={itemsError} onRetry={onRetryItems} /> : null}
            <ShopCatalog items={items} profile={profile} onOpenStudio={onOpenStudio} />
          </>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={shown}
            keyExtractor={(item) => item.id}
            numColumns={3}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            columnWrapperStyle={{ gap: GRID_GAP }}
            onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: S.gap, paddingBottom: 16 }}
            ListHeaderComponent={(
              <View style={{ gap: S.gap }}>
                {error ? <ErrorBox message={error} onRetry={errorRetry ?? undefined} /> : itemsError ? <ErrorBox message={itemsError} onRetry={onRetryItems} /> : null}
                {added ? <Banner text={added} /> : null}
                <TextInput value={query} onChangeText={setQuery} placeholder="Tìm trong tủ đồ" placeholderTextColor={C.sub}
                  accessibilityLabel="Tìm trong tủ đồ" autoCorrect={false}
                  style={{ height: 46, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.chip + 2, paddingHorizontal: 16, fontSize: 15, color: C.text }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {FILTERS.map((f) => (
                    <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="button" accessibilityState={{ selected: filter === f.key }}
                      style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.chip, borderWidth: 1,
                        backgroundColor: filter === f.key ? C.pink : C.card, borderColor: filter === f.key ? C.pink : C.line }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: filter === f.key ? '700' : '500', color: filter === f.key ? C.wine : C.text }}>{f.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {loading && items.length === 0 ? <Loading text="Đang tải tủ đồ…" /> : null}
              </View>
            )}
            ListEmptyComponent={!loading && !itemsError ? (
              <Card style={{ gap: 6, alignItems: 'center', padding: 24 }}>
                <Text style={T.h2}>{items.length === 0 ? 'Thêm món đồ đầu tiên' : q ? 'Không tìm thấy món phù hợp' : 'Chưa có món nào ở nhóm này'}</Text>
                <Text style={[T.sub, { textAlign: 'center' }]}>{items.length === 0 ? 'Chụp một món đồ, AI sẽ tự điền thông tin cho bạn.' : q ? 'Thử từ khoá khác hoặc xoá tìm kiếm để xem lại tủ đồ.' : 'Thử chọn nhóm khác để xem các món trong tủ.'}</Text>
                {q ? <Button title="Xoá tìm kiếm" kind="outline" onPress={() => setQuery('')} /> : null}
              </Card>
            ) : undefined}
            renderItem={({ item: it }) => (
              <Pressable onPress={() => setReview({ item: it, isNew: false })} accessibilityRole="button" accessibilityLabel={it.name}
                style={{ width: tile, height: tile, backgroundColor: C.pinkSoft, borderRadius: 16, padding: 8, gap: 4 }}>
                <Image source={{ uri: it.cutout_url ?? it.image_url }} resizeMode="contain" style={{ flex: 1 }} />
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: C.text, textAlign: 'center' }}>{it.name}</Text>
              </Pressable>
            )}
          />
        )}
      </Screen>
      {pendingDelete && tab === 'mine' ? (
        <UndoToast key={pendingDelete.id} text={`Đã xoá ${pendingDelete.name}`} onUndo={() => { pendingRef.current = null; setPendingDelete(null); }} onDone={() => commitDelete(pendingDelete)} />
      ) : null}
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Thêm món đồ" subtitle="Đặt đồ trên nền trơn, đủ sáng để nhận diện dễ hơn.">
        <Button title="Chụp ảnh" icon="camera" onPress={() => add(takePhoto)} />
        <Button title="Chọn từ thư viện" icon="image" kind="outline" onPress={() => add(pickPhoto)} />
        <Button title="Quay lại tủ đồ" kind="outline" onPress={() => setSheet(false)} />
      </Sheet>
    </>
  );
}
