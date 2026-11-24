import { useEffect, useState } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

interface PanelDock {
  control: L.Control;
  container: HTMLDivElement;
  slots: Set<HTMLElement>;
  resize: () => void;
}

const docks = new WeakMap<L.Map, PanelDock>();

/** One bounded, scrollable Leaflet control for panels sharing the chart corner. */
export function useMapPanelHost(className: string, label: string): HTMLElement | null {
  const map = useMap();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let dock = docks.get(map);
    if (!dock) {
      const container = L.DomUtil.create('div', 'leaflet-control map-panel-dock');
      Object.assign(container.style, {
        display: 'flex', flexDirection: 'column', gap: '8px', width: '330px',
        overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
        boxSizing: 'border-box', borderRadius: '8px'
      });
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', 'Paneles de carta y meteorología');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.on(container, 'keydown', L.DomEvent.stopPropagation);
      const control = new L.Control({ position: 'bottomleft' });
      control.onAdd = () => container;
      const resize = () => {
        const size = map.getSize();
        container.style.maxHeight = `${Math.max(0, size.y - 100)}px`;
        container.style.maxWidth = `${Math.max(0, size.x - 20)}px`;
      };
      dock = { control, container, slots: new Set(), resize };
      docks.set(map, dock);
      control.addTo(map);
      map.on('resize', resize);
      resize();
    }
    const slot = L.DomUtil.create('section', className, dock.container);
    slot.setAttribute('aria-label', label);
    slot.style.flexShrink = '0';
    slot.style.minWidth = '0';
    dock.slots.add(slot);
    setHost(slot);

    return () => {
      slot.remove();
      dock.slots.delete(slot);
      if (dock.slots.size === 0) {
        map.off('resize', dock.resize);
        L.DomEvent.off(dock.container);
        dock.control.remove();
        docks.delete(map);
      }
    };
  }, [map, className, label]);

  return host;
}
