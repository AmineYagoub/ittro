// The shelf outlines over the live camera: one dashed brand-light box
// per product SAM found. Hidden from TalkBack; the spoken line carries
// their meaning. Positions map the photo onto the view, cover fit.
import { StyleSheet, View } from 'react-native';
import { mapBox } from './outlines';
import type { ShelfOutline } from '../relay';
import { color } from '../theme';

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
});
