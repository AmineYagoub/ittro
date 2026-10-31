// Guiding over the live camera, screens 06, 23 and 29: the target
// in solid green over an ink halo with its name pill, a dashed
// arrow from the fingertip to the target, the direction circle and
// the five-segment proximity meter. Plain views only, hidden from
// TalkBack; the spoken line carries their meaning.
import { StyleSheet, Text, View } from 'react-native';
import { mapBox, mapPoints } from '../shelf/outlines';
import type { ShelfOutline } from '../relay';
import type { GuideHand } from '../conversation/types';
import { color, size } from '../theme';
import { GUIDE_CLUSTER_BOTTOM, PILL_MAX_WIDTH, dirOfCue, pillBox } from './lines';
import { meterSegments } from './steer';
import type { GuideDir } from './types';

const ARROW_DEG: Record<GuideDir, string> = { right: '0deg', down: '90deg', left: '180deg', up: '270deg' };

function HandArrow({ hand, target, width, height }: { hand: GuideHand; target: ShelfOutline; width: number; height: number }): React.JSX.Element | null {
  const mapped = mapPoints([hand.x, hand.y], target.box.w, target.box.h, width, height);
  const box = mapBox(target.box, width, height);
  const fromX = mapped[0] as number;
  const fromY = mapped[1] as number;
  const toX = box.left + box.width / 2;
  const toY = box.top + box.height / 2;
  const length = Math.hypot(toX - fromX, toY - fromY);
  if (length < 8) {
    return null;
  }
  const angle = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
  return (
    <View
      style={[
        styles.arrow,
        { left: (fromX + toX) / 2 - length / 2, top: (fromY + toY) / 2 - 2, width: length, transform: [{ rotate: `${angle}deg` }] },
      ]}
    />
  );
}

export function GuideOverlay({
  target,
  hand,
  proximity,
  cue,
  label,
  width,
  height,
}: {
  target: ShelfOutline;
  hand: GuideHand | null;
  proximity: number;
  cue: string | null;
  label: string;
  width: number;
  height: number;
}): React.JSX.Element {
  const box = mapBox(target.box, width, height);
  const pill = pillBox(box, width, height);
  const filled = meterSegments(proximity);
  const segments = [0, 1, 2, 3, 4];
  return (
    <View style={styles.layer} pointerEvents="none" accessible={false} importantForAccessibility="no">
      <View style={[styles.halo, { left: box.left - 3, top: box.top - 3, width: box.width + 6, height: box.height + 6 }]} />
      <View style={[styles.target, { left: box.left, top: box.top, width: box.width, height: box.height }]} />
      {label.length > 0 ? (
        <View style={[styles.pill, { left: pill.left, top: pill.top, maxWidth: Math.min(PILL_MAX_WIDTH, width - 16) }]}>
          <Text style={styles.pillText} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
        </View>
      ) : null}
      {hand ? <HandArrow hand={hand} target={target} width={width} height={height} /> : null}
      <View style={styles.cluster}>
        <View style={styles.circle}>
          {cue ? (
            <View style={[styles.head, { transform: [{ rotate: ARROW_DEG[dirOfCue(cue)] }] }]} />
          ) : (
            <View style={styles.ring} />
          )}
        </View>
        <View style={styles.meter}>
          {segments.map((segment) => (
            <View key={segment} style={[styles.segment, segment < filled ? styles.on : styles.off]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  halo: {
    position: 'absolute',
    borderWidth: 11,
    borderColor: '#0B0E13B3',
    borderRadius: 12,
  },
  target: {
    position: 'absolute',
    borderWidth: 5,
    borderColor: color.yes,
    backgroundColor: '#2BD98A1F',
    borderRadius: 8,
  },
  pill: {
    position: 'absolute',
    backgroundColor: color.yes,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pillText: {
    color: color.ink,
    fontSize: 16,
    fontFamily: 'ReadexPro_600SemiBold',
  },
  arrow: {
    position: 'absolute',
    height: 0,
    borderBottomWidth: 4,
    borderBottomColor: color.brandLight,
    borderStyle: 'dashed',
  },
  cluster: {
    position: 'absolute',
    left: size.screenPadding,
    right: size.screenPadding,
    bottom: GUIDE_CLUSTER_BOTTOM,
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle: {
    width: size.directionCircle,
    height: size.directionCircle,
    borderRadius: size.directionCircle / 2,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: {
    width: 0,
    height: 0,
    borderTopWidth: 11,
    borderTopColor: 'transparent',
    borderBottomWidth: 11,
    borderBottomColor: 'transparent',
    borderLeftWidth: 18,
    borderLeftColor: '#FFFFFF',
  },
  ring: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  meter: {
    flex: 1,
    flexDirection: 'row',
    marginLeft: 16,
  },
  segment: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 3,
  },
  on: {
    backgroundColor: color.brandLight,
  },
  off: {
    backgroundColor: color.line,
  },
});
