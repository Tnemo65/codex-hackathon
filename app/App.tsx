// App shell: boot (profile + wardrobe), onboarding, tab bar. Screens live in src/screens.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, setDeviceId, todayStr } from './src/api';
import Onboarding from './src/screens/Onboarding';
import ProfileScreen from './src/screens/ProfileScreen';
import Today from './src/screens/Today';
import TryOn, { TRYON_READY } from './src/screens/TryOn';
import Wardrobe from './src/screens/Wardrobe';
import { C } from './src/theme';
import type { Item, Profile } from './src/types';
import { BOTTOM_INSET, ErrorBox, Icon, Loading } from './src/ui';

type Tab = 'today' | 'wardrobe' | 'tryon' | 'profile';
const REMOVE_BG_KEY = 'tudo.remove_bg';
const TABS: { id: Tab; label: string; icon: 'home' | 'hanger' | 'layers' | 'user' }[] = [
  { id: 'today', label: 'Hôm nay', icon: 'home' },
  { id: 'wardrobe', label: 'Tủ đồ', icon: 'hanger' },
  ...(TRYON_READY ? [{ id: 'tryon' as Tab, label: 'Mặc thử', icon: 'layers' as const }] : []),
  { id: 'profile', label: 'Hồ sơ', icon: 'user' },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restoreCode, setRestoreCode] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [tryOnIds, setTryOnIds] = useState<string[]>([]);
  const [autoAdd, setAutoAdd] = useState<'camera' | 'library' | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [todayKey, setTodayKey] = useState(0); // bump to make Today reload its plan

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      setItems((await api.itemsList()).items);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const boot = useCallback(async () => {
    setBooting(true);
    setBootError(null);
    try {
      setRemoveBg((await AsyncStorage.getItem(REMOVE_BG_KEY)) !== '0'); // background removal is on unless switched off
      const { profile: p, restore_code } = await api.profileGet();
      setProfile(p);
      setRestoreCode(restore_code);
      setOnboarding(!p);
      if (p) await loadItems();
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

  let body: React.ReactNode;
  if (booting) {
    body = <View style={{ flex: 1, justifyContent: 'center' }}><Loading text="Đang mở tủ đồ…" /></View>;
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
        onBack={() => setTab('today')}
        onUseToday={(ids) => {
          const outfit = { item_ids: ids, name: 'Bộ đã mặc thử', why: 'Bạn chọn bộ này sau khi xem ảnh phối.', fit_note: '', warnings: [] };
          void api.planSet(todayStr(0), 'planned', outfit).catch(() => {}).then(() => {
            setTodayKey((k) => k + 1);
            setTab('today');
          });
        }}
      />
    );
  } else if (tab === 'wardrobe') {
    body = <Wardrobe items={items} loading={itemsLoading} removeBg={removeBg} onReload={loadItems} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(null)} />;
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
  } else {
    body = (
      <Today
        key={todayKey}
        profile={profile}
        items={items}
        onOpenTryOn={(ids) => {
          setTryOnIds(ids);
          setTab('tryon');
        }}
        onGoWardrobe={() => setTab('wardrobe')}
        onItemsChanged={() => void loadItems().catch(() => {})}
      />
    );
  }

  const showTabs = !booting && !bootError && !onboarding && !!profile && tab !== 'tryon';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        <View style={{ flex: 1 }}>{body}</View>
        {showTabs ? (
          <View style={{ flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, paddingBottom: 6 + BOTTOM_INSET }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <Pressable key={t.id} onPress={() => { if (t.id === 'tryon') setTryOnIds([]); setTab(t.id); }} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.label}
                  style={{ flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' }}>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, backgroundColor: active ? C.pink : 'transparent' }}>
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
