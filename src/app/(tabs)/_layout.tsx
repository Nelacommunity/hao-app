import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';

import { Colors } from '@/constants/theme';
import { tx, useT } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'home', title: tx('Home'), icon: 'home-outline', iconActive: 'home' },
  { name: 'discover', title: tx('Discover'), icon: 'play-circle-outline', iconActive: 'play-circle' },
  { name: 'translate', title: tx('Translate'), icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'explore', title: tx('Explore'), icon: 'map-outline', iconActive: 'map' },
  { name: 'food', title: tx('Food'), icon: 'restaurant-outline', iconActive: 'restaurant' },
  { name: 'profile', title: tx('Me'), icon: 'person-circle-outline', iconActive: 'person-circle' },
];

export default function TabsLayout() {
  const t = useT();
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
