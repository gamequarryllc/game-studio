class_name Balance
extends RefCounted
## Every tunable number in the game. The forest is a grid of cells; each cell
## holds one kind of plant. Fire is simulated as heat: a cell catches when its
## heat reaches its ignite threshold, burns for `burn` seconds pushing `heat`
## per second into its 8 neighbours (more downwind), pays `embers` over that
## time, then turns to ash and later to a meadow of flowers.
##
## A cell only heated from outside settles at (heat in per second) / COOL, so a
## tool with heat H can light anything with ignite < H / COOL. Each tool opens
## up the next kind of tree; Hotter Flame lets you reach a little early.

const WORLD_SEED := 20261109
const CELL := 1.5                  # metres per forest cell
const GRID := 80                   # cells per side (120 m x 120 m)
const TICK := 0.1                  # fire simulation step, seconds (10 Hz)
const COOL := 0.5                  # share of a cell's heat lost per second
const DAMP_MULT := 2.2             # cells next to water are this much harder to light
const SPREAD := 1.0                # base multiplier on heat pushed to neighbours
const PATCH := 10.0                # trails split the forest into patches about this many cells across
const DIAGONAL := 0.7              # diagonal neighbours get this share
const ASH_TIME := Vector2(5.0, 11.0)   # seconds of ash before flowers grow

# Kinds of cell. Indices are stored in the grid, so only append.
const GRASS := 0
const BUSH := 1
const PINE := 2
const OAK := 3
const GIANT := 4
const ELDER := 5
const STONE := 6
const WATER := 7
const BARE := 8

# spot: chance per tick that a burning cell throws an ember 2-4 cells downwind
# (how fire jumps trails and rivers). A cell's heat on its neighbours over its
# whole burn is roughly heat x 1.6, so each kind spreads to its own kind but
# can barely light the next kind up: that's the next tool's job.
const PLANTS = [
	{"name": "Cursed Grass", "icon": "🌾", "ignite": 3.0, "heat": 2.6, "burn": 2.6, "embers": 1.0, "height": 0.5, "spot": 0.0},
	{"name": "Gloom Bush", "icon": "🌿", "ignite": 5.0, "heat": 5.0, "burn": 4.0, "embers": 3.0, "height": 1.0, "spot": 0.0004},
	{"name": "Cursed Pine", "icon": "🌲", "ignite": 45.0, "heat": 22.0, "burn": 6.0, "embers": 20.0, "height": 4.6, "spot": 0.0012},
	{"name": "Hex Oak", "icon": "🌳", "ignite": 160.0, "heat": 75.0, "burn": 9.0, "embers": 120.0, "height": 5.0, "spot": 0.0015},
	{"name": "Giant Cursed Tree", "icon": "🌳", "ignite": 560.0, "heat": 200.0, "burn": 14.0, "embers": 800.0, "height": 9.0, "spot": 0.002},
	{"name": "The Elder Tree", "icon": "🌳", "ignite": 3000.0, "heat": 600.0, "burn": 30.0, "embers": 50000.0, "height": 20.0, "spot": 0.0},
]

# The forest grows in rings around the Elder Tree (cells from the centre).
# Each ring is mostly one kind of plant, so each new tool opens the next ring.
const ZONES = [
	{"name": "The Thicket", "outer": 99.0, "mix": {GRASS: 0.6, BUSH: 0.3, PINE: 0.03, BARE: 0.07}},
	{"name": "Pinewood", "outer": 28.5, "mix": {PINE: 0.68, BUSH: 0.14, GRASS: 0.15, OAK: 0.03}},
	{"name": "Oakwood", "outer": 18.5, "mix": {OAK: 0.62, PINE: 0.16, BUSH: 0.12, GRASS: 0.1}},
	{"name": "The Cursed Grove", "outer": 9.5, "mix": {GIANT: 0.6, OAK: 0.2, BUSH: 0.12, GRASS: 0.08}},
]

# --- The fire-keeper ------------------------------------------------------------------
const WALK_SPEED := 5.2            # m/s
const JUMP_VELOCITY := 6.8
const GRAVITY := 18.0
const LOOK_SENSITIVITY_TOUCH := 0.0042   # radians per pixel of finger drag
const LOOK_SENSITIVITY_MOUSE := 0.0028
const CAM_DISTANCE := 10.0
const CAM_PITCH := Vector2(-1.25, -0.12)  # how far the chase camera can tilt down / up

# --- Tools (bought in order in the notebook) ----------------------------------------------
# heat: per second at the aim point. radius / range in metres.
const TOOLS = [
	{"key": "match", "name": "Matchstick", "icon": "🔥", "heat": 8.0, "radius": 0.9, "range": 6.0, "cost": 0.0,
		"desc": "One match. A whole cursed forest. Start small.", "lights": "grass and gloom bushes"},
	{"key": "lighter", "name": "Lighter", "icon": "🔥", "heat": 40.0, "radius": 1.2, "range": 7.0, "cost": 250.0,
		"desc": "Click, whoosh. Hot enough for cursed pines.", "lights": "cursed pines"},
	{"key": "tiki", "name": "Tiki Torch", "icon": "🔥", "heat": 150.0, "radius": 1.6, "range": 9.0, "cost": 4500.0,
		"desc": "Lobs balls of fire. Hex oaks don't stand a chance.", "lights": "hex oaks"},
	{"key": "flamer", "name": "Flamethrower", "icon": "🔥", "heat": 520.0, "radius": 2.2, "range": 11.0, "cost": 30000.0,
		"desc": "A roaring jet. Even the giant cursed trees catch.", "lights": "giant cursed trees"},
	{"key": "dragon", "name": "Dragon Breath", "icon": "🐉", "heat": 1800.0, "radius": 3.0, "range": 14.0, "cost": 200000.0,
		"desc": "Borrowed from a very polite dragon.", "lights": "the Elder Tree's bark"},
	{"key": "meteor", "name": "Meteor Shower", "icon": "☄", "heat": 6000.0, "radius": 4.5, "range": 24.0, "cost": 1500000.0,
		"desc": "Calls down the stars. Overkill, and wonderful.", "lights": "anything at all"},
]

# Upgrades. Effect = 1 + per_level * level. Cost = base * growth^level.
const UPGRADES = [
	{"key": "heat", "name": "Hotter Flame", "icon": "🌡", "base": 50.0, "growth": 2.0, "per_level": 0.25, "max": 20,
		"desc": "+25% tool heat. Reach tougher trees early."},
	{"key": "wind", "name": "Dry Winds", "icon": "🌬", "base": 120.0, "growth": 2.0, "per_level": 0.06, "max": 10,
		"desc": "+6% fire spread, and embers jump further. Bigger chain reactions."},
	{"key": "value", "name": "Ember Value", "icon": "💰", "base": 80.0, "growth": 1.85, "per_level": 0.15, "max": 20,
		"desc": "+15% embers from everything that burns."},
	{"key": "wide", "name": "Wide Flame", "icon": "↔", "base": 150.0, "growth": 2.3, "per_level": 0.12, "max": 8,
		"desc": "+12% flame size where it lands."},
	{"key": "boots", "name": "Swift Boots", "icon": "👢", "base": 60.0, "growth": 2.1, "per_level": 0.12, "max": 8,
		"desc": "+12% walking speed."},
]

# Helpers wander off on their own and light things. heat works like a tool's.
const HELPER_GROWTH := 1.28
const HELPERS = [
	{"key": "sprite", "name": "Fire Sprite", "icon": "✨", "heat": 9.0, "base": 150.0, "speed": 3.6,
		"desc": "A giggling spark. Floats off and lights grass and bushes."},
	{"key": "salamander", "name": "Ember Salamander", "icon": "🦎", "heat": 120.0, "base": 6000.0, "speed": 4.2,
		"desc": "Scurries to the trees and sets pines and oaks alight."},
]
const MAX_VISIBLE_HELPERS := 12    # per type; more helpers just burn hotter

# Critters scamper out of burning trees (always unharmed). A rare golden one pays a bonus.
const CRITTER_CHANCE := 0.07       # per tree that catches
const GOLDEN_CHANCE := 0.04        # of those, a golden critter
const GOLDEN_MINUTES := 1.5        # a golden critter pays this many minutes of recent income

# --- Boosts, ads ---------------------------------------------------------------------------
const BOOST_DURATION := 300.0      # "Watch an ad: 2x fire for 5 min"
const BOOST_MAX := 900.0           # stacks to 15 min
const BOOST_MULT := 2.0            # embers and tool heat
const PERMANENT_MULT := 2.0        # the "Remove Ads + permanent 2x" purchase
const HELPER_RUSH_DURATION := 180.0
const HELPER_RUSH_MULT := 3.0
const INSTANT_MINUTES := 3.0       # "free embers" pays this many minutes of recent income...
const INSTANT_MIN := 60.0          # ...at least this much
const INSTANT_COOLDOWN := 240.0    # from the notebook, once every 4 min
const PHOENIX_HEAT := 1.1          # the premium cosmetic adds 10% heat
const INTERSTITIAL_COOLDOWN := 240.0
const INTERSTITIAL_FIRST_AFTER := 300.0   # seconds of play before the first one
const STARTER_AFTER := 600.0       # the starter pack is offered once, after 10 min of play
const STARTER_EMBERS := 2500.0

# Timed offer tag: rare, gentle, goes away by itself, backs off when ignored.
const OFFER_FIRST_AFTER := 150.0
const OFFER_GAP := 200.0
const OFFER_GAP_MAX := 480.0
const OFFER_GAP_GROWTH := 1.5
const OFFER_LIFETIME := 40.0
const AD_REWARDS = {
	"instant": {"icon": "🔥", "title": "Free embers", "placement": "instant_embers"},
	"boost": {"icon": "⚡", "title": "2x fire for 5 min", "placement": "boost_2x_fire"},
	"helper_rush": {"icon": "✨", "title": "Helpers work 3x for 3 min", "placement": "helper_rush"},
}

# Ember packs (consumable purchases). Each gives this share of the next tool's cost, at least `min`.
const EMBER_PACKS = [
	{"id": "embers_small", "share": 0.35, "min": 500.0},
	{"id": "embers_medium", "share": 1.0, "min": 2000.0},
	{"id": "embers_large", "share": 4.0, "min": 10000.0},
]


static func plant(kind: int) -> Dictionary:
	return PLANTS[kind] if kind < PLANTS.size() else {}


static func flammable(kind: int) -> bool:
	return kind <= ELDER
