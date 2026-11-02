// Scan the QR code on a restaurant table (or a shop's sign) so Hao can read the menu behind it. Full screen camera;
// the first code found closes the sheet and goes to the chat.
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, themed } from '@/constants/theme';
import { useT } from '@/lib/i18n';

type Props = {
  visible: boolean;
  onScanned: (data: string) => void;
  onClose: () => void;
  /** No camera, or the traveller would rather pick a screenshot of the menu. */
  onPickPhoto: () => void;
};

export function QrScanSheet({ visible, onScanned, onClose, onPickPhoto }: Props) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same code many times a second: only the first one counts.
  const done = useRef(false);
  useEffect(() => {
    if (!visible) return;
    done.current = false;
    // Ask once when the sheet opens, so the camera starts without an extra tap.
    if (permission && !permission.granted && permission.canAskAgain) requestPermission().catch(() => {});
  }, [visible, permission, requestPermission]);

  const scanned = (result: BarcodeScanningResult) => {
    if (done.current || !result.data) return;
    done.current = true;
    onScanned(result.data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.root}>
        {visible && permission?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned} />
        ) : null}
        <SafeAreaView style={styles.overlay}>
          <View style={styles.top}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel={t('Close')}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {permission && !permission.granted ? (
            <View style={styles.ask}>
              <Ionicons name="camera-outline" size={40} color="#fff" />
              <Text style={styles.askText}>{t('Hao needs the camera to scan the menu’s QR code.')}</Text>
              {permission.canAskAgain ? (
                <Pressable onPress={requestPermission} style={styles.askButton} accessibilityRole="button">
                  <Text style={styles.askButtonText}>{t('Allow camera')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.frame} pointerEvents="none" />
          )}

          <View style={styles.bottom}>
            <Text style={styles.hint}>{t('Point at the QR code on the table or menu')}</Text>
            <Pressable onPress={onPickPhoto} style={({ pressed }) => [styles.photo, pressed && { opacity: 0.8 }]} accessibilityRole="button">
              <Ionicons name="images-outline" size={17} color="#111" />
              <Text style={styles.photoText}>{t('Send a screenshot instead')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    overlay: { flex: 1, justifyContent: 'space-between' },
    top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
    close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
    frame: { alignSelf: 'center', width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
    ask: { alignItems: 'center', gap: 14, paddingHorizontal: 32 },
    askText: { fontSize: 16, lineHeight: 22, color: '#fff', textAlign: 'center' },
    askButton: { paddingHorizontal: 20, height: 44, borderRadius: Radius.pill, justifyContent: 'center', backgroundColor: '#D7263D' },
    askButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    bottom: { alignItems: 'center', gap: 14, paddingBottom: 24, paddingHorizontal: 20 },
    hint: { fontSize: 15, fontWeight: '600', color: '#fff', textAlign: 'center' },
    photo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 42, borderRadius: Radius.pill, backgroundColor: '#fff' },
    photoText: { fontSize: 14, fontWeight: '600', color: '#111' },
  })
);
