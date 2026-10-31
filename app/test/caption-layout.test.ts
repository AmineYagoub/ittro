// The spoken caption never runs over the guide cluster: while the
// direction button and meter show, the caption's bottom edge clears
// the top of the cluster with a gap, at any length, in any language.
import test from 'node:test';
import assert from 'node:assert/strict';
import { styles } from '../src/appStyles';
import { GUIDE_CAPTION_GAP, GUIDE_CLUSTER_BOTTOM } from '../src/guide/lines';
import { size } from '../src/theme';

test('the guide caption clears the cluster top', () => {
  const bottom = (styles.overlayGuide as { paddingBottom: number }).paddingBottom;
  assert.equal(bottom, GUIDE_CLUSTER_BOTTOM + size.directionCircle + GUIDE_CAPTION_GAP);
  assert.ok(bottom > (styles.overlay as { paddingBottom: number }).paddingBottom);
});
