// App shell: boot (profile + wardrobe), onboarding, tab bar. Screens live in src/screens.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, setDeviceId, todayStr } from './src/api';
import Calendar from './src/screens/Calendar';
import Onboarding from './src/screens/Onboarding';
import Studio from './src/screens/Studio';
import Stylist from './src/screens/Stylist';
import ProfileScreen from './src/screens/ProfileScreen';
import Today from './src/screens/Today';
import TryOn from './src/screens/TryOn';
import Wardrobe from './src/screens/Wardrobe';
import { C } from './src/theme';
import type { Item, Profile } from './src/types';
import { BOTTOM_INSET, ErrorBox, Icon, Loading } from './src/ui';

type Tab = 'today' | 'calendar' | 'wardrobe' | 'studio' | 'stylist' | 'tryon' | 'profile';
const REMOVE_BG_KEY = 'tudo.remove_bg';
const KEEP: Tab[] = ['today', 'wardrobe']; // tabs kept mounted between switches
// The five tabs from the Figma nav; Hồ sơ opens from the avatar, Mặc thử from Hôm nay / Phối đồ / Stylist.
const TABS: { id: Tab; label: string; icon: 'home' | 'calendar' | 'hanger' | 'layers' | 'chat' }[] = [
  { id: 'today', label: 'Hôm nay', icon: 'home' },
  { id: 'calendar', label: 'Lịch', icon: 'calendar' },
  { id: 'wardrobe', label: 'Tủ đồ', icon: 'hanger' },
  { id: 'studio', label: 'Phối đồ', icon: 'layers' },
  { id: 'stylist', label: 'Stylist', icon: 'chat' },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restoreCode, setRestoreCode] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const itemsRequestId = useRef(0);
  const [tab, setTab] = useState<Tab>('today');
  const [tryOnIds, setTryOnIds] = useState<string[]>([]);
  const [tryOnFrom, setTryOnFrom] = useState<Tab>('today');
  const [autoAdd, setAutoAdd] = useState<'camera' | 'library' | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [todayKey, setTodayKey] = useState(0); // bump to make Today reload its plan
  const [visited, setVisited] = useState<Tab[]>(['today']);
  useEffect(() => {
    if (KEEP.includes(tab)) setVisited((v) => (v.includes(tab) ? v : [...v, tab]));
  }, [tab]);

  const loadItems = useCallback(async () => {
    const requestId = ++itemsRequestId.current;
    setItemsLoading(true);
    setItemsError(null);
    try {
      const fresh = (await api.itemsList()).items;
      if (requestId !== itemsRequestId.current) return;
      // Signed URLs change on every list call; keep the URLs we already loaded when the picture is unchanged
      // (same item, cut-out still present or still missing) so images come from cache instead of downloading again.
      setItems((prev) => {
        const old = new Map(prev.map((i) => [i.id, i]));
        return fresh.map((i) => {
          const o = old.get(i.id);
          return o && !!o.cutout_url === !!i.cutout_url ? { ...i, image_url: o.image_url, cutout_url: o.cutout_url } : i;
        });
      });
    } catch (e) {
      if (requestId !== itemsRequestId.current) return;
      setItemsError(e instanceof Error ? e.message : 'Không tải được tủ đồ.');
      throw e;
    } finally {
      if (requestId === itemsRequestId.current) setItemsLoading(false);
    }
  }, []);

  const boot = useCallback(async () => {
    // Invalidate any inventory request from the previous device/profile before restore starts loading.
    itemsRequestId.current += 1;
    setBooting(true);
    setBootError(null);
    setItems([]);
    setItemsLoading(false);
    setItemsError(null);
    try {
      // These reads are independent. Start the local preference read while the first API call
      // initializes the device ID and fetches the profile.
      const [removeBgValue, { profile: p, restore_code }] = await Promise.all([
        AsyncStorage.getItem(REMOVE_BG_KEY),
        api.profileGet(),
      ]);
      setRemoveBg(removeBgValue !== '0'); // background removal is on unless switched off
      setProfile(p);
      setRestoreCode(restore_code);
      setOnboarding(!p);
      // Let the app shell and Today plan request start while the wardrobe is loading.
      if (p) void loadItems().catch(() => {});
    } catch (e) {
      setBootError(e instanceof Error ? e.message : 'Không kết nối được máy chủ.');
    } finally {
      setBooting(false);
    }
  }, [loadItems]);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function saveProfile(p: Profile) {
    const r = await api.profileSave(p);
    setProfile(r.profile);
    setRestoreCode(r.restore_code);
  }

  // Point this install at an existing wardrobe, then reload everything.
  async function restore(code: string) {
    const { device_id } = await api.profileRestore(code);
    await setDeviceId(device_id);
    setTab('today');
    await boot();
    setTodayKey((k) => k + 1);
  }

  const openTryOn = (ids: string[]) => { setTryOnIds(ids); setTryOnFrom(tab); setTab('tryon'); };
  const openProfile = () => setTab('profile');
  const planChanged = () => { setTodayKey((k) => k + 1); setTab('today'); };

  let body: React.ReactNode;
  if (booting) {
    body = <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}><Loading text="Đang mở tủ đồ…" /></View>;
  } else if (bootError) {
    body = <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}><ErrorBox message={bootError} onRetry={boot} /></View>;
  } else if (onboarding || !profile) {
    body = (
      <Onboarding
        initial={profile ?? undefined}
        onRestore={restore}
        onDone={async (p, next) => {
          await saveProfile(p);
          setOnboarding(false);
          await loadItems().catch(() => {});
          if (next === 'home') setTab('today');
          else {
            setTab('wardrobe');
            setAutoAdd(next === 'add_camera' ? 'camera' : 'library');
          }
        }}
      />
    );
  } else if (tab === 'tryon') {
    body = (
      <TryOn
        items={items}
        profile={profile}
        initialItemIds={tryOnIds}
        onBack={() => setTab(tryOnFrom)}
        onUseToday={async (ids) => {
          const outfit = { item_ids: ids, name: 'Bộ đã mặc thử', why: 'Bạn chọn bộ này sau khi xem ảnh phối.', fit_note: '', warnings: [] };
          await api.planSet(todayStr(0), 'planned', outfit);
          setTodayKey((k) => k + 1);
          setTab('today');
        }}
      />
    );
  } else if (KEEP.includes(tab)) {
    body = null; // Hôm nay / Tủ đồ stay mounted below
  } else if (tab === 'calendar' || tab === 'studio' || tab === 'stylist') {
    const Tabbed = tab === 'calendar' ? Calendar : tab === 'studio' ? Studio : Stylist;
    body = <Tabbed items={items} profile={profile} onOpenTryOn={openTryOn} onPlanChanged={planChanged} onOpenProfile={openProfile} />;
  } else if (tab === 'profile') {
    body = (
      <ProfileScreen
        profile={profile}
        restoreCode={restoreCode}
        removeBg={removeBg}
        onToggleRemoveBg={(v) => {
          setRemoveBg(v);
          void AsyncStorage.setItem(REMOVE_BG_KEY, v ? '1' : '0');
        }}
        onSave={saveProfile}
        onRestore={restore}
        onRedoOnboarding={() => setOnboarding(true)}
      />
    );
  }

  const ready = !booting && !bootError && !onboarding && !!profile;
  const showTabs = ready && tab !== 'tryon';
  // Kept screens are mounted once and hidden when inactive, so switching back does not refetch the plan,
  // weather and images. Calendar, Phối đồ and Stylist still remount to pick up plan changes and queued picks.
  const kept = ready && profile ? visited.map((t) => (
    <View key={t} style={{ flex: 1, display: tab === t ? 'flex' : 'none' }}>
      {t === 'today' ? (
        <Today
          key={todayKey}
          profile={profile}
          items={items}
          itemsLoading={itemsLoading}
          itemsError={itemsError}
          onRetryItems={() => { void loadItems().catch(() => {}); }}
          onOpenTryOn={openTryOn}
          onGoWardrobe={() => setTab('wardrobe')}
          onItemsChanged={() => void loadItems().catch(() => {})}
        />
      ) : (
        <Wardrobe items={items} profile={profile} loading={itemsLoading} itemsError={itemsError} onRetryItems={() => { void loadItems().catch(() => {}); }} removeBg={removeBg} onReload={loadItems} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(null)} onOpenProfile={openProfile} onOpenStudio={() => setTab('studio')} />
      )}
    </View>
  )) : null;

  return (
    <View accessibilityRole="main" style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        <View style={{ flex: 1 }}>{body}{kept}</View>
        {showTabs ? (
          <View accessibilityRole="tablist" accessibilityLabel="Chuyển màn hình" style={{ flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, paddingBottom: 15 + BOTTOM_INSET }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <Pressable key={t.id} onPress={() => { if (t.id === 'tryon') setTryOnIds([]); setTab(t.id); }} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.label}
                  style={{ flex: 1, alignItems: 'center', gap: 6, minHeight: 48 }}>
                  <View style={{ width: 50, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: active ? C.pink : 'transparent' }}>
                    <Icon name={t.icon} size={20} color={active ? C.wine : C.sub} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? C.wine : C.sub }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      <StatusBar style="dark" />
    </View>
  );
}
