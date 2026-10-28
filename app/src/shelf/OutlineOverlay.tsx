// The shelf outlines over the live camera: one shape-following mask
// per product SAM found, drawn as plain views so no render library is
// needed. An outline without a mask falls back to its dashed box.
// Hidden from TalkBack; the spoken line carries their meaning.
import { StyleSheet, View } from 'react-native';
import { mapBox, mapPoints } from './outlines';
import type { ShelfOutline } from '../relay';
import { color } from '../theme';

const EDGE = 3;

const MAX_EDGES = 48;

function MaskShape({ outline, width, height }: { outline: ShelfOutline; width: number; height: number }): React.JSX.Element {
  const source = (outline.mask?.points ?? []).slice(0, MAX_EDGES * 2);
  const points = mapPoints(source, outline.box.w, outline.box.h, width, height);
  const count = Math.floor(points.length / 2);
  const edges: React.JSX.Element[] = [];
  for (let at = 0; at < count; at += 1) {
    const x1 = points[at * 2] as number;
    const y1 = points[at * 2 + 1] as number;
    const x2 = points[((at + 1) % count) * 2] as number;
    const y2 = points[((at + 1) % count) * 2 + 1] as number;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 1) {
      continue;
    }
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    edges.push(
      <View
        key={`${outline.frame}:${outline.id}:${at}`}
        style={[styles.edge, { left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - EDGE / 2, width: length, transform: [{ rotate: `${angle}deg` }] }]}
      />,
    );
  }
  return <>{edges}</>;
}

function hasMask(outline: ShelfOutline): boolean {
  const points = outline.mask?.points ?? [];
  return points.length >= 6 && points.length % 2 === 0;
}

export function OutlineOverlay({
  outlines,
  width,
  height,
}: {
  outlines: ShelfOutline[];
  width: number;
  height: number;
}): React.JSX.Element {
  return (
    <View style={styles.layer} pointerEvents="none" accessible={false} importantForAccessibility="no">
      {outlines.map((outline) => {
        if (hasMask(outline)) {
          return <MaskShape key={`${outline.frame}:${outline.id}`} outline={outline} width={width} height={height} />;
        }
        const box = mapBox(outline.box, width, height);
        return (
          <View
            key={`${outline.frame}:${outline.id}`}
            style={[styles.outline, { left: box.left, top: box.top, width: box.width, height: box.height }]}
          />
        );
      })}
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
  outline: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: color.brandLight,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  edge: {
    position: 'absolute',
    height: EDGE,
    backgroundColor: color.brandLight,
    borderRadius: EDGE / 2,
  },
});
