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
const STREET := 3                  # cells across a street
const BLOCKS := 9                  # blocks per side
const GRID := BLOCKS * (BLOCK + STREET) + STREET   # 102 cells, 51 m
const TICK := 0.1                  # fire simulation step (10 Hz)
const COOL := 1.2                  # share of a structure's heat lost per second
const DAMP_MULT := 2.0             # next to a puddle: this much harder to light
const SPREAD := 1.0
const WIND_GAIN := 1.3             # downwind neighbours get up to 1 + this x strength
const GAP_WEIGHT := [1.0, 0.55, 0.16, 0.05]   # heat reaching a neighbour 0, 1, 2, 3 empty cells away
const BURN_SHARE := 0.55           # share of a structure's coins paid while it burns (the rest when it falls)
const CHAIN_WINDOW := 3.0          # collapses this close together make a chain
const CHAIN_STEP := 0.2            # each link adds this to the collapse bonus...
const CHAIN_MAX := 3.0             # ...up to this multiplier
const TOPPLE_TIME := 1.05          # seconds from the first wobble to hitting the ground
const CRUMPLE_TIME := 0.55
const DEBRIS_HEAT := 9.0           # heat per second a burning scrap of cardboard gives each structure next to it
const DEBRIS_FUEL := Vector2(2.5, 5.5)
const SPRAY_EVERY := 2.4           # a toy fire truck squirts water this often...
const SPRAY_RANGE := 3.6           # ...at the nearest fire within this many metres
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
	{"name": "Box house", "ignite": 12.0, "heat": 22.0, "fill": 1.2, "burn": 4.5, "coins": 5.0,
		"spill": 20.0, "topple": false, "spot": 0.0, "find": 0.05, "citizens": 1},
	{"name": "Cardboard car", "ignite": 7.0, "heat": 30.0, "fill": 0.6, "burn": 3.0, "coins": 3.0,
		"spill": 14.0, "topple": false, "spot": 0.0, "find": 0.02, "citizens": 0},
	{"name": "Paper tree", "ignite": 7.0, "heat": 15.0, "fill": 0.5, "burn": 2.5, "coins": 1.0,
		"spill": 10.0, "topple": false, "spot": 0.0, "find": 0.0, "citizens": 0},
	{"name": "Office box", "ignite": 70.0, "heat": 160.0, "fill": 2.5, "burn": 7.0, "coins": 45.0,
		"spill": 110.0, "topple": true, "spot": 0.002, "find": 0.15, "citizens": 2},
	{"name": "Skyscraper", "ignite": 280.0, "heat": 650.0, "fill": 4.0, "burn": 10.0, "coins": 400.0,
		"spill": 420.0, "topple": true, "spot": 0.003, "find": 0.35, "citizens": 3},
	{"name": "Castle wall", "ignite": 900.0, "heat": 2000.0, "fill": 5.0, "burn": 11.0, "coins": 2500.0,
		"spill": 1100.0, "topple": false, "spot": 0.002, "find": 1.0, "citizens": 0},
	{"name": "Castle tower", "ignite": 1000.0, "heat": 2200.0, "fill": 5.0, "burn": 11.0, "coins": 4000.0,
		"spill": 1300.0, "topple": true, "spot": 0.003, "find": 1.0, "citizens": 0},
	{"name": "Gatehouse", "ignite": 950.0, "heat": 2100.0, "fill": 5.0, "burn": 11.0, "coins": 3500.0,
		"spill": 1200.0, "topple": false, "spot": 0.002, "find": 1.0, "citizens": 0},
	{"name": "The keep", "ignite": 2000.0, "heat": 3000.0, "fill": 8.0, "burn": 22.0, "coins": 40000.0,
		"spill": 2500.0, "topple": false, "spot": 0.0, "find": 1.0, "citizens": 0},
	{"name": "Toy fire truck", "ignite": 60.0, "heat": 50.0, "fill": 1.0, "burn": 4.0, "coins": 25.0,
		"spill": 30.0, "topple": false, "spot": 0.0, "find": 0.5, "citizens": 0},
]

# Model variants per kind (mesh names in models/*.glb) and their heights in metres.
const MODELS = {
	HOUSE: [["house_gable", 0.86], ["house_flaps", 0.7], ["house_tall", 1.09], ["house_shoebox", 0.43], ["house_cottage", 0.8]],
	CAR: [["car_sedan", 0.32], ["car_van", 0.47], ["car_taxi", 0.37]],
	TREE: [["tree_cone", 0.68], ["tree_ball", 0.61], ["tree_pom", 0.54]],
	OFFICE: [["office_a", 2.0], ["office_b", 1.88], ["office_stack", 1.94], ["office_tall", 2.6]],
	SKY: [["sky_setback", 4.0], ["sky_white", 4.1], ["sky_tube", 4.7], ["sky_ziggurat", 4.1]],
	WALL: [["wall_long", 2.1], ["wall_short", 2.1]],
	TURRET: [["turret", 4.5]],
	GATE: [["gatehouse", 3.0]],
	KEEP: [["keep", 7.0]],
	TRUCK: [["fire_truck", 0.6]],
}
const OFFICE_WIDE := ["office_wide", 2.0]
const SKY_WIDE := ["sky_wide", 3.4]

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
	{"key": "candle", "name": "Candle", "power": 120.0, "radius": 0.55, "range": 7.0, "cost": 150.0,
		"desc": "Drips burning wax. Thick enough for downtown's office boxes.", "lights": "office boxes and fire trucks"},
	{"key": "blowtorch", "name": "Blowtorch", "power": 480.0, "radius": 0.8, "range": 8.0, "cost": 2000.0,
		"desc": "A hissing blue jet. Skyscrapers are double-walled; this doesn't care.", "lights": "skyscrapers"},
	{"key": "rockets", "name": "Firework rockets", "power": 2600.0, "radius": 1.4, "range": 26.0, "cost": 12000.0,
		"desc": "Launch them across the city. They burst where they land.", "lights": "the castle"},
]
const ROCKET_EVERY := 0.6          # seconds between rockets while the button is held
const ROCKET_SPEED := 17.0

# Upgrades. Effect = 1 + per_level x level (glue: burn time x (1 - per_level x level)). Cost = base x growth^level.
const UPGRADES = [
	{"key": "heat", "name": "Hotter flame", "base": 30.0, "growth": 2.0, "per_level": 0.25, "max": 20,
		"desc": "+25% tool power. Reach tougher buildings early."},
	{"key": "dry", "name": "Dry cardboard", "base": 80.0, "growth": 2.0, "per_level": 0.08, "max": 10,
		"desc": "+8% spread. Fire jumps gaps it couldn't before."},
	{"key": "coins", "name": "Loose change", "base": 50.0, "growth": 1.85, "per_level": 0.15, "max": 20,
		"desc": "+15% coins from everything that burns."},
	{"key": "glue", "name": "Cheap glue", "base": 120.0, "growth": 2.1, "per_level": 0.06, "max": 8,
		"desc": "Buildings fall 6% sooner. Faster collapses, longer chains."},
	{"key": "boots", "name": "Big boots", "base": 40.0, "growth": 2.0, "per_level": 0.12, "max": 8,
		"desc": "+12% walking speed."},
]

# Helpers wander off and light things on their own. power works like a tool's.
const HELPER_GROWTH := 1.3
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


static func zone_for_cell(x: int, y: int) -> int:
	## Districts are square rings around the middle of the grid.
	var c := GRID * 0.5
	var d := maxf(absf(x + 0.5 - c), absf(y + 0.5 - c))
	var period := float(BLOCK + STREET)
	if d < period * 1.5:
		return 3
	if d < period * 2.5:
		return 2
	if d < period * 3.5:
		return 1
	return 0
