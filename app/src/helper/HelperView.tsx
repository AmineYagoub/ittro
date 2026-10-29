// Helper screens 15 and 17: the pairing code in large digits with
// its address, and the waiting circle with the helper's initial.
// Both sit above the spoken line, whose words stay the screen's.
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { styles as root } from '../appStyles';
import { relayConfig } from '../relay';
import { spacedCode } from './lines';

export function HelperView({
  code,
  waiting,
  line,
  chips,
  rtl,
  talkBack,
  cameraOn,
}: {
  code: string | null;
  waiting: string[] | null;
  line: string;
  chips: string[];
  rtl: boolean;
  talkBack: boolean;
  cameraOn: boolean;
}): React.JSX.Element {
  const initial = (waiting?.[0] ?? '?').slice(0, 1).toUpperCase();
  const host = relayConfig().url.replace(/^https?:\/\//, '');
  return (
    <View style={cameraOn ? root.overlay : root.plain}>
      <View style={styles.card} accessible={false} importantForAccessibility="no">
        {code ? (
          <>
            <Text style={styles.code}>{spacedCode(code)}</Text>
            <Text style={styles.host}>{host}/help</Text>
          </>
        ) : (
          <View style={styles.waitRow}>
            <View style={styles.seal}>
              <Text style={styles.initial}>{initial}</Text>
            </View>
          </View>
        )}
      </View>
      <Text
        style={[root.line, rtl && root.lineRtl]}
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion={talkBack ? 'none' : 'polite'}
      >
        {line}
      </Text>
      <View style={root.chips}>
        {chips.map((chip) => (
          <Text key={chip} style={root.chip}>{chip}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    marginBottom: 24,
  },
  code: {
    color: color.paper,
    fontSize: 56,
    fontFamily: 'ReadexPro_700Bold',
    letterSpacing: 4,
  },
  host: {
    color: color.brandPale,
    fontSize: font.chip.size,
    fontFamily: 'ReadexPro_500Medium',
    marginTop: 8,
  },
  waitRow: {
    alignItems: 'center',
  },
  seal: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: color.paper,
    fontSize: 48,
    fontFamily: 'ReadexPro_700Bold',
  },
});
