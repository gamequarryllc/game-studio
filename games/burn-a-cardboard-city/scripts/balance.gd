class_name Balance
extends RefCounted
## Every tunable number in the game.
##
## The city is a grid of 0.5 m cells. Buildings are STRUCTURES that cover several
## cells. Heat builds up on a structure (from the giant's tool, a helper, burning
## neighbours, falling debris); past its ignite threshold it catches. A burning
## structure's fire grows over `fill` seconds, pushes heat to its neighbours
## (weighted by the gap between them and the wind), and eats its own integrity
## over `burn` seconds. At zero integrity it COLLAPSES: it crumples or topples,
## and where it lands it dumps burning cardboard (`spill` heat) on whatever is
## there. Coins come in while it burns and in a lump when it hits the ground.
##
## A structure heated steadily from outside settles at (heat per second) / COOL,
## so a tool's POWER (heat / COOL) lights anything whose threshold is below it.

const WORLD_SEED := 20261110
const CELL := 0.5                  # metres per grid cell
const BLOCK := 8                   # cells per side of a city block
const STREET := 3                  # cells across an ordinary street
const BLOCKS := 9                  # blocks per side
# Cells across each of the 10 streets (west to east, north to south). The ones
# between districts are wide strips of bare warehouse floor (the district gaps,
# with the builder's giant props standing in them); 3 and 6 hold the castle's moat.
const STREET_W := [3, 7, 7, 5, 3, 3, 5, 7, 7, 3]
const GAP_STREETS := [1, 2, 3, 6, 7, 8]
const GRID := 122                  # sum(STREET_W) + BLOCKS x BLOCK cells (61 m)
const TICK := 0.1                  # fire simulation step (10 Hz)
const COOL := 1.2                  # share of a structure's heat lost per second
const DAMP_MULT := 2.0             # next to a puddle: this much harder to light
const SPREAD := 1.0
const WIND_GAIN := 0.8             # downwind neighbours get up to 1 + this x strength
const GAP_WEIGHT := [0.8, 0.34, 0.07, 0.0]    # heat reaching a neighbour 0, 1, 2, 3 empty cells away
const BURN_SHARE := 0.55           # share of a structure's coins paid while it burns (the rest when it falls)
const CHAIN_WINDOW := 3.0          # collapses this close together make a chain
const CHAIN_STEP := 0.2            # each link adds this to the collapse bonus...
const CHAIN_MAX := 3.0             # ...up to this multiplier
const TOPPLE_TIME := 1.05          # seconds from the first wobble to hitting the ground
const CRUMPLE_TIME := 0.55
const DEBRIS_HEAT := 9.0           # heat per second a burning scrap of cardboard gives each structure next to it
const DEBRIS_FUEL := Vector2(2.5, 5.5)
const SPRAY_EVERY := 2.0           # a toy fire truck squirts water this often...
const SPRAY_RANGE := 4.2           # ...at the nearest fire within this many metres
const TRUCK_TANK := 12             # squirts in a truck's tank; then it's out of water (no dead ends)
const SPRAY_DOUSE := 0.5           # each squirt knocks this much off a fire
const WET_TIME := 8.0              # seconds a doused building stays wet (twice as hard to light)

# Districts (rings of blocks around the castle).
const ZONES = [
	{"name": "The suburbs", "short": "Suburbs"},
	{"name": "Downtown", "short": "Downtown"},
	{"name": "Skyscraper row", "short": "Skyscraper row"},
	{"name": "The cardboard castle", "short": "The castle"},
]

# Structure kinds. Indices are stored in the save, so only append.
const HOUSE := 0
const CAR := 1
const TREE := 2
const OFFICE := 3
const SKY := 4
const WALL := 5
const TURRET := 6
const GATE := 7
const KEEP := 8
const TRUCK := 9

# ignite: heat it takes to catch (each building +-20%). heat: what it pushes at its
# neighbours per second when fully alight. fill: seconds for the fire to take all
# of it. burn: seconds of full fire until it collapses. coins: what it's worth.
# spill: heat dumped on whatever it falls on. topple: falls over (else crumples).
# spot: chance per tick of throwing a burning scrap downwind. find: chance a find
# pops out when it hits the ground. citizens: paper people who hop out when it catches.
const KINDS = [
	{"name": "Box house", "ignite": 12.0, "heat": 12.5, "fill": 2.0, "burn": 9.0, "coins": 6.0,
		"spill": 7.0, "topple": false, "spot": 0.0, "find": 0.05, "citizens": 1},
	{"name": "Cardboard car", "ignite": 8.0, "heat": 17.0, "fill": 1.0, "burn": 5.0, "coins": 3.0,
		"spill": 6.0, "topple": false, "spot": 0.0, "find": 0.02, "citizens": 0},
	{"name": "Paper tree", "ignite": 7.0, "heat": 11.0, "fill": 0.8, "burn": 4.0, "coins": 1.0,
		"spill": 4.0, "topple": false, "spot": 0.0, "find": 0.0, "citizens": 0},
	{"name": "Office box", "ignite": 70.0, "heat": 80.0, "fill": 5.0, "burn": 18.0, "coins": 50.0,
		"spill": 30.0, "topple": true, "spot": 0.001, "find": 0.15, "citizens": 2},
	{"name": "Skyscraper", "ignite": 340.0, "heat": 160.0, "fill": 10.0, "burn": 34.0, "coins": 450.0,
		"spill": 80.0, "topple": true, "spot": 0.001, "find": 0.35, "citizens": 3},
	{"name": "Castle wall", "ignite": 950.0, "heat": 1100.0, "fill": 6.0, "burn": 30.0, "coins": 2500.0,
		"spill": 550.0, "topple": false, "spot": 0.001, "find": 1.0, "citizens": 0},
	{"name": "Castle tower", "ignite": 980.0, "heat": 1300.0, "fill": 6.0, "burn": 30.0, "coins": 4000.0,
		"spill": 650.0, "topple": true, "spot": 0.0015, "find": 1.0, "citizens": 0},
	{"name": "Gatehouse", "ignite": 960.0, "heat": 1200.0, "fill": 6.0, "burn": 30.0, "coins": 3500.0,
		"spill": 600.0, "topple": false, "spot": 0.001, "find": 1.0, "citizens": 0},
	{"name": "The keep", "ignite": 2000.0, "heat": 3000.0, "fill": 12.0, "burn": 75.0, "coins": 40000.0,
		"spill": 0.0, "topple": false, "spot": 0.0, "find": 1.0, "citizens": 0},
	{"name": "Toy fire truck", "ignite": 60.0, "heat": 35.0, "fill": 1.5, "burn": 6.0, "coins": 25.0,
		"spill": 20.0, "topple": false, "spot": 0.0, "find": 0.5, "citizens": 0},
]
# Which tool each kind is meant for (a TOOLS index). Damp never pushes a building past what
# that tool can light at its base power, so nothing is left that only upgrades could reach.
const TIER := [0, 0, 0, 1, 2, 3, 3, 3, 3, 1]
# The keep only catches once this share of the rest of the castle is down (breach the walls first).
const KEEP_GATE := 0.75

# Model variants per kind (mesh names in models/*.glb) and their heights in metres.
const MODELS = {
	HOUSE: [["house_cereal", 0.8], ["house_cartons", 0.83], ["house_tissue", 0.58], ["house_insideout", 0.85],
		["house_shoebox", 0.42], ["house_stack", 1.06]],
	CAR: [["car_sedan", 0.32], ["car_van", 0.47], ["car_taxi", 0.37]],
	TREE: [["tree_tissue", 0.6], ["tree_tuft", 0.54], ["tree_cone", 0.6], ["tree_blossom", 0.54]],
	OFFICE: [["ship_kestrel", 2.06], ["ship_stack", 2.03], ["ship_open", 2.2], ["ship_tall", 2.75]],
	SKY: [["sky_stack", 6.4], ["sky_tower", 6.3], ["sky_setback", 5.9], ["sky_tube", 5.65]],
	WALL: [["wall_long", 2.2], ["wall_short", 2.2]],
	TURRET: [["turret", 6.0]],
	GATE: [["gatehouse", 3.3]],
	KEEP: [["keep", 9.0]],
	TRUCK: [["fire_truck", 0.6]],
}
const OFFICE_WIDE := ["ship_wide", 2.3]
const SKY_WIDE := ["sky_wide", 5.6]

# What each kind leaves behind when it has burned down (models/rubble.glb). Crumplers get
# a heap where they stood; topplers a fallen, crumpled tower along the way they fell.
const RUBBLE = {
	HOUSE: ["rub_house_0", "rub_house_1", "rub_house_2", "rub_house_3"],
	CAR: ["rub_small_0"],
	TREE: ["rub_small_1"],
	TRUCK: ["rub_small_0"],
	OFFICE: ["fall_office_0", "fall_office_1", "fall_office_2"],
	SKY: ["fall_sky_0", "fall_sky_2", "fall_sky_0"],
	WALL: ["rub_castle_0"],
	GATE: ["rub_castle_1"],
	TURRET: ["fall_turret"],
	KEEP: ["rub_castle_2"],
}
const FALL_SIZE = {"fall_office": Vector2(2.2, 1.3), "fall_sky": Vector2(5.6, 1.8), "fall_turret": Vector2(5.0, 1.8)}

# --- The giant ------------------------------------------------------------------------
const EYE := 3.3                   # eye height (suburb houses come to the knee, offices to the chest)
const WALK_SPEED := 5.5
const JUMP_VELOCITY := 6.4
const GRAVITY := 15.0
const STEP_OVER := 1.25            # can stride over anything lower than this (jumping adds the jump)
const BODY_RADIUS := 0.32
const LOOK_SENSITIVITY_TOUCH := 0.0045
const LOOK_SENSITIVITY_MOUSE := 0.0026
const PITCH := Vector2(-1.48, 0.35)

# --- Tools (bought in order) -------------------------------------------------------------
# power: lights anything with an ignite threshold below it. radius / range in metres.
# Rockets don't heat steadily: each one bursts where it lands with `power` x 1.1 of heat.
const TOOLS = [
	{"key": "magnifier", "name": "Magnifying glass", "power": 20.0, "radius": 0.35, "range": 8.0, "cost": 0.0,
		"desc": "Catches the light from the skylights and focuses it to a point.", "lights": "box houses, cars and trees"},
	{"key": "candle", "name": "Candle", "power": 120.0, "radius": 0.55, "range": 7.0, "cost": 250.0,
		"desc": "Drips burning wax. Thick enough for downtown's office boxes.", "lights": "office boxes and fire trucks"},
	{"key": "blowtorch", "name": "Blowtorch", "power": 480.0, "radius": 0.8, "range": 8.0, "cost": 9000.0,
		"desc": "A hissing blue jet. Skyscrapers are double-walled; this doesn't care.", "lights": "skyscrapers"},
	{"key": "rockets", "name": "Firework rockets", "power": 2600.0, "radius": 1.4, "range": 26.0, "cost": 24000.0,
		"desc": "Launch them across the city. They burst where they land.", "lights": "the castle"},
]
# District gating: the next tool only goes on sale once this share of the district
# before it is down (the candle once the suburbs are 45% down, and so on).
const TOOL_GATE := [0.0, 0.85, 0.86, 0.86]
# Seconds a tool has to stay on one thing before it gives its full heat (the glass has to
# gather the light; wax has to pool). The crosshair's ring fills meanwhile.
const FOCUS := [3.4, 3.0, 2.0, 0.0]
const ROCKET_EVERY := 0.9          # seconds between rockets while the button is held
# Each burst dumps this x the rockets' power as heat. Bursts every ROCKET_EVERY pile up to
# burst / (1 - e^(-COOL x ROCKET_EVERY)) = 1.51 x burst, so 0.66 makes `power` mean what it
# means for the other tools (a dry wall takes one rocket, a damp one by the moat two or three).
const ROCKET_BURST := 0.66
const ROCKET_SPEED := 17.0

# Upgrades. Effect = 1 + per_level x level (glue: burn time x (1 - per_level x level)). Cost = base x growth^level.
const UPGRADES = [
	{"key": "heat", "name": "Hotter flame", "base": 40.0, "growth": 2.25, "per_level": 0.12, "max": 15,
		"desc": "+12% tool power. Reach tougher buildings early."},
	{"key": "dry", "name": "Dry cardboard", "base": 90.0, "growth": 2.3, "per_level": 0.04, "max": 10,
		"desc": "+4% spread. Fire jumps gaps it couldn't before."},
	{"key": "coins", "name": "Loose change", "base": 60.0, "growth": 2.25, "per_level": 0.12, "max": 15,
		"desc": "+12% coins from everything that burns."},
	{"key": "glue", "name": "Cheap glue", "base": 120.0, "growth": 2.1, "per_level": 0.05, "max": 8,
		"desc": "Buildings fall 5% sooner. Faster collapses, longer chains."},
	{"key": "boots", "name": "Big boots", "base": 40.0, "growth": 2.2, "per_level": 0.08, "max": 6,
		"desc": "+8% walking speed."},
]

# Helpers wander off and light things on their own. power works like a tool's.
const HELPER_GROWTH := 1.75
const HELPERS = [
	{"key": "windup", "name": "Wind-up car", "power": 22.0, "base": 100.0, "speed": 2.6,
		"desc": "A tin car with a sparkler taped on. Drives the streets and lights houses."},
	{"key": "plane", "name": "Paper plane", "power": 130.0, "base": 2500.0, "speed": 4.5,
		"desc": "A lit fuse on its tail. Glides onto office roofs."},
]
const MAX_VISIBLE_HELPERS := 8     # per type; more just burn hotter

# Citizens and finds.
const MAX_CITIZENS := 14
const GOLDEN_SHARE := 0.07         # of finds, a golden ticket
const GOLDEN_PITY := 18            # ...and one for sure after this many finds without one
const FIND_MINUTES := 0.4          # a find pays this many minutes of recent income...
const FIND_MIN := 15.0             # ...at least this
const GOLDEN_MINUTES := 2.0
const GOLDEN_MIN := 150.0
const FINDS = [
	{"key": "duck", "name": "A rubber duck"},
	{"key": "sock", "name": "A lost sock"},
	{"key": "robot", "name": "A toy robot"},
	{"key": "marbles", "name": "A bag of marbles"},
	{"key": "yoyo", "name": "A yo-yo"},
	{"key": "teddy", "name": "A very small teddy"},
]

# --- Boosts, ads ---------------------------------------------------------------------------
const BOOST_DURATION := 300.0      # "Watch an ad: 2x fire for 5 min"
const BOOST_MAX := 900.0           # stacks to 15 min
const BOOST_MULT := 2.0            # coins and tool power
const PERMANENT_MULT := 2.0        # the "Remove ads + permanent 2x" purchase
const HELPER_RUSH_DURATION := 180.0
const HELPER_RUSH_MULT := 3.0
const INSTANT_MINUTES := 3.0       # free coins: this many minutes of recent income...
const INSTANT_MIN := 40.0          # ...at least this much
const INSTANT_COOLDOWN := 240.0
const GOLDEN_LENS_POWER := 1.1     # the premium cosmetic adds 10% power
const INTERSTITIAL_COOLDOWN := 240.0
const INTERSTITIAL_FIRST_AFTER := 300.0
const STARTER_AFTER := 600.0       # the starter pack is offered once, after 10 min of play
const STARTER_COINS := 2500.0

# Timed offer tag: rare, gentle, goes away by itself, backs off when ignored.
const OFFER_FIRST_AFTER := 150.0
const OFFER_GAP := 200.0
const OFFER_GAP_MAX := 480.0
const OFFER_GAP_GROWTH := 1.5
const OFFER_LIFETIME := 40.0
const AD_REWARDS = {
	"instant": {"icon": "coin", "title": "Free coins", "placement": "instant_coins"},
	"boost": {"icon": "flame", "title": "2x fire for 5 minutes", "placement": "boost_2x_fire"},
	"helper_rush": {"icon": "windup", "title": "Helpers 3x for 3 minutes", "placement": "helper_rush"},
}

# Coin packs (consumable purchases): this share of the next tool's cost, at least `min`.
const COIN_PACKS = [
	{"id": "coins_small", "share": 0.35, "min": 400.0},
	{"id": "coins_medium", "share": 1.0, "min": 1500.0},
	{"id": "coins_large", "share": 4.0, "min": 8000.0},
]


static func kind_def(k: int) -> Dictionary:
	return KINDS[k]


static var _axis_ring := PackedByteArray()


static func block_start(b: int) -> int:
	## First cell of block b (0..8) along an axis.
	var c := 0
	for k in b + 1:
		c += int(STREET_W[k])
	return c + b * BLOCK


static func street_start(k: int) -> int:
	## First cell of street k (0..9) along an axis.
	return 0 if k == 0 else block_start(k - 1) + BLOCK


static func lane(k: int) -> int:
	## The middle cell of street k.
	return street_start(k) + int(STREET_W[k]) / 2


static func street_of(c: int) -> int:
	## Which street a cell along an axis is on (-1: inside a block).
	for k in STREET_W.size():
		if c >= street_start(k) and c < street_start(k) + int(STREET_W[k]):
			return k
	return -1


static func _rings() -> PackedByteArray:
	## How far out (0 = the middle block, 4 = the outside ring) each cell along an
	## axis is. A street between two rings is split down its middle.
	if _axis_ring.size() == GRID:
		return _axis_ring
	_axis_ring.resize(GRID)
	for b in BLOCKS:
		for c in range(block_start(b), block_start(b) + BLOCK):
			_axis_ring[c] = absi(b - 4)
	for k in STREET_W.size():
		var s := street_start(k)
		var w := int(STREET_W[k])
		for i in w:
			var side := k - 1 if i < w / 2 else k    # the block on that side of the street
			side = clampi(side, 0, BLOCKS - 1)
			_axis_ring[s + i] = absi(side - 4)
	return _axis_ring


static func zone_for_cell(x: int, y: int) -> int:
	## Districts are square rings around the middle of the grid: the suburbs on the
	## outside, then downtown, skyscraper row, and the castle in the three middle blocks.
	var r := _rings()
	var ring := maxi(r[clampi(x, 0, GRID - 1)], r[clampi(y, 0, GRID - 1)])
	return [3, 3, 2, 1, 0][ring]
