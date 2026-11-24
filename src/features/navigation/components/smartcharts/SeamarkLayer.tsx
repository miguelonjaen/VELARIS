import { useMemo } from 'react';
import { Pane, TileLayer } from 'react-leaflet';
import type { LeafletEventHandlerFnMap } from 'leaflet';

/** Published OpenSeaMap portrayal, XYZ tiles. Display-only community data, not an ENC. */
export default function SeamarkLayer({ onLoading, onReady, onError }: {
  onLoading: () => void; onReady: () => void; onError: () => void;
}): React.ReactElement {
  const events=useMemo<LeafletEventHandlerFnMap>(()=>({loading:onLoading,load:onReady,tileerror:onError}),[onLoading,onReady,onError]);
  return <Pane name="smartcharts-seamarks" style={{zIndex:370,pointerEvents:'none'}}>
    <TileLayer
      pane="smartcharts-seamarks"
      url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
      attribution={'<a href="https://www.openseamap.org/" target="_blank" rel="noreferrer">© OpenSeaMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>'}
      noWrap
      tms={false}
      maxNativeZoom={16}
      maxZoom={20}
      keepBuffer={1}
      updateWhenIdle
      eventHandlers={events}
    />
  </Pane>;
}
