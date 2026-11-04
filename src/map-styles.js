// 3D map themes built on free, key-less tile sources:
//  - Esri World Imagery satellite tiles, colour-graded per season with raster paint
//  - AWS Terrain Tiles (Terrarium encoding) for the 3D relief and hillshading

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const TERRAIN_EXAGGERATION = 1.4;

export const THEMES = {
  summer: {
    label: 'Été',
    icon: '☀️',
    raster: { 'raster-saturation': 0.25, 'raster-contrast': 0.08, 'raster-brightness-min': 0.03 },
    hillshade: { shadow: '#1d2a14', highlight: '#fff6d8', accent: '#2c3a1c', exaggeration: 0.25 },
    sky: { sky: '#6fb4ff', horizon: '#d8ecff', fog: '#e9f3ff' },
    route: { done: '#fc4c02', head: '#ffd166', rest: 'rgba(255,255,255,0.55)' },
  },
  winter: {
    label: 'Hiver',
    icon: '❄️',
    raster: {
      'raster-saturation': -0.92,
      'raster-brightness-min': 0.5,
      'raster-brightness-max': 1,
      'raster-contrast': 0.12,
      'raster-hue-rotate': 200,
    },
    hillshade: { shadow: '#51658a', highlight: '#ffffff', accent: '#8ea3c4', exaggeration: 0.55 },
    sky: { sky: '#a9c6e8', horizon: '#eef4fb', fog: '#f4f8fc' },
    route: { done: '#e63946', head: '#ff8fa3', rest: 'rgba(40,60,90,0.55)' },
  },
  autumn: {
    label: 'Automne',
    icon: '🍂',
    raster: { 'raster-hue-rotate': -24, 'raster-saturation': 0.45, 'raster-contrast': 0.12 },
    hillshade: { shadow: '#3b1f0e', highlight: '#ffe2b8', accent: '#5a2d10', exaggeration: 0.3 },
    sky: { sky: '#f2a65a', horizon: '#ffe0b5', fog: '#fbe7cf' },
    route: { done: '#ffffff', head: '#ffe66d', rest: 'rgba(255,255,255,0.4)' },
  },
  night: {
    label: 'Nuit',
    icon: '🌙',
    raster: {
      'raster-brightness-max': 0.38,
      'raster-saturation': -0.6,
      'raster-hue-rotate': 210,
      'raster-contrast': 0.2,
    },
    hillshade: { shadow: '#000000', highlight: '#4b6cb7', accent: '#0b1730', exaggeration: 0.4 },
    sky: { sky: '#050b1f', horizon: '#1b2b55', fog: '#0c1630' },
    route: { done: '#00f5d4', head: '#f9f871', rest: 'rgba(160,190,255,0.35)' },
  },
};

export const DEFAULT_THEME = 'summer';

/**
 * Build a complete MapLibre style document for a theme.
 * Layer ids embed the theme key: with 3D terrain, MapLibre caches layers rendered to
 * texture and ignores plain paint changes, so a theme switch must swap the layers.
 */
export function buildStyle(themeKey) {
  const key = THEMES[themeKey] ? themeKey : DEFAULT_THEME;
  const theme = THEMES[key];
  const h = theme.hillshade;
  return {
    version: 8,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [IMAGERY],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      },
      dem: demSource(),
      hillshadeDem: demSource(),
    },
    layers: [
      { id: `imagery-${key}`, type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': 150, ...theme.raster } },
      {
        id: `hillshade-${key}`,
        type: 'hillshade',
        source: 'hillshadeDem',
        paint: {
          'hillshade-shadow-color': h.shadow,
          'hillshade-highlight-color': h.highlight,
          'hillshade-accent-color': h.accent,
          'hillshade-exaggeration': h.exaggeration,
        },
      },
    ],
    terrain: { source: 'dem', exaggeration: TERRAIN_EXAGGERATION },
    sky: {
      'sky-color': theme.sky.sky,
      'horizon-color': theme.sky.horizon,
      'fog-color': theme.sky.fog,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.75,
    },
  };
}

/**
 * line-gradient expression painting the travelled part of the route with a glowing head.
 * Stops must be strictly increasing, hence the clamping.
 */
export function progressGradient(progress, colors) {
  const p = Math.min(1 - 2e-4, Math.max(1e-4, progress));
  return [
    'interpolate',
    ['linear'],
    ['line-progress'],
    0,
    colors.done,
    Math.max(5e-5, p * 0.97),
    colors.done,
    p,
    colors.head,
    p + 1e-4,
    'rgba(0,0,0,0)',
  ];
}

function demSource() {
  return {
    type: 'raster-dem',
    tiles: [DEM],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'terrarium',
    attribution: 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
  };
}
