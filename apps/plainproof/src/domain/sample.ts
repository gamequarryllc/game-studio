import { addItem, addRooms, emptyDraft, setOnboarded, updateProfile } from './actions';
import { emptyDoc } from './doc';
import type { Category, Doc, RoomIcon } from './types';

// A made-up household for trying the app out (Settings, Developer). The
// brands are invented. The same seed always gives the same home.

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Seed = [name: string, category: Category, value: number, brand?: string, model?: string, qty?: number, shop?: string];

const HOME: { room: string; icon: RoomIcon; items: Seed[] }[] = [
  {
    room: 'Living room',
    icon: 'sofa',
    items: [
      ['65-inch OLED television', 'electronics', 1899, 'Norvik', 'OL65-A2', 1, 'Brightway Electronics'],
      ['Soundbar and subwoofer', 'electronics', 649, 'Halden Audio', 'Arc 500', 1, 'Brightway Electronics'],
      ['Three-seat sofa, oatmeal linen', 'furniture', 1450, 'Fieldhouse', 'Marlow', 1, 'Fieldhouse'],
      ['Wool rug, 8 × 10 ft', 'furniture', 780, 'Tessa Mills'],
      ['Oak coffee table', 'furniture', 420, 'Fieldhouse', 'Arden'],
      ['Brass floor lamp', 'furniture', 189, 'Lumen & Co'],
      ['Game console', 'electronics', 349, 'Kestrel', 'K2 OLED', 1, 'Brightway Electronics'],
      ['Bookcase', 'furniture', 129, 'Nordby', 'Tall 80', 2],
      ['Framed lithograph, harbour scene', 'art', 600],
    ],
  },
  {
    room: 'Kitchen',
    icon: 'kitchen',
    items: [
      ['Stand mixer, 5 qt', 'appliances', 449, 'Carrow', 'Artisan 5', 1, 'Larder & Hearth'],
      ['Espresso machine', 'appliances', 699, 'Brevia', 'Barista 870', 1, 'Larder & Hearth'],
      ['High-speed blender', 'appliances', 379, 'Vortex', 'Pro 5200'],
      ['Enamelled Dutch oven, 5.5 qt', 'kitchenware', 420, 'Fonte'],
      ['Stainless cookware, 10 pieces', 'kitchenware', 699, 'Clad Works', 'D3'],
      ['Stoneware dinner plates', 'kitchenware', 18, 'Harrow Pottery', '', 12],
      ['Chef’s knife, 8 inch', 'kitchenware', 165, 'Tosa'],
      ['Microwave oven', 'appliances', 219, 'Norvik', 'MW-1100'],
    ],
  },
  {
    room: 'Bedroom',
    icon: 'bed',
    items: [
      ['Queen mattress', 'furniture', 1295, 'Driftwell', 'Hybrid'],
      ['Walnut bed frame', 'furniture', 899, 'Fieldhouse', 'Lowe'],
      ['Six-drawer dresser', 'furniture', 749, 'Fieldhouse', 'Lowe'],
      ['Engagement ring, 0.9 ct solitaire', 'jewelry', 6200, '', '', 1, 'Ashby Jewellers'],
      ['Automatic wristwatch', 'jewelry', 1150, 'Meridian', 'Sea 200'],
      ['Winter coats', 'clothing', 260, '', '', 3],
      ['Bedside lamps', 'furniture', 79, 'Lumen & Co', '', 2],
    ],
  },
  {
    room: 'Home office',
    icon: 'desk',
    items: [
      ['14-inch laptop', 'electronics', 1999, 'Orchard', 'Pro 14', 1, 'Orchard Store'],
      ['27-inch 4K monitor', 'electronics', 579, 'Dellan', 'U2724Q'],
      ['Mesh task chair', 'furniture', 1195, 'Hartwell', 'Aero B'],
      ['Standing desk, 60 inch', 'furniture', 689, 'Uprise', 'V2'],
      ['Laser printer', 'electronics', 249, 'Brotherton', 'HL-2460'],
      ['Noise-cancelling headphones', 'electronics', 349, 'Halden Audio', 'H1000'],
      ['Mirrorless camera with 24–70 mm lens', 'electronics', 2450, 'Alta', 'A7 IV'],
    ],
  },
  {
    room: 'Garage',
    icon: 'garage',
    items: [
      ['Hybrid bicycle, size L', 'sports', 899, 'Trail & Co', 'FX 3'],
      ['Cordless drill and driver kit', 'tools', 229, 'Yellowjack', 'DCK240'],
      ['Rolling tool chest', 'tools', 549, 'Craftline', '52-inch'],
      ['Self-propelled lawn mower', 'tools', 799, 'Hondo', 'HRX 217'],
      ['Extension ladder, 24 ft', 'tools', 259, 'Warner'],
      ['Camping tent, four person', 'sports', 329, 'North Fork'],
    ],
  },
  {
    room: 'Laundry',
    icon: 'laundry',
    items: [
      ['Front-load washer', 'appliances', 949, 'Norvik', 'WM4000', 1, 'Brightway Electronics'],
      ['Electric dryer', 'appliances', 899, 'Norvik', 'DL4000', 1, 'Brightway Electronics'],
      ['Cordless vacuum', 'appliances', 549, 'Cyclone', 'V12'],
    ],
  },
  {
    room: 'Dining room',
    icon: 'dining',
    items: [
      ['Dining table, seats eight', 'furniture', 1650, 'Fieldhouse', 'Trestle'],
      ['Dining chairs', 'furniture', 210, 'Fieldhouse', 'Spindle', 6],
      ['Upright piano', 'music', 4200, 'Yamato', 'U1'],
    ],
  },
  { room: 'Bathroom', icon: 'bath', items: [['Hair dryer', 'appliances', 399, 'Cyclone', 'Supersonic'], ['Bath towels', 'other', 24, '', '', 8]] },
];

function serialFor(next: () => number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 11; i++) s += chars[Math.floor(next() * chars.length)];
  return s;
}

function ymd(next: () => number, now: number): string {
  const d = new Date(now - Math.floor(next() * 6 * 365) * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SERIAL_KINDS: Category[] = ['electronics', 'appliances', 'tools', 'music', 'sports'];

/** About fifty items across eight rooms, with a few gaps left to find. */
export function sampleHome(now: number): Doc {
  const next = rng(20261111);
  let doc = addRooms(emptyDoc(now), HOME.map((h) => ({ name: h.room, icon: h.icon })), now);
  doc = updateProfile(setOnboarded(doc), {
    homeName: '14 Alder Lane',
    ownerName: 'Sample household',
    address: '14 Alder Lane\nSpringfield',
    insurer: 'Example Mutual',
    policyNumber: 'HO-0000000',
  });
  let step = 0;
  HOME.forEach((h, roomIndex) => {
    const roomId = doc.rooms[roomIndex].id;
    for (const [name, category, value, brand = '', model = '', qty = 1, shop = ''] of h.items) {
      step += 1;
      const draft = emptyDraft(roomId);
      draft.name = name;
      draft.category = category;
      draft.quantity = qty;
      draft.brand = brand;
      draft.model = model;
      draft.purchasedFrom = shop;
      // Leave some gaps so the "no value" and "missing serial" lists have something in them.
      const skipValue = step % 11 === 0;
      const skipSerial = step % 4 === 0;
      draft.valueCents = skipValue ? null : value * 100;
      draft.pricePaidCents = skipValue || step % 3 === 0 ? null : Math.round(value * (0.82 + next() * 0.2)) * 100;
      draft.purchaseDate = step % 5 === 0 ? null : ymd(next, now);
      draft.serial = SERIAL_KINDS.includes(category) && !skipSerial ? serialFor(next) : '';
      if (step % 9 === 0) draft.notes = 'Bought as a pair. Original box is in the attic.';
      doc = addItem(doc, draft, now - (200 - step) * 3_600_000).doc;
    }
  });
  return doc;
}

const HEAVY_NOUNS = ['lamp', 'chair', 'speaker', 'drill', 'monitor', 'rug', 'mirror', 'camera lens', 'guitar', 'toolbox', 'kettle', 'tablet', 'heater', 'bookshelf', 'suitcase'];
const HEAVY_WORDS = ['Oak', 'Brass', 'Vintage', 'Cordless', 'Compact', 'Large', 'Folding', 'Steel', 'Walnut', 'Portable', 'Antique', 'Spare'];
const HEAVY_CATS: Category[] = ['furniture', 'furniture', 'electronics', 'tools', 'electronics', 'furniture', 'art', 'electronics', 'music', 'tools', 'appliances', 'electronics', 'appliances', 'furniture', 'other'];

/** The sample home plus `extra` more generated items, for seeing how the app copes with a lot. */
export function heavyHome(now: number, extra = 600): Doc {
  const next = rng(77);
  let doc = sampleHome(now);
  for (let i = 0; i < extra; i++) {
    const noun = Math.floor(next() * HEAVY_NOUNS.length);
    const draft = emptyDraft(doc.rooms[Math.floor(next() * doc.rooms.length)].id);
    draft.name = `${HEAVY_WORDS[Math.floor(next() * HEAVY_WORDS.length)]} ${HEAVY_NOUNS[noun]} no. ${i + 1}`;
    draft.category = HEAVY_CATS[noun];
    draft.quantity = next() < 0.1 ? 2 + Math.floor(next() * 5) : 1;
    draft.valueCents = next() < 0.08 ? null : Math.floor(20 + next() * 1500) * 100 + (next() < 0.3 ? 99 : 0);
    draft.serial = next() < 0.5 ? serialFor(next) : '';
    draft.purchaseDate = next() < 0.7 ? ymd(next, now) : null;
    doc = addItem(doc, draft, now - (extra - i) * 60_000).doc;
  }
  return doc;
}
