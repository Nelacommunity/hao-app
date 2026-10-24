import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatModes } from '@/components/chat-composer';
import { ChatColors } from '@/components/chat-ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { deleteChat, listChats, type ChatSummary } from '@/lib/chats';
import { tx, useT } from '@/lib/i18n';

type Props = {
  visible: boolean;
  /** Ids of the chats open right now, marked in the list. */
  openIds: string[];
  onOpen: (chat: ChatSummary) => void;
  onNewChat: () => void;
  /** A chat was deleted (the screen starts a new one if it was open). */
  onDeleted: (chat: ChatSummary) => void;
  onClose: () => void;
};

const LIBRARY = themed(() => [
  { filter: 'all', icon: 'bookmark', color: Colors.red, label: tx('My Places'), hint: tx('Everywhere you’ve been') },
  { filter: 'food', icon: 'restaurant', color: '#E4572E', label: tx('My Food'), hint: tx('Restaurants you tried') },
  { filter: 'hotels', icon: 'bed', color: '#2576FF', label: tx('My Hotels'), hint: tx('Where you stayed') },
] as const);

const GROUPS = [tx('Today'), tx('Yesterday'), tx('Previous 7 days'), tx('Older')] as const;

function groupOf(iso: string) {
  const day = 86_400_000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const at = Date.parse(iso);
  if (at >= startOfToday) return 0;
  if (at >= startOfToday - day) return 1;
  if (at >= startOfToday - 7 * day) return 2;
  return 3;
}

/** The list of saved chats, newest first, grouped by day like Claude and ChatGPT. */
export function ChatHistory({ visible, openIds, onOpen, onNewChat, onDeleted, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    listChats().then(
      (list) => {
        if (cancelled) return;
        setChats(list);
        setError(null);
      },
      (e: Error) => !cancelled && setError(e.message)
    );
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const remove = async (chat: ChatSummary) => {
    setChats((list) => list?.filter((c) => c.id !== chat.id) ?? null);
    try {
      await deleteChat(chat.id);
      onDeleted(chat);
    } catch (e) {
      setError((e as Error).message);
      listChats().then(setChats, () => {});
    }
  };

  const groups = GROUPS.map((label, i) => ({ label, items: (chats ?? []).filter((c) => groupOf(c.updatedAt) === i) })).filter((g) => g.items.length);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{t('Chats')}</Text>
          <Pressable
            onPress={() => {
              onNewChat();
              onClose();
            }}
            style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}
            accessibilityRole="button">
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={styles.newChatText}>{t('New chat')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {/* Like the library links at the top of ChatGPT's sidebar: what Hao has remembered for you. */}
          <View style={styles.library}>
            <Pressable
              onPress={() => {
                onClose();
                router.navigate('/discover');
              }}
              style={({ pressed }) => [styles.libraryItem, pressed && styles.rowPressed]}
              accessibilityRole="button">
              <View style={styles.libraryIcon}>
                <Ionicons name="play-circle" size={17} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('Discover')}</Text>
                <Text style={styles.rowMeta}>{t('Today’s stories about China')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={ChatColors.faint} />
            </Pressable>
            {LIBRARY.map((item) => (
              <Pressable
                key={item.filter}
                onPress={() => {
                  onClose();
                  router.navigate({ pathname: '/my-places', params: { filter: item.filter } });
                }}
                style={({ pressed }) => [styles.libraryItem, pressed && styles.rowPressed]}
                accessibilityRole="button">
                <View style={styles.libraryIcon}>
                  <Ionicons name={item.icon} size={17} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t(item.label)}</Text>
                  <Text style={styles.rowMeta}>{t(item.hint)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={ChatColors.faint} />
              </Pressable>
            ))}
          </View>
          {chats === null && !error ? <ActivityIndicator color={ChatColors.soft} style={{ marginTop: Spacing.lg }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {chats?.length === 0 ? <Text style={styles.empty}>{t('Your chats will appear here.')}</Text> : null}
          {groups.map((group) => (
            <View key={group.label}>
              <Text style={styles.groupLabel}>{t(group.label)}</Text>
              {group.items.map((chat) => {
                const open = openIds.includes(chat.id);
                return (
                  <Pressable
                    key={chat.id}
                    onPress={() => {
                      onClose();
                      // Saved QR-room conversations open read-only; chats reopen in their mode.
                      if (chat.mode === 'room') router.push({ pathname: '/room/saved', params: { id: chat.id } });
                      else onOpen(chat);
                    }}
                    style={({ pressed }) => [styles.row, open && styles.rowOpen, pressed && styles.rowPressed]}
                    accessibilityRole="button">
                    <Ionicons name={chat.mode === 'room' ? 'people-outline' : `${ChatModes[chat.mode].icon}-outline`} size={16} color={ChatColors.soft} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {chat.title || t('New chat')}
                      </Text>
                      <Text style={styles.rowMeta}>{chat.mode === 'room' ? t('Saved conversation') : t(ChatModes[chat.mode].label)}</Text>
                    </View>
                    <Pressable
                      onPress={() => remove(chat)}
                      hitSlop={10}
                      style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={t('Delete chat')}>
                      <Ionicons name="trash-outline" size={16} color={ChatColors.faint} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: ChatColors.border, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '600', color: ChatColors.text },
  newChat: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: ChatColors.accent },
  newChatText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingBottom: Spacing.md },
  groupLabel: { fontSize: 12, fontWeight: '600', color: ChatColors.faint, paddingHorizontal: 8, marginTop: 14, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12 },
  rowOpen: { backgroundColor: ChatColors.userBubble },
  rowPressed: { backgroundColor: ChatColors.border },
  rowTitle: { fontSize: 15, color: ChatColors.text },
  rowMeta: { fontSize: 12, color: ChatColors.faint, marginTop: 1 },
  delete: { padding: 4 },
  library: { gap: 2, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: ChatColors.border, marginBottom: 4 },
  libraryItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12 },
  libraryIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: ChatColors.userBubble, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, color: ChatColors.soft, textAlign: 'center', marginTop: Spacing.lg },
  error: { fontSize: 14, color: Colors.redDark, textAlign: 'center', marginTop: Spacing.md },
}));
