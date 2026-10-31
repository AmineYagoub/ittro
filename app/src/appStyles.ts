// Ittro's root styles: the camera stage, the spoken line and its
// chips. The verdict screens carry their own styles beside them.
import { StyleSheet } from 'react-native';
import { color, font, size } from './theme';
import { GUIDE_CAPTION_GAP, GUIDE_CLUSTER_BOTTOM } from './guide/lines';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.ink,
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  plain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: size.screenPadding,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 48,
    paddingHorizontal: size.screenPadding,
  },
  overlayGuide: {
    paddingBottom: GUIDE_CLUSTER_BOTTOM + size.directionCircle + GUIDE_CAPTION_GAP,
  },
  line: {
    color: color.paper,
    fontSize: font.spokenLine.size,
    fontFamily: 'ReadexPro_600SemiBold',
    lineHeight: font.spokenLine.size * font.spokenLine.lineHeight,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  lineRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: font.spokenLineArabic.size * font.spokenLineArabic.lineHeight,
    fontSize: font.spokenLineArabic.size,
  },
  chips: {
    flexDirection: 'row',
    marginTop: 16,
  },
  chip: {
    color: color.paper,
    fontSize: font.chip.size,
    fontFamily: 'ReadexPro_500Medium',
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: size.panelRadius,
    paddingHorizontal: 16,
    height: font.chip.chipHeight,
    textAlignVertical: 'center',
    marginHorizontal: 6,
  },
});
