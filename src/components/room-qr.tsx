import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';

type Props = { joinUrl: string; roomId: string; caption: string; captionZh: string };

const formatCode = (code: string) => code.replace(/(.{5})(?=.)/g, '$1 ');

export function RoomQr({ joinUrl, roomId, caption, captionZh }: Props) {
  const t = useT();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 112, 280);

  return (
    <View style={styles.card}>
      <Text style={styles.zh}>{captionZh}</Text>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.qr} accessible accessibilityLabel={t('QR code to join room {roomId}', { roomId })}>
        <QRCode value={joinUrl} size={size} color={Colors.ink} backgroundColor="#fff" ecl="M" />
      </View>
      <Text style={styles.codeLabel}>{t('Room code')} · 房间码</Text>
      <Text style={styles.code} selectable>
        {formatCode(roomId)}
      </Text>
      <Text style={styles.url} numberOfLines={1} selectable>
        {joinUrl}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 28,
    padding: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  zh: { fontSize: 22, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  caption: { fontSize: 14, color: Colors.inkSoft, textAlign: 'center', marginTop: 4 },
  qr: { marginVertical: Spacing.lg, padding: Spacing.sm, backgroundColor: '#fff', borderRadius: Radius.md },
  codeLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  code: { fontSize: 26, fontWeight: '900', color: Colors.red, letterSpacing: 3, marginTop: 2 },
  url: { fontSize: 11, color: Colors.muted, marginTop: Spacing.sm, maxWidth: '100%' },
});
