class_name Balance
extends RefCounted
## Every tunable number for Drain an Ocean lives here.
##
## Units: the bay is a grid of 1 m cells, so water is measured in m³ and a
## pump's flow in m³ per second (shown to the player per minute, in tonnes:
## 1 m³ of sea water is about a tonne). The bay holds about 65,000 m³ below
## the old sea level: 21K in the sandbars ring, 19K kelp, 12K reef, 7K
## wrecks, 4K trench and 0.9K in the lost town.

const START_MONEY := 20.0

# --- Pumps -------------------------------------------------------------------------------
# Shore pumps sit on the pump pads round the bay and always pump the main body
# of water. Each pad holds one pump; tapping it buys the next tier there.
# flow: m³/s with no lift; cost: the price of putting this tier on a pad (the
# first bucket brigade is free); each further pad at the same tier costs
# PAD_COST_GROWTH times more.
const PUMPS = [
	{"key": "bucket", "name": "Bucket brigade", "flow": 40.0, "cost": 18.0,
		"desc": "A chain of buckets, a lot of goodwill."},
	{"key": "hand", "name": "Hand pump", "flow": 150.0, "cost": 320.0,
		"desc": "A cast-iron lever pump. Someone has to work it."},
	{"key": "diesel", "name": "Diesel pump", "flow": 580.0, "cost": 7500.0,
		"desc": "Loud, smoky and honest. Runs all night."},
	{"key": "siphon", "name": "Giant siphon", "flow": 2300.0, "cost": 170000.0,
		"desc": "A pipe as wide as a lane, arched over the sea wall."},
	{"key": "whirlpool", "name": "Whirlpool engine", "flow": 9000.0, "cost": 1.4e6,
		"desc": "Nobody is quite sure how it works. It hums."},
]
const PAD_COST_GROWTH := 1.55
const PAD_COUNT := 6

# Lift: every metre the water has to be lifted to the shore costs flow.
# effective flow = flow / (1 + lift * HEAD_LOSS / pipe_mult)
const HEAD_LOSS := 0.11

# Seepage: the sea pushes back in through the seabed, harder the deeper the
# bay is pumped (like a polder): SEEP_K * depth^SEEP_EXP m³/s into the main
# body. It's the progression gate: each pump tier carries you about a ring
# further (3, 7, 11, 15, 20, 24 m need roughly 100, 830, 2.4K, 5.3K, 10.8K,
# 17K m³/s of effective flow), and near your pumps' limit the water slows to
# a stop.
const SEEP_K := 7.0
const SEEP_EXP := 2.45
# Under the lost town's rooftops the sea pushes in harder still: below
# SEEP_DEEP_FROM metres the seepage grows by SEEP_DEEP_PER per metre, so the
# last few metres take the whirlpool engine.
const SEEP_DEEP_FROM := 20.0
const SEEP_DEEP_PER := 0.08
const DEEP_SCALE := 2.4         # Bay.volume_mult: deep water counts 1 + (depth / DEEP_SCALE)² times
# The lost town's streets and cellars hold more than the bare floor shows:
# below TOWN_FROM metres every metre of water counts TOWN_MULT times more, so
# the last of it drains over a minute or so, not in a blink.
const TOWN_FROM := 20.5
const TOWN_MULT := 45.0

# Barge pumps float on whichever pool you send them to (or the main body) and
# pump that water out. One bought barge works anywhere; more cost more.
const BARGE_FLOW := 10.0
const BARGE_COSTS = [45.0, 1600.0, 38000.0, 650000.0]
const BARGE_FLOW_PER_TIER := 0.6     # barges get +60% per pump tier you've reached

# --- Upgrades (bought in the chandlery) ---------------------------------------------------
const UPGRADES = [
	{"key": "power", "name": "Pump power", "per_level": 0.15, "max": 15, "cost": 150.0, "growth": 3.0,
		"desc": "Every pump moves 15% more water."},
	{"key": "pipe", "name": "Pipe width", "per_level": 0.3, "max": 12, "cost": 900.0, "growth": 3.1,
		"desc": "Wider pipes lose less to the lift as the water drops."},
	{"key": "salvage", "name": "Salvage value", "per_level": 0.15, "max": 20, "cost": 300.0, "growth": 2.8,
		"desc": "Finds, chests and wreck loads pay 15% more."},
	{"key": "rescue", "name": "Rescue nets", "per_level": 0.15, "max": 15, "cost": 500.0, "growth": 2.9,
		"desc": "Rescues pay more and the pelicans fly faster."},
]

# --- Helpers ---------------------------------------------------------------------------------
# Pelicans rescue stranded creatures on their own; hermit crabs salvage what's
# lying in the open. `trip` is seconds per round trip at level 0.
const HELPERS = [
	{"key": "pelican", "name": "Pelican", "cost": 900.0, "growth": 2.6, "max": 6, "trip": 9.0,
		"desc": "Scoops up a stranded creature and flies it to the aquarium."},
	{"key": "crab", "name": "Salvage crab", "cost": 6000.0, "growth": 2.7, "max": 6, "trip": 12.0,
		"desc": "Drags finds and wreck loads up the beach for you."},
]

# --- Rings -------------------------------------------------------------------------------------
# Depth bands (y of the water level); also in data/bay.json for the view.
const RINGS = [
	{"name": "Sandbars", "top": 0.0, "bottom": -3.0, "bonus": 60.0},
	{"name": "Kelp forest", "top": -3.0, "bottom": -7.0, "bonus": 700.0},
	{"name": "Reef", "top": -7.0, "bottom": -11.0, "bonus": 4000.0},
	{"name": "Shipwrecks", "top": -11.0, "bottom": -15.0, "bonus": 20000.0},
	{"name": "The trench", "top": -15.0, "bottom": -20.0, "bonus": 90000.0},
	{"name": "The lost town", "top": -20.0, "bottom": -24.5, "bonus": 0.0},
]

# --- Creatures ----------------------------------------------------------------------------------
# Rescued into the aquarium (except the whale calf, which goes home over the
# sea wall). bounty: paid once by the harbour fund on rescue; appeal: what it
# adds to the aquarium's ticket takings per second.
const SPECIES = [
	{"key": "hermit_crab", "name": "Hermit crab", "latin": "Pagurus vagans", "ring": 0, "bounty": 6.0, "appeal": 0.8, "model": "crab"},
	{"key": "starfish", "name": "Sugar starfish", "latin": "Asterias dulcis", "ring": 0, "bounty": 8.0, "appeal": 1.0, "model": "starfish"},
	{"key": "flounder", "name": "Flounder", "latin": "Platichthys planus", "ring": 0, "bounty": 11.0, "appeal": 1.2, "model": "flounder"},
	{"key": "seahorse", "name": "Seahorse", "latin": "Hippocampus erectus", "ring": 1, "bounty": 67.5, "appeal": 18.0, "model": "seahorse"},
	{"key": "kelp_bass", "name": "Kelp bass", "latin": "Paralabrax clathratus", "ring": 1, "bounty": 52.5, "appeal": 15.0, "model": "bass"},
	{"key": "urchin", "name": "Purple urchin", "latin": "Strongylocentrotus", "ring": 1, "bounty": 45.0, "appeal": 12.0, "model": "urchin"},
	{"key": "clownfish", "name": "Clownfish", "latin": "Amphiprion ocellaris", "ring": 2, "bounty": 375.0, "appeal": 50.0, "model": "clownfish"},
	{"key": "pufferfish", "name": "Pufferfish", "latin": "Tetraodon globus", "ring": 2, "bounty": 450.0, "appeal": 60.0, "model": "puffer"},
	{"key": "octopus", "name": "Octopus", "latin": "Octopus vulgaris", "ring": 2, "bounty": 525.0, "appeal": 70.0, "model": "octopus"},
	{"key": "turtle", "name": "Sea turtle", "latin": "Chelonia mydas", "ring": 3, "bounty": 2250.0, "appeal": 160.0, "model": "turtle"},
	{"key": "moray", "name": "Moray eel", "latin": "Gymnothorax", "ring": 3, "bounty": 1950.0, "appeal": 140.0, "model": "moray"},
	{"key": "lobster", "name": "Blue lobster", "latin": "Homarus caeruleus", "ring": 3, "bounty": 2100.0, "appeal": 150.0, "model": "lobster"},
	{"key": "anglerfish", "name": "Anglerfish", "latin": "Melanocetus", "ring": 4, "bounty": 13500.0, "appeal": 450.0, "model": "angler"},
	{"key": "lanternfish", "name": "Lanternfish", "latin": "Myctophum", "ring": 4, "bounty": 10500.0, "appeal": 380.0, "model": "lantern"},
	{"key": "coelacanth", "name": "Coelacanth", "latin": "Latimeria", "ring": 4, "bounty": 18000.0, "appeal": 550.0, "model": "coelacanth"},
	{"key": "whale", "name": "Grey whale calf", "latin": "Eschrichtius", "ring": 5, "bounty": 400000.0, "appeal": 0.0, "model": "whale", "release": true},
]
const STRAND_DEPTH := 0.45          # a creature is stranded when the water over it is shallower than this
const CREATURES_PER_POOL := 3
const OPEN_CREATURES_PER_RING := 3
const RESCUE_TIME := 0.55           # seconds the net takes, before Rescue nets

# --- Finds and wrecks ------------------------------------------------------------------------------
# One each, lying on the seabed in their ring: tap when the water's off them.
const FINDS = [
	{"key": "bottle", "name": "Message in a bottle", "ring": 0, "value": 45.0, "model": "find_bottle",
		"note": "\"Whoever finds this: the kettle is still on.\""},
	{"key": "anchor", "name": "Lost anchor", "ring": 0, "value": 140.0, "model": "find_anchor",
		"note": "Stamped with the old harbour's mark."},
	{"key": "figurehead", "name": "Pirate figurehead", "ring": 1, "value": 800.0, "model": "find_figurehead",
		"note": "She has seen things. She is not saying."},
	{"key": "helmet", "name": "Brass diving helmet", "ring": 1, "value": 1100.0, "model": "find_helmet",
		"note": "Twelve bolts, one small dent."},
	{"key": "bell", "name": "Ship's bell", "ring": 2, "value": 5000.0, "model": "find_bell",
		"note": "Still rings true after a hundred years."},
	{"key": "compass", "name": "Binnacle compass", "ring": 2, "value": 7000.0, "model": "find_compass",
		"note": "Points north, mostly."},
	{"key": "lens", "name": "Lighthouse lens", "ring": 3, "value": 14000.0, "model": "find_lens",
		"note": "The one the old light lost in the storm."},
	{"key": "chest", "name": "Captain's chest", "ring": 3, "value": 20000.0, "model": "find_chest",
		"note": "Doubloons, a pipe and a very damp diary."},
	{"key": "wheel", "name": "Ship's wheel", "ring": 3, "value": 11000.0, "model": "find_wheel",
		"note": "Eight spokes, one replaced with a broom handle."},
	{"key": "cannon", "name": "Bronze cannon", "ring": 4, "value": 80000.0, "model": "find_cannon",
		"note": "Never fired, by the look of it."},
	{"key": "statue", "name": "Mermaid statue", "ring": 4, "value": 120000.0, "model": "find_statue",
		"note": "The town square's old fountain."},
	{"key": "weathervane", "name": "Town weathervane", "ring": 5, "value": 2.0e6, "model": "find_weathervane",
		"note": "The cockerel from the clock tower. Still turning."},
]
const FIND_SHOW_DEPTH := 0.12        # finds can be picked up once the water over them is this shallow
const WRECK_LOADS := 6               # salvage loads per wreck
const WRECK_LOAD_VALUE = [0.0, 0.0, 0.0, 4500.0, 0.0, 0.0]   # by ring (wrecks sit in ring 3)
const WRECK_TAP_COOLDOWN := 1.2

# --- Aquarium ------------------------------------------------------------------------------------
const TICKET_MULT := 0.8             # aquarium income per second = total appeal x this
const AQUARIUM_TANK_MAX := 24        # creatures shown swimming in the tank

# --- Monetization ------------------------------------------------------------------------------
const BOOST_MULT := 2.0              # rewarded ad: 2x pumping
const BOOST_SECONDS := 300.0
const BOOST_MAX_SECONDS := 900.0     # stacks to 15 min
const PERMANENT_MULT := 2.0          # Remove Ads + permanent 2x
const HELPER_RUSH_MULT := 3.0
const HELPER_RUSH_SECONDS := 180.0
const TICKET_RUSH_MULT := 2.0        # rewarded ad: double ticket sales
const TICKET_RUSH_SECONDS := 600.0
const CASH_MINUTES := 3.0            # instant cash = this many minutes of income...
const CASH_MAX_OF_NEXT := 0.6        # ...but never more than 60% of the next pump
const CASH_MIN := 60.0
const BRASS_BONUS := 1.1             # premium cosmetic: polished brass pumps, +10% flow
const STARTER_CASH_MINUTES := 12.0
const STARTER_CASH_MIN := 4000.0
const STARTER_OFFER_AFTER := 600.0   # seconds of play
const CASH_PACK_MINUTES = {"small": 10.0, "medium": 45.0, "large": 180.0}
const CASH_PACK_MIN = {"small": 500.0, "medium": 3000.0, "large": 15000.0}

const AD_REWARDS = {
	"boost": {"title": "2x pumping for 5 min", "placement": "boost_2x_pump"},
	"cash": {"title": "Instant cash", "placement": "instant_cash"},
	"helper_rush": {"title": "Helpers work 3x for 3 min", "placement": "helper_rush"},
	"tickets": {"title": "Double ticket sales for 10 min", "placement": "ticket_rush"},
}

# Timed offer tag and interstitials (same rules as the reference game).
const OFFER_FIRST_AFTER := 150.0
const OFFER_LIFETIME := 40.0
const OFFER_GAP := 200.0
const OFFER_GAP_GROWTH := 1.5
const OFFER_GAP_MAX := 480.0
const INTERSTITIAL_FIRST_AFTER := 300.0
const INTERSTITIAL_COOLDOWN := 240.0
const INTERSTITIAL_AFTER_REWARDED := 180.0


static func pump_def(tier: int) -> Dictionary:
	## tier 1..5 (0 = empty pad).
	return PUMPS[clampi(tier - 1, 0, PUMPS.size() - 1)]


static func ring_of_level(level: float) -> int:
	for i in RINGS.size():
		if level > float(RINGS[i].bottom):
			return i
	return RINGS.size() - 1


static func species_index(key: String) -> int:
	for i in SPECIES.size():
		if SPECIES[i].key == key:
			return i
	return -1


static func species_in_ring(ring: int) -> Array:
	var out: Array = []
	for i in SPECIES.size():
		if int(SPECIES[i].ring) == ring:
			out.append(i)
	return out
