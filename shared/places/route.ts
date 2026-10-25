// The route shape /api/route returns, whichever service drew it. Coordinates are GCJ-02 [lat, lng].

/** What to do at a step, independent of language; the app words it in the traveller's language. */
export type Maneuver =
  | 'depart'
  | 'straight'
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'keep-left'
  | 'keep-right'
  | 'uturn'
  | 'roundabout'
  | 'arrive';

export type RouteStep = {
  maneuver: Maneuver;
  /** The road the step follows, as signposted (Chinese in mainland China); may be empty. */
  road: string;
  distanceM: number;
  /** Index into `coords` where the step starts. */
  start: number;
};

export type RouteResult = { coords: [number, number][]; distanceM: number; durationS: number; steps: RouteStep[]; source: 'amap' | 'mapbox' };
