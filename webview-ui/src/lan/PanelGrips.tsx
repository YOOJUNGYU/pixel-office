// Resize handles shared by the panels under the top-left buttons (📊 usage, ? manual).
import { USAGE_PANEL_CORNER_PX, USAGE_PANEL_EDGE_PX } from '../constants.js';
import type { Box, Grip as GripKind } from './usagePanelSize.js';

const GRIP_STYLE: Record<GripKind, React.CSSProperties> = {
  right: {
    top: 0,
    right: -USAGE_PANEL_EDGE_PX / 2,
    width: USAGE_PANEL_EDGE_PX,
    bottom: USAGE_PANEL_CORNER_PX,
    cursor: 'ew-resize',
  },
  bottom: {
    left: 0,
    bottom: -USAGE_PANEL_EDGE_PX / 2,
    height: USAGE_PANEL_EDGE_PX,
    right: USAGE_PANEL_CORNER_PX,
    cursor: 'ns-resize',
  },
  corner: {
    right: -USAGE_PANEL_EDGE_PX / 2,
    bottom: -USAGE_PANEL_EDGE_PX / 2,
    width: USAGE_PANEL_CORNER_PX,
    height: USAGE_PANEL_CORNER_PX,
    cursor: 'nwse-resize',
  },
};

/** The three resize handles: right edge, bottom edge, bottom-right corner. */
export function PanelGrips({ box }: { box: Box }) {
  return (
    <>
      <Grip which="right" box={box} />
      <Grip which="bottom" box={box} />
      <Grip which="corner" box={box} />
    </>
  );
}

/** A resize handle on the right edge, the bottom edge or the bottom-right corner. */
function Grip({ which, box }: { which: GripKind; box: Box }) {
  return (
    <div
      data-usage-grip={which}
      className="absolute touch-none"
      style={GRIP_STYLE[which]}
      onPointerDown={(e) => box.start(which, e)}
    >
      {which === 'corner' && (
        // Two pixel steps in the corner, so the diagonal grip can be found
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className="absolute right-4 bottom-4 text-text-muted"
          shapeRendering="crispEdges"
        >
          <rect x="6" y="2" width="2" height="2" fill="currentColor" />
          <rect x="2" y="6" width="2" height="2" fill="currentColor" />
          <rect x="6" y="6" width="2" height="2" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}
