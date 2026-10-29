// Verdict screens 07 to 09 and the detail crop of screen 11: the
// whole screen turns the verdict colour the moment the chime and
// vibration start, with the read crop and its spoken name. Plain
// views only; the crop is hidden from TalkBack and the spoken line
// carries the screen.
import { Image, StyleSheet, Text, View } from 'react-native';
import { color, font, size } from '../theme';

type Shown = 'yes' | 'no' | 'unsure';

const GLYPH: Record<Shown, string> = { yes: '✓', no: '✕', unsure: '↻' };

export function VerdictScreen({
  verdict,
  word,
  label,
  crop,
  line,
  chips,
  rtl,
  talkBack,
}: {
  verdict: Shown;
  word: string;
  label: string;
  crop: string | null;
  line: string;
  chips: string[];
  rtl: boolean;
  talkBack: boolean;
}): React.JSX.Element {
  const background = verdict === 'yes' ? color.yes : verdict === 'no' ? color.no : color.notSure;
  const onVerdict = verdict === 'no' ? color.paper : color.ink;
  const name = verdict === 'unsure' && label ? `${label}?` : label;
  return (
    <View
      style={[styles.screen, { backgroundColor: background }]}
      accessible
      accessibilityLabel={line}
      accessibilityLiveRegion={talkBack ? 'none' : 'polite'}
    >
      <View style={styles.body} accessible={false} importantForAccessibility="no">
        <View style={styles.titleRow}>
          <View style={[styles.seal, { backgroundColor: verdict === 'no' ? '#FFFFFF' : color.ink }]}>
            <Text style={[styles.glyph, { color: verdict === 'no' ? color.no : background }]}>{GLYPH[verdict]}</Text>
          </View>
          <Text style={[styles.word, { color: onVerdict }]}>{word}</Text>
        </View>
        {name ? (
          <View style={styles.nameRow}>
            {crop ? (
              <Image source={{ uri: crop }} style={styles.crop} accessible={false} />
            ) : (
              <View style={styles.cropEmpty} />
            )}
            <Text style={[styles.name, { color: onVerdict }]}>{name}</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        <Text style={[styles.line, rtl && styles.lineRtl, { color: onVerdict }]}>{line}</Text>
        {chips.length > 0 ? (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <Text key={chip} style={[styles.chip, { color: onVerdict, borderColor: onVerdict }]}>
                {chip}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function DetailCrop({ crop }: { crop: string }): React.JSX.Element {
  return <Image source={{ uri: crop }} style={styles.detail} accessible={false} importantForAccessibility="no" />;
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  body: {
    flex: 1,
    paddingHorizontal: size.screenPadding,
    paddingTop: 44,
    paddingBottom: 40,
    gap: 28,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    height: 60,
  },
  seal: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 34,
    fontFamily: 'ReadexPro_700Bold',
    lineHeight: 40,
  },
  word: {
    fontSize: font.verdictWord.size,
    fontFamily: 'ReadexPro_700Bold',
    lineHeight: font.verdictWord.size,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  crop: {
    width: 96,
    height: 124,
    borderRadius: 16,
  },
  cropEmpty: {
    width: 96,
    height: 124,
    borderRadius: 16,
    backgroundColor: 'rgba(11, 14, 19, 0.25)',
  },
  name: {
    fontSize: 24,
    fontFamily: 'ReadexPro_600SemiBold',
    lineHeight: 24 * 1.3,
    flexShrink: 1,
  },
  spacer: {
    flexGrow: 1,
  },
  line: {
    fontSize: font.spokenLine.size,
    fontFamily: 'ReadexPro_600SemiBold',
    lineHeight: font.spokenLine.size * font.spokenLine.lineHeight,
    textAlign: 'left',
  },
  lineRtl: {
    textAlign: 'right',
    lineHeight: font.spokenLineArabic.size * font.spokenLineArabic.lineHeight,
    fontSize: font.spokenLineArabic.size,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    fontSize: font.chip.size,
    fontFamily: 'ReadexPro_500Medium',
    borderWidth: 2,
    borderRadius: size.panelRadius,
    paddingHorizontal: 16,
    height: font.chip.chipHeight,
    textAlignVertical: 'center',
  },
  detail: {
    width: '100%',
    height: 96,
    borderRadius: 14,
  },
});
