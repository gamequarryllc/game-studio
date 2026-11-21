import type { Category, Doc, Photo, Place, Scene, Settings, Ymd } from './types';

// The sample map: real places, made-up visits, drawn pictures where photos
// would be. It exists so the app can be seen full before anyone has filled it,
// and for the store screenshots. Loaded from Settings > Developer > Sample map.

interface Seed {
  name: string;
  category: Category;
  lat: number;
  lng: number;
  locality: string;
  country?: string;
  on: Ymd;
  until?: Ymd;
  people: string[];
  story: string;
  scenes: Scene[];
  favorite?: boolean;
  /** In the small sample too. */
  starter?: boolean;
}

const US = 'United States';

const SEEDS: Seed[] = [
  // West Michigan, close to home
  { name: 'Frederik Meijer Gardens', category: 'park', lat: 42.9797, lng: -85.5899, locality: 'Grand Rapids, Michigan', on: '2026-05-16', people: ['Maya', 'Mom'], story: 'Butterflies were still in the conservatory. Walked the sculpture park twice because Mom wanted the horse from every side, then sat in the Japanese garden until they closed.', scenes: ['garden', 'forest', 'garden', 'lake'], favorite: true, starter: true },
  { name: 'Blue Bridge at dusk', category: 'landmark', lat: 42.9647, lng: -85.6752, locality: 'Grand Rapids, Michigan', on: '2026-09-26', people: ['Maya'], story: 'ArtPrize weekend. The bridge was lit and there was a brass band halfway across playing to nobody in particular.', scenes: ['river', 'city', 'city'], starter: true },
  { name: 'Founders taproom', category: 'food', lat: 42.9584, lng: -85.6737, locality: 'Grand Rapids, Michigan', on: '2026-03-14', people: ['Jordan', 'Theo', 'Priya'], story: 'Theo’s birthday. Got the long table by the stage, split three sandwiches four ways and argued about the best stout until the band started.', scenes: ['market', 'city'] },
  { name: 'Downtown Market', category: 'food', lat: 42.9548, lng: -85.6712, locality: 'Grand Rapids, Michigan', on: '2025-12-20', people: ['Maya', 'Nora'], story: 'Last-minute gifts. Tacos first, then spices, then one loaf of bread that did not make it home.', scenes: ['market', 'hall', 'market'] },
  { name: 'Fulton Street Farmers Market', category: 'food', lat: 42.9636, lng: -85.6442, locality: 'Grand Rapids, Michigan', on: '2026-08-08', people: ['Maya'], story: 'Peaches, sweet corn, and a bunch of dahlias bigger than my head. Got there at eight and it was already packed.', scenes: ['market', 'garden'] },
  { name: 'John Ball Zoo', category: 'park', lat: 42.9631, lng: -85.7047, locality: 'Grand Rapids, Michigan', on: '2025-06-21', people: ['Nora', 'Eli', 'Dad'], story: 'Eli rode the funicular four times. The red pandas were awake for once, and Dad fed the budgies with a seed stick held like a sword.', scenes: ['forest', 'garden', 'forest'] },
  { name: 'Grand Rapids Public Museum', category: 'museum', lat: 42.9659, lng: -85.6768, locality: 'Grand Rapids, Michigan', on: '2025-02-01', people: ['Nora', 'Eli'], story: 'Cold Saturday. Rode the 1928 carousel, walked the old streets exhibit, and stayed for the planetarium show.', scenes: ['hall', 'river'] },
  { name: 'Grand Rapids Art Museum', category: 'museum', lat: 42.9652, lng: -85.6713, locality: 'Grand Rapids, Michigan', on: '2025-10-04', people: ['Priya'], story: 'Went for one exhibit and stayed three hours. Coffee after on the steps at Rosa Parks Circle.', scenes: ['hall', 'city'] },
  { name: 'Rosa Parks Circle rink', category: 'event', lat: 42.9658, lng: -85.6713, locality: 'Grand Rapids, Michigan', on: '2025-01-11', people: ['Maya', 'Jordan', 'Priya'], story: 'Skating under the lights. Jordan fell once, gracefully, and blamed the ice.', scenes: ['snow', 'city'] },
  { name: 'Van Andel Arena', category: 'event', lat: 42.9624, lng: -85.6715, locality: 'Grand Rapids, Michigan', on: '2025-11-15', people: ['Dad', 'Theo'], story: 'Griffins won in overtime. Dad kept score on the back of the ticket like always.', scenes: ['hall', 'city'] },
  { name: 'Whitecaps game', category: 'event', lat: 43.0406, lng: -85.6596, locality: 'Comstock Park, Michigan', on: '2026-07-03', people: ['Dad', 'Mom', 'Nora', 'Eli'], story: 'Fireworks night at the ballpark. Eli caught nothing but got a ball from a kind stranger in row four.', scenes: ['city', 'lake'] },
  { name: 'Millennium Park', category: 'water', lat: 42.9378, lng: -85.7436, locality: 'Walker, Michigan', on: '2025-07-19', people: ['Maya', 'Jordan'], story: 'Rented kayaks and did the loop through all the little lakes. Swam at the beach after and ate gas-station ice cream in the car.', scenes: ['lake', 'beach', 'forest'] },
  { name: 'Reeds Lake loop', category: 'trail', lat: 42.9529, lng: -85.6096, locality: 'East Grand Rapids, Michigan', on: '2026-04-25', people: ['Priya'], story: 'Four miles round the lake, first warm day of the year. Everyone in town had the same idea.', scenes: ['lake', 'forest'] },
  { name: 'Blandford Nature Center', category: 'trail', lat: 42.9938, lng: -85.7395, locality: 'Grand Rapids, Michigan', on: '2025-03-08', people: ['Nora', 'Eli'], story: 'Sugarbush weekend. Watched sap boil down, tried the syrup on snow, met an owl named after a pasta.', scenes: ['forest', 'snow'] },
  { name: 'Provin Trails', category: 'trail', lat: 43.0178, lng: -85.5651, locality: 'Grand Rapids, Michigan', on: '2025-10-18', people: ['Maya'], story: 'Peak colour in the pines. Sandy trail, one very confident chipmunk.', scenes: ['forest', 'forest'] },
  { name: 'Robinette’s Apple Haus', category: 'food', lat: 43.0281, lng: -85.5917, locality: 'Grand Rapids, Michigan', on: '2025-10-11', people: ['Mom', 'Dad', 'Nora', 'Eli'], story: 'Cider and a dozen donuts, gone before the car left the lot. Eli got lost in the corn maze on purpose.', scenes: ['garden', 'market', 'forest'], favorite: true },
  { name: 'Cannonsburg', category: 'park', lat: 43.0537, lng: -85.5064, locality: 'Belmont, Michigan', on: '2025-01-25', people: ['Jordan', 'Theo'], story: 'Night skiing. Six runs, two hot chocolates, one lost glove.', scenes: ['snow', 'mountain'] },
  { name: 'Fish Ladder Park', category: 'landmark', lat: 42.9760, lng: -85.6771, locality: 'Grand Rapids, Michigan', on: '2025-09-27', people: ['Dad'], story: 'Salmon were running. Stood at the rail with Dad for most of an hour calling out every jump.', scenes: ['river', 'city'] },
  { name: 'Meyer May House', category: 'museum', lat: 42.9571, lng: -85.6577, locality: 'Grand Rapids, Michigan', on: '2024-06-09', people: ['Mom'], story: 'The Frank Lloyd Wright tour Mom had been asking about for a year. The windows alone were worth it.', scenes: ['hall', 'garden'] },
  { name: 'Pickerel Lake boardwalk', category: 'trail', lat: 43.0546, lng: -85.4489, locality: 'Cannon Township, Michigan', on: '2024-09-21', people: ['Maya'], story: 'The long boardwalk across the water at golden hour. Two herons and a turtle sunning on a log.', scenes: ['lake', 'forest', 'lake'] },

  // The lakeshore
  { name: 'Holland State Park', category: 'beach', lat: 42.7737, lng: -86.2104, locality: 'Holland, Michigan', on: '2026-07-18', people: ['Maya', 'Jordan', 'Priya', 'Theo'], story: 'Got there early enough for a spot near the channel. Swam out to the sandbar, watched the boats come in past Big Red, and stayed for the whole sunset.', scenes: ['lighthouse', 'beach', 'beach', 'dunes'], favorite: true, starter: true },
  { name: 'Grand Haven pier', category: 'beach', lat: 43.0572, lng: -86.2553, locality: 'Grand Haven, Michigan', on: '2025-08-02', people: ['Mom', 'Dad'], story: 'Walked the catwalk out to the red lighthouse and back with ice cream. Stayed for the musical fountain because Dad insists it is tradition.', scenes: ['lighthouse', 'beach', 'lake'], starter: true },
  { name: 'Oval Beach', category: 'beach', lat: 42.6612, lng: -86.2156, locality: 'Saugatuck, Michigan', on: '2025-07-05', until: '2025-07-06', people: ['Maya'], story: 'Took the chain ferry across and climbed the Mount Baldhead stairs first, all 302. The beach felt earned after that.', scenes: ['dunes', 'beach', 'forest'], favorite: true },
  { name: 'Tunnel Park', category: 'beach', lat: 42.8163, lng: -86.2063, locality: 'Holland, Michigan', on: '2024-08-17', people: ['Nora', 'Eli'], story: 'Eli ran through the tunnel in the dune yelling the whole way to hear the echo. Sandwiches on the beach, sand in the sandwiches.', scenes: ['dunes', 'beach'] },
  { name: 'Windmill Island Gardens', category: 'park', lat: 42.7995, lng: -86.0961, locality: 'Holland, Michigan', on: '2026-05-09', people: ['Mom', 'Nora'], story: 'Tulip Time. Rows and rows of them, and the old windmill actually grinding flour. Bought a bag.', scenes: ['garden', 'garden', 'river'] },
  { name: 'Rosy Mound', category: 'trail', lat: 43.0218, lng: -86.2290, locality: 'Grand Haven, Michigan', on: '2025-09-13', people: ['Priya'], story: 'A thousand stairs over the dune and then a beach with almost nobody on it. Worth every step down, less so every step back.', scenes: ['dunes', 'forest', 'beach'] },
  { name: 'Hoffmaster State Park', category: 'trail', lat: 43.1330, lng: -86.2654, locality: 'Norton Shores, Michigan', on: '2024-10-12', until: '2024-10-13', people: ['Jordan', 'Theo'], story: 'Camped one night. Climbed the dune overlook at sunrise with coffee in a thermos and nobody else up there.', scenes: ['dunes', 'forest', 'lake'] },
  { name: 'Pere Marquette Beach', category: 'beach', lat: 43.2235, lng: -86.3338, locality: 'Muskegon, Michigan', on: '2024-07-27', people: ['Maya', 'Jordan'], story: 'Volleyball until our arms gave out, then fish tacos on the deck with our feet still sandy.', scenes: ['beach', 'lighthouse'] },
  { name: 'Silver Lake dunes', category: 'park', lat: 43.6756, lng: -86.5163, locality: 'Mears, Michigan', on: '2024-08-03', people: ['Theo', 'Jordan', 'Priya'], story: 'Dune buggy ride that Priya screamed through from start to finish. Walked out to Little Sable Point light after.', scenes: ['dunes', 'lighthouse', 'lake'] },
  { name: 'Big Sable Point', category: 'landmark', lat: 44.0578, lng: -86.5144, locality: 'Ludington, Michigan', on: '2025-08-23', until: '2025-08-24', people: ['Maya'], story: 'Two miles each way through the sand to the striped lighthouse. Climbed the tower; the lake went on for ever.', scenes: ['lighthouse', 'dunes', 'beach'] },

  // Up north
  { name: 'Sleeping Bear Dunes', category: 'park', lat: 44.8826, lng: -86.0410, locality: 'Empire, Michigan', on: '2025-08-09', until: '2025-08-11', people: ['Maya', 'Mom', 'Dad'], story: 'The dune climb, the scenic drive, and the overlook where the sign says do not go down unless you can get back up. We did not go down. Cherry pie in Glen Arbor.', scenes: ['dunes', 'lake', 'forest', 'beach'], favorite: true, starter: true },
  { name: 'Front Street', category: 'city', lat: 44.7640, lng: -85.6222, locality: 'Traverse City, Michigan', on: '2025-07-12', people: ['Maya', 'Priya'], story: 'Cherry Festival week. Everything had cherries in it, including the mustard, which was better than it sounds.', scenes: ['city', 'market', 'lake'] },
  { name: 'Mackinac Island', category: 'stay', lat: 45.8492, lng: -84.6189, locality: 'Mackinac Island, Michigan', on: '2024-06-21', until: '2024-06-23', people: ['Mom', 'Dad', 'Nora', 'Eli'], story: 'Ferry over, bikes all the way round the island, fudge from three different shops for a fair comparison. No cars, just horses and bells.', scenes: ['lake', 'city', 'forest', 'lighthouse'], favorite: true, starter: true },
  { name: 'Pictured Rocks', category: 'water', lat: 46.5631, lng: -86.3166, locality: 'Munising, Michigan', on: '2024-08-30', until: '2024-09-01', people: ['Jordan', 'Theo'], story: 'Kayaked under the cliffs on the calmest morning Superior has ever had. Miners Castle, Chapel Rock, and a pasty the size of a football.', scenes: ['mountain', 'lake', 'forest'], favorite: true },
  { name: 'Tahquamenon Falls', category: 'park', lat: 46.5752, lng: -85.2562, locality: 'Paradise, Michigan', on: '2023-10-07', people: ['Mom', 'Dad'], story: 'The upper falls the colour of root beer, with every tree around them turned. Dad took ninety photos; three are good.', scenes: ['river', 'forest'] },

  // Farther out
  { name: 'Cloud Gate', category: 'landmark', lat: 41.8827, lng: -87.6233, locality: 'Chicago, Illinois', on: '2025-12-06', until: '2025-12-07', people: ['Maya'], story: 'Took the train in for the weekend. The Bean in a light snow, then the Christkindlmarket and far too much glühwein.', scenes: ['city', 'snow', 'market'], starter: true },
  { name: 'Broadway, downtown', category: 'city', lat: 36.1612, lng: -86.7775, locality: 'Nashville, Tennessee', on: '2024-04-12', until: '2024-04-14', people: ['Jordan', 'Theo', 'Priya'], story: 'Three bands in three bars before dinner. Hot chicken that Theo called medium and regretted.', scenes: ['city', 'market'] },
  { name: 'Old Faithful', category: 'park', lat: 44.4605, lng: -110.8281, locality: 'Yellowstone, Wyoming', on: '2023-07-15', until: '2023-07-19', people: ['Mom', 'Dad', 'Nora'], story: 'Right on time, give or take ten minutes. A bison walked through the parking lot like it owned the place, which it does.', scenes: ['mountain', 'forest', 'river'], favorite: true },
  { name: 'South Rim', category: 'park', lat: 36.0579, lng: -112.1431, locality: 'Grand Canyon, Arizona', on: '2024-03-23', until: '2024-03-25', people: ['Maya'], story: 'Sunrise at Mather Point with a hundred quiet strangers. Hiked a mile and a half down Bright Angel and felt every step of the way back.', scenes: ['mountain', 'mountain', 'river'] },
  { name: 'Lake Louise', category: 'water', lat: 51.4168, lng: -116.2172, locality: 'Banff, Alberta', country: 'Canada', on: '2025-06-28', until: '2025-07-02', people: ['Maya', 'Jordan'], story: 'That blue is real. Canoed out to the middle, then hiked to the teahouse for soup and the best view of the trip.', scenes: ['mountain', 'lake', 'forest', 'snow'], favorite: true, starter: true },
  { name: 'Waikiki', category: 'beach', lat: 21.2766, lng: -157.8278, locality: 'Honolulu, Hawaii', on: '2024-01-18', until: '2024-01-24', people: ['Mom', 'Dad', 'Nora', 'Eli'], story: 'Mom and Dad’s fortieth. Surf lesson for everyone; Eli stood up first and has not stopped mentioning it.', scenes: ['beach', 'mountain', 'beach'] },
  { name: 'Trevi Fountain', category: 'landmark', lat: 41.9009, lng: 12.4833, locality: 'Rome', country: 'Italy', on: '2023-05-20', until: '2023-05-26', people: ['Maya'], story: 'Went at six in the morning to have it nearly to ourselves. One coin each, over the left shoulder.', scenes: ['hall', 'city', 'market'], favorite: true, starter: true },
  { name: 'Fushimi Inari', category: 'landmark', lat: 34.9671, lng: 135.7727, locality: 'Kyoto', country: 'Japan', on: '2023-11-03', until: '2023-11-10', people: ['Priya', 'Jordan'], story: 'Ten thousand gates up the mountain. Past the halfway point the crowds thin out and it is only cedar, orange and stone foxes.', scenes: ['forest', 'hall', 'mountain'], favorite: true },
  { name: 'Tulum ruins', category: 'landmark', lat: 20.2148, lng: -87.4290, locality: 'Tulum, Quintana Roo', country: 'Mexico', on: '2025-02-15', until: '2025-02-20', people: ['Maya'], story: 'Ruins on a cliff over water that does not look like a real colour. Swam at the beach below with the iguanas watching.', scenes: ['beach', 'hall', 'beach'] },
];

function photosFor(index: number, scenes: Scene[]): Photo[] {
  return scenes.map((scene, i) => ({ id: `sample-${String(index + 1).padStart(3, '0')}-p${i + 1}`, kind: 'art', scene, seed: (index + 1) * 97 + i * 31 }));
}

export const SAMPLE_COUNTS = { full: SEEDS.length, starter: SEEDS.filter((s) => s.starter).length } as const;

/** A whole document of sample places. `full` is every place; `starter` a handful. */
export function sampleDoc(now: number, size: 'starter' | 'full', settings: Partial<Settings> = {}): Doc {
  const places: Place[] = [];
  SEEDS.forEach((seed, index) => {
    if (size === 'starter' && !seed.starter) return;
    places.push({
      id: `sample-${String(index + 1).padStart(3, '0')}`,
      name: seed.name,
      category: seed.category,
      lat: seed.lat,
      lng: seed.lng,
      locality: seed.locality,
      country: seed.country ?? US,
      visitedOn: seed.on,
      until: seed.until ?? null,
      story: seed.story,
      people: seed.people,
      photos: photosFor(index, seed.scenes),
      favorite: seed.favorite === true,
      createdAt: now - (SEEDS.length - index) * 60_000,
      updatedAt: now,
    });
  });
  return { format: 1, places, settings: { onboarded: true, mapStyle: 'standard', ...settings }, updatedAt: now };
}
