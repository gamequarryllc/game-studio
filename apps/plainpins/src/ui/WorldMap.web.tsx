import { geoDistance, geoGraticule, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-50m.json';

import type { Camera } from '@/domain/geo';

import { GREAT_LAKES } from './greatLakes';
import { Icon } from './Icon';
import type { WorldMapHandle, WorldMapProps } from './mapTypes';
import { FLOAT_SHADOW, HAIRLINE, type, useTheme } from './theme';

// The web preview's map: a globe drawn from an outline of the world's land. It
// spins, zooms and carries the pins, which is enough to try every screen in a
// browser. It has no streets or names; the iPhone app shows Apple Maps instead
// (WorldMap.tsx).

const topo = landTopo as unknown as Parameters<typeof feature>[0] & { objects: { land: Parameters<typeof feature>[1] } };
const LAND = feature(topo, topo.objects.land) as unknown as GeoPermissibleObjects;
const LAKES: GeoPermissibleObjects = { type: 'MultiPolygon', coordinates: GREAT_LAKES.map((ring) => [ring]) };

/** The browser must not scroll or zoom the page when a finger drags the globe. */
const NO_TOUCH_SCROLL = { touchAction: 'none', cursor: 'grab', userSelect: 'none' } as object;

const MIN_ZOOM = 1;
const MAX_ZOOM = 15;
const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat));
const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

/** The globe's radius in points for a zoom: at zoom 1 the whole globe fits with room to spare. */
function radiusFor(zoom: number, w: number, h: number): number {
  return Math.min(w, h) * 0.42 * Math.pow(2, zoom - 1);
}

/** Lines of latitude and longitude, spaced so a handful cross the view at any zoom. */
function gridStep(zoom: number): number {
  const span = 360 / Math.pow(2, zoom);
  for (const step of [30, 15, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005]) if (span / step >= 3) return step;
  return 0.002;
}

function Teardrop({ color, size, ring }: { color: string; size: number; ring: string }) {
  return (
    <Svg width={size} height={size * 1.3} viewBox="0 0 30 39">
      <Path d="M15 38 C15 38 2 23.5 2 14.5 A13 13 0 1 1 28 14.5 C28 23.5 15 38 15 38 Z" fill={color} stroke={ring} strokeWidth={2} />
      <Circle cx={15} cy={14.5} r={4.6} fill={ring} />
    </Svg>
  );
}

export const WorldMap = forwardRef<WorldMapHandle, WorldMapProps>(function WorldMap({ pins, initial, selectedId, onPinPress, onMapPress, onCamera, style }, ref) {
  const { c, dark } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>(initial);
  // The same camera and size, readable from event handlers without waiting for a render.
  const camRef = useRef<Camera>(initial);
  const sizeRef = useRef({ w: 0, h: 0 });
  const anim = useRef<number | null>(null);
  const surface = useRef<ComponentRef<typeof View>>(null);
  const pressRef = useRef(onMapPress);
  useEffect(() => {
    pressRef.current = onMapPress;
  }, [onMapPress]);

  const move = useCallback((next: Camera) => {
    camRef.current = next;
    setCam(next);
  }, []);

  const stop = useCallback(() => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  }, []);

  const flyTo = useCallback(
    (to: Camera) => {
      stop();
      const from = camRef.current;
      const target = { lat: clampLat(to.lat), lng: wrap(to.lng), zoom: clampZoom(to.zoom) };
      // Turn the short way round the globe.
      const dLng = wrap(target.lng - from.lng);
      const t0 = performance.now();
      const length = 650;
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / length);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        move({ lat: from.lat + (target.lat - from.lat) * e, lng: wrap(from.lng + dLng * e), zoom: from.zoom + (target.zoom - from.zoom) * e });
        anim.current = t < 1 ? requestAnimationFrame(tick) : null;
      };
      anim.current = requestAnimationFrame(tick);
    },
    [move, stop],
  );

  useImperativeHandle(ref, () => ({ flyTo, select() {} }), [flyTo]);
  useEffect(() => stop, [stop]);

  // Tell the screen where the map has come to rest.
  useEffect(() => {
    const timer = setTimeout(() => onCamera(cam), 120);
    return () => clearTimeout(timer);
  }, [cam, onCamera]);

  // Dragging turns the globe, the wheel zooms, and a touch that doesn't move is a tap on the map.
  useEffect(() => {
    const el = surface.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    let drag: { id: number; x: number; y: number; lat: number; lng: number; moved: boolean } | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stop();
      move({ ...camRef.current, zoom: clampZoom(camRef.current.zoom - e.deltaY * 0.004) });
    };
    const onDown = (e: PointerEvent) => {
      stop();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lat: camRef.current.lat, lng: camRef.current.lng, moved: false };
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      const { w, h } = sizeRef.current;
      const perPoint = 180 / Math.PI / radiusFor(camRef.current.zoom, w, h);
      const lat = clampLat(drag.lat + dy * perPoint);
      const lng = wrap(drag.lng - (dx * perPoint) / Math.max(0.25, Math.cos((lat * Math.PI) / 180)));
      move({ ...camRef.current, lat, lng });
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tapped = !drag.moved;
      drag = null;
      if (tapped) pressRef.current();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [move, stop]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 0.5 || Math.abs(height - size.h) > 0.5) {
      sizeRef.current = { w: width, h: height };
      setSize({ w: width, h: height });
    }
  };

  const drawn = useMemo(() => {
    const { w, h } = size;
    if (w === 0 || h === 0) return null;
    const r = radiusFor(cam.zoom, w, h);
    const projection = geoOrthographic()
      .rotate([-cam.lng, -cam.lat])
      .translate([w / 2, h / 2])
      .scale(r)
      .clipAngle(90)
      .clipExtent([
        [-2, -2],
        [w + 2, h + 2],
      ]);
    const path = geoPath(projection);
    const step = gridStep(cam.zoom);
    const graticule = geoGraticule().step([step, step]);
    if (cam.zoom > 3.5) {
      const reach = Math.min(80, (360 / Math.pow(2, cam.zoom)) * 1.6);
      const snap = (v: number, up: boolean) => (up ? Math.ceil(v / step) : Math.floor(v / step)) * step;
      graticule.extent([
        [snap(cam.lng - reach * 1.5, false), snap(Math.max(-89, cam.lat - reach), false)],
        [snap(cam.lng + reach * 1.5, true), snap(Math.min(89, cam.lat + reach), true)],
      ]);
    }
    const center: [number, number] = [cam.lng, cam.lat];
    const placed = pins.flatMap((pin) => {
      if (geoDistance(center, [pin.lng, pin.lat]) > Math.PI / 2 - 0.05) return [];
      const xy = projection([pin.lng, pin.lat]);
      if (!xy || xy[0] < -30 || xy[0] > w + 30 || xy[1] < -10 || xy[1] > h + 50) return [];
      return [{ pin, x: xy[0], y: xy[1] }];
    });
    // Pins lower on the screen overlap the ones above, as on a real board.
    placed.sort((a, b) => a.y - b.y);
    return { r, land: path(LAND) ?? '', lakes: path(LAKES) ?? '', grid: path(graticule()) ?? '', placed };
  }, [cam, pins, size]);

  const space = dark ? '#05080F' : '#E6EEF2';

  return (
    <View style={[style, { backgroundColor: space, overflow: 'hidden' }]} onLayout={onLayout} testID="world-map">
      <View ref={surface} style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, NO_TOUCH_SCROLL]}>
        {drawn ? (
          <Svg width={size.w} height={size.h}>
            <Defs>
              <RadialGradient id="sea" cx="38%" cy="32%" r="75%">
                <Stop offset="0" stopColor={c.sea} />
                <Stop offset="1" stopColor={c.seaDeep} />
              </RadialGradient>
              <RadialGradient id="air" cx="50%" cy="50%" r="50%">
                <Stop offset="0.86" stopColor={dark ? '#3D6FB5' : '#9CC3D6'} stopOpacity={0.55} />
                <Stop offset="1" stopColor={dark ? '#3D6FB5' : '#9CC3D6'} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={size.w / 2} cy={size.h / 2} r={drawn.r * 1.12} fill="url(#air)" />
            <Circle cx={size.w / 2} cy={size.h / 2} r={drawn.r} fill="url(#sea)" />
            <Path d={drawn.grid} fill="none" stroke={dark ? '#FFFFFF' : '#1A2133'} strokeOpacity={dark ? 0.09 : 0.1} strokeWidth={1} />
            <Path d={drawn.land} fill={c.land} stroke={c.landEdge} strokeWidth={0.8} strokeLinejoin="round" />
            <Path d={drawn.lakes} fill={c.sea} stroke={c.landEdge} strokeWidth={0.6} strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>

      {drawn?.placed.map(({ pin, x, y }) => {
        const chosen = pin.id === selectedId;
        const s = chosen ? 36 : 26;
        return (
          <Pressable
            key={pin.id}
            testID={`pin-${pin.id}`}
            accessibilityRole="button"
            accessibilityLabel={pin.title}
            onPress={() => onPinPress(pin.id)}
            style={{ position: 'absolute', left: x - s / 2, top: y - s * 1.3 + 1, zIndex: chosen ? 5000 : Math.round(y) }}>
            <Teardrop color={pin.color} size={s} ring="#FFFCF5" />
          </Pressable>
        );
      })}

      <View style={[{ position: 'absolute', right: 14, top: '42%', borderRadius: 12, backgroundColor: c.glass, borderWidth: HAIRLINE, borderColor: c.glassEdge, overflow: 'hidden' }, FLOAT_SHADOW]}>
        <Pressable testID="zoom-in" accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => flyTo({ ...camRef.current, zoom: camRef.current.zoom + 1.5 })} style={{ padding: 10 }}>
          <Icon name="plusZoom" size={20} color={c.ink} />
        </Pressable>
        <View style={{ height: HAIRLINE, backgroundColor: c.rule }} />
        <Pressable testID="zoom-out" accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => flyTo({ ...camRef.current, zoom: camRef.current.zoom - 1.5 })} style={{ padding: 10 }}>
          <Icon name="minusZoom" size={20} color={c.ink} />
        </Pressable>
      </View>

      <Text style={[type.caption, { position: 'absolute', left: 14, top: '50%', color: c.ink3, width: 0, height: 0, opacity: 0 }]} testID="map-camera">
        {`${cam.lat.toFixed(4)},${cam.lng.toFixed(4)},${cam.zoom.toFixed(2)}`}
      </Text>
    </View>
  );
});
