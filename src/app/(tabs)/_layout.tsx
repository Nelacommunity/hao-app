import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { tx, useT } from '@/lib/i18n';
import { useAutoCity } from '@/lib/twin';
import { useArrivalCheck } from '@/lib/visits';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'discover', title: tx('Discover'), icon: 'play-circle-outline', iconActive: 'play-circle' },
  // The chat with Hao: places for you, interpreter, guide and memory.
  { name: 'translate', title: tx('Ask Hao'), icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'explore', title: tx('Explore'), icon: 'map-outline', iconActive: 'map' },
  { name: 'my-places', title: tx('My Places'), icon: 'bookmark-outline', iconActive: 'bookmark' },
  { name: 'profile', title: tx('Me'), icon: 'person-circle-outline', iconActive: 'person-circle' },
];

// The getting-to-know-you chat opens by itself once per app session until it's finished or skipped.
let twinOffered = false;

export default function TabsLayout() {
  const t = useT();
  const { profile } = useAuth();
  // "Did you go?" after Navigate: checked when the app opens or returns to the foreground.
  useArrivalCheck(true);
  // The city in China follows the user's GPS, so nobody has to type it.
  useAutoCity();

  const needsTwin = !!profile && !profile.twin_completed_at;
  useEffect(() => {
    if (!needsTwin || twinOffered) return;
    twinOffered = true;
    router.push('/twin');
  }, [needsTwin]);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.red,
        tabBarInactiveTintColor: Colors.muted,
        tabBarStyle: { backgroundColor: Colors.card, borderTopColor: Colors.line },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? tab.iconActive : tab.icon} size={size} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
