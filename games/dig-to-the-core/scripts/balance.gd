class_name Balance
extends RefCounted
## Every tunable number in Dig to the Core lives here.
##
## Money: every grid point of rock you dig out pays hp x worth x m³ (so a
## zone's rock pays for the effort it takes, and `worth` rising with depth
## makes going deeper pay more per second too). Ore points pay `mult` times
## their rock, scaled by the Ore Value upgrade. Finds pay a lump sum.
## Tool damage is in the same units as hp: a point of hp-1 dirt is gone after
## about 1 damage at the centre of the tool's dig zone.

const WORLD_SEED := 20261109

# --- The planet ----------------------------------------------------------------------
# Ten zones stacked straight down, ZONE_DEPTH metres each (see DigField).
# mats: [main, pockets] indexes into MATERIALS. ores: [ore, how common 0..1].
const ZONE_DEPTH := 24.0
const ZONES = [
	{"name": "Topsoil", "hp": 2.5, "worth": 1.0, "mats": [0, 1], "ores": [[1, 0.09]], "caves": 0,
		"fog": Color(0.16, 0.11, 0.07), "band": Color(0.45, 0.3, 0.17)},
	{"name": "Clay", "hp": 15.0, "worth": 0.7, "mats": [2, 3], "ores": [[2, 0.09], [1, 0.05]], "caves": 1,
		"fog": Color(0.2, 0.1, 0.06), "band": Color(0.72, 0.38, 0.2)},
	{"name": "Bedrock", "hp": 55.0, "worth": 0.92, "mats": [4, 5], "ores": [[3, 0.08], [4, 0.05]], "caves": 2,
		"fog": Color(0.1, 0.1, 0.11), "band": Color(0.47, 0.46, 0.46)},
	{"name": "Fossil Bed", "hp": 220.0, "worth": 1.0, "mats": [6, 7], "ores": [[11, 0.08], [5, 0.05]], "caves": 2,
		"fog": Color(0.2, 0.16, 0.1), "band": Color(0.8, 0.68, 0.46)},
	{"name": "Dinosaur Graveyard", "hp": 900.0, "worth": 1.0, "mats": [8, 9], "ores": [[11, 0.1], [5, 0.06]], "caves": 2,
		"fog": Color(0.17, 0.12, 0.06), "band": Color(0.62, 0.46, 0.25)},
	{"name": "Crystal Caves", "hp": 3600.0, "worth": 1.05, "mats": [10, 11], "ores": [[6, 0.1], [7, 0.07]], "caves": 5,
		"fog": Color(0.09, 0.06, 0.15), "band": Color(0.42, 0.3, 0.62)},
	{"name": "Lava Lakes", "hp": 14000.0, "worth": 1.05, "mats": [12, 13], "ores": [[8, 0.08], [5, 0.05]], "caves": 3,
		"fog": Color(0.2, 0.06, 0.02), "band": Color(0.55, 0.16, 0.06)},
	{"name": "Mantle", "hp": 55000.0, "worth": 1.05, "mats": [14, 15], "ores": [[9, 0.08], [8, 0.05]], "caves": 2,
		"fog": Color(0.24, 0.08, 0.03), "band": Color(0.78, 0.32, 0.1)},
	{"name": "Outer Core", "hp": 210000.0, "worth": 1.05, "mats": [16, 17], "ores": [[10, 0.07], [5, 0.06]], "caves": 1,
		"fog": Color(0.3, 0.16, 0.04), "band": Color(0.93, 0.58, 0.18)},
	{"name": "Inner Core", "hp": 800000.0, "worth": 1.1, "mats": [18, 19], "ores": [[10, 0.1]], "caves": 0,
		"fog": Color(0.34, 0.3, 0.2), "band": Color(1.0, 0.92, 0.66)},
]

# Rock. hp_mult: the pocket rock is a bit harder than the main one.
# glow: it shines by itself (magma, the core).
const MATERIALS = [
	{"name": "Dirt", "color": Color(0.43, 0.29, 0.17), "hp_mult": 1.0},
	{"name": "Loam", "color": Color(0.3, 0.2, 0.12), "hp_mult": 1.2},
	{"name": "Clay", "color": Color(0.7, 0.4, 0.22), "hp_mult": 1.0},
	{"name": "Red Clay", "color": Color(0.6, 0.26, 0.16), "hp_mult": 1.2},
	{"name": "Bedrock", "color": Color(0.44, 0.43, 0.43), "hp_mult": 1.0},
	{"name": "Granite", "color": Color(0.58, 0.53, 0.52), "hp_mult": 1.25},
	{"name": "Sandstone", "color": Color(0.68, 0.55, 0.42), "hp_mult": 1.0},
	{"name": "Shell Rock", "color": Color(0.76, 0.7, 0.6), "hp_mult": 1.2},
	{"name": "Ochre Rock", "color": Color(0.6, 0.43, 0.24), "hp_mult": 1.0},
	{"name": "Bone Bed", "color": Color(0.82, 0.78, 0.68), "hp_mult": 1.2},
	{"name": "Crystal Rock", "color": Color(0.3, 0.25, 0.42), "hp_mult": 1.0},
	{"name": "Geode Shell", "color": Color(0.5, 0.38, 0.62), "hp_mult": 1.25},
	{"name": "Basalt", "color": Color(0.16, 0.14, 0.14), "hp_mult": 1.0},
	{"name": "Magma Rock", "color": Color(0.7, 0.2, 0.05), "hp_mult": 1.2, "glow": 0.55},
	{"name": "Mantle Rock", "color": Color(0.62, 0.27, 0.1), "hp_mult": 1.0, "glow": 0.15},
	{"name": "Peridotite", "color": Color(0.46, 0.52, 0.18), "hp_mult": 1.2},
	{"name": "Liquid Iron", "color": Color(0.88, 0.52, 0.16), "hp_mult": 1.0, "glow": 0.5},
	{"name": "Molten Nickel", "color": Color(0.95, 0.66, 0.3), "hp_mult": 1.2, "glow": 0.6},
	{"name": "Core Iron", "color": Color(1.0, 0.88, 0.6), "hp_mult": 1.0, "glow": 0.75},
	{"name": "Core Crystal", "color": Color(1.0, 0.98, 0.88), "hp_mult": 1.2, "glow": 0.9},
]
const WALL_NAME := "Shaft Wall"   # the edge of the dig site: too hard for any tool

# Ore veins. mult: times the rock it sits in. glow: how hard it glints.
# Index 0 means "no ore".
const ORES = [
	{},
	{"name": "Coal", "color": Color(0.13, 0.13, 0.15), "mult": 4.0, "glow": 0.9, "glint": Color(0.75, 0.8, 0.9)},
	{"name": "Copper", "color": Color(0.25, 0.78, 0.66), "mult": 5.0, "glow": 0.8, "glint": Color(0.45, 1.0, 0.85)},
	{"name": "Iron", "color": Color(0.72, 0.32, 0.2), "mult": 5.0, "glow": 0.7, "glint": Color(0.95, 0.55, 0.4)},
	{"name": "Silver", "color": Color(0.82, 0.86, 0.93), "mult": 6.5, "glow": 0.8, "glint": Color(0.9, 0.95, 1.0)},
	{"name": "Gold", "color": Color(1.0, 0.78, 0.2), "mult": 8.0, "glow": 1.0, "glint": Color(1.0, 0.85, 0.3)},
	{"name": "Amethyst", "color": Color(0.66, 0.32, 0.98), "mult": 8.0, "glow": 1.2, "glint": Color(0.8, 0.5, 1.0)},
	{"name": "Sapphire", "color": Color(0.22, 0.42, 1.0), "mult": 9.0, "glow": 1.2, "glint": Color(0.45, 0.65, 1.0)},
	{"name": "Ruby", "color": Color(1.0, 0.12, 0.2), "mult": 10.0, "glow": 1.2, "glint": Color(1.0, 0.4, 0.45)},
	{"name": "Emerald", "color": Color(0.15, 0.95, 0.45), "mult": 10.0, "glow": 1.2, "glint": Color(0.5, 1.0, 0.65)},
	{"name": "Diamond", "color": Color(0.85, 0.96, 1.0), "mult": 14.0, "glow": 1.4, "glint": Color(1.0, 1.0, 1.0)},
	{"name": "Fossil Bone", "color": Color(0.96, 0.92, 0.8), "mult": 3.0, "glow": 0.25, "glint": Color(1.0, 0.97, 0.88)},
]

# --- Player ---------------------------------------------------------------------------
const WALK_SPEED := 4.2
const JUMP_VELOCITY := 6.4      # about 1.15 m up: enough to climb out of a shallow dip
const LOOK_SENSITIVITY_TOUCH := 0.0034
const LOOK_SENSITIVITY_MOUSE := 0.0025
const HEADLAMP_RANGE := 11.0     # metres (Headlamp Range upgrade adds to it)
const HEADLAMP_ANGLE := 38.0     # degrees, half-angle of the beam

# --- Tools (bought in order at the shack) -------------------------------------------------
# damage: per strike, at the centre of the dig zone (see the header).
# rate: strikes per second while you hold DIG. radius / reach: metres.
# kind: how it digs and what it looks like (Player, ToolRig).
const TOOLS = [
	{"name": "Shovel", "icon": "shovel", "kind": "shovel", "damage": 1.25, "rate": 2.2, "radius": 0.62, "reach": 2.8, "cost": 0.0,
		"desc": "Grandpa's old shovel. Good for dirt, hopeless on rock."},
	{"name": "Pickaxe", "icon": "pickaxe", "kind": "pickaxe", "damage": 4.4, "rate": 2.4, "radius": 0.72, "reach": 3.0, "cost": 120.0,
		"desc": "Bites into clay. Sparks on stone."},
	{"name": "Jackhammer", "icon": "jackhammer", "kind": "jackhammer", "damage": 2.6, "rate": 16.0, "radius": 0.85, "reach": 2.7, "cost": 3000.0,
		"desc": "Shakes bedrock to bits, and your teeth with it."},
	{"name": "Drill", "icon": "drill", "kind": "drill", "damage": 9.0, "rate": 20.0, "radius": 1.0, "reach": 3.3, "cost": 45000.0,
		"desc": "A spinning diamond-tipped bit. Fossils don't stand a chance."},
	{"name": "Dynamite", "icon": "dynamite", "kind": "dynamite", "damage": 900.0, "rate": 0.9, "radius": 1.9, "reach": 9.0, "cost": 700000.0,
		"desc": "Toss it, step back, enjoy. Blasts big craters."},
	{"name": "Laser Drill", "icon": "laser", "kind": "laser", "damage": 160.0, "rate": 20.0, "radius": 1.15, "reach": 10.0, "cost": 1.1e7,
		"desc": "Melts crystal and basalt alike from ten metres away."},
	{"name": "Earth-Borer", "icon": "borer", "kind": "borer", "damage": 900.0, "rate": 20.0, "radius": 1.7, "reach": 3.6, "cost": 2.2e8,
		"desc": "A tunnelling machine you can somehow hold."},
]

# Shack upgrades. Effect = 1 + per_level x level. Cost = base x growth^level.
const UPGRADES = [
	{"key": "power", "name": "Dig Power", "icon": "power", "base": 60.0, "growth": 1.9, "per_level": 0.15, "max": 30,
		"desc": "Every swing hits 15% harder."},
	{"key": "size", "name": "Tool Size", "icon": "size", "base": 400.0, "growth": 3.2, "per_level": 0.04, "max": 10,
		"desc": "Each swing bites a little wider. That adds up."},
	{"key": "ore", "name": "Ore Value", "icon": "ore", "base": 90.0, "growth": 1.85, "per_level": 0.2, "max": 25,
		"desc": "The assay office pays 20% more for ore and finds."},
	{"key": "lamp", "name": "Headlamp Range", "icon": "lamp", "base": 60.0, "growth": 2.3, "per_level": 0.18, "max": 8,
		"desc": "A brighter lamp. Ore glints show from further off."},
]

# Helpers dig on their own at the bottom of your shaft (the lift stop), even
# while you're up at the shack. power: damage per second each, like a tool.
const HELPER_GROWTH := 1.17
const HELPERS = [
	{"key": "mole", "name": "Mole", "icon": "mole", "power": 2.2, "base": 260.0,
		"desc": "Tiny hard hat, huge claws. Digs where you left off."},
	{"key": "robomole", "name": "Robo-Mole", "icon": "robomole", "power": 60.0, "base": 30000.0,
		"desc": "A mole with a drill for a nose. Never needs a nap."},
]
const MAX_VISIBLE_HELPERS := 6    # per type; more helpers just dig harder

# Rarity of finds: a bigger reveal and its colour on the card and in the collection.
const RARITIES = [
	{"name": "Common", "color": Color(0.72, 0.7, 0.66)},
	{"name": "Uncommon", "color": Color(0.45, 0.8, 0.38)},
	{"name": "Rare", "color": Color(0.35, 0.62, 1.0)},
	{"name": "Epic", "color": Color(0.74, 0.45, 1.0)},
	{"name": "Legendary", "color": Color(1.0, 0.7, 0.18)},
]

# Things buried in each zone, at a fixed spot (the same every game, see
# DigField.find_spot). They pop out when the rock around them is dug away.
# The last one is the core itself: digging it out is the ending.
const FINDS = [
	{"name": "Lost Car Keys", "icon": "keys", "zone": 0, "rarity": 0, "value": 60.0, "flavor": "So that's where they went."},
	{"name": "Time Capsule (1999)", "icon": "cassette", "zone": 0, "rarity": 1, "value": 160.0, "flavor": "Contains one floppy disk and a lot of optimism."},
	{"name": "Pirate Chest", "icon": "chest", "zone": 1, "rarity": 2, "value": 900.0, "flavor": "Arr. Very far from the sea, arr."},
	{"name": "Lost Subway Car", "icon": "subway", "zone": 1, "rarity": 2, "value": 1500.0, "flavor": "Next stop: nowhere. Mind the gap."},
	{"name": "Viking Sword", "icon": "sword", "zone": 2, "rarity": 2, "value": 6000.0, "flavor": "Took a very wrong turn at Norway."},
	{"name": "Mammoth Tusk", "icon": "tusk", "zone": 2, "rarity": 1, "value": 4000.0, "flavor": "The rest of him is around here somewhere."},
	{"name": "Amber Mosquito", "icon": "mosquito", "zone": 3, "rarity": 3, "value": 30000.0, "flavor": "Do not clone the dinosaurs."},
	{"name": "Giant Ammonite", "icon": "ammonite", "zone": 3, "rarity": 2, "value": 22000.0, "flavor": "A snail the size of a pizza."},
	{"name": "T. rex Skull", "icon": "trex", "zone": 4, "rarity": 4, "value": 140000.0, "flavor": "Big teeth. Tiny arms not included."},
	{"name": "Dinosaur Egg", "icon": "egg", "zone": 4, "rarity": 3, "value": 90000.0, "flavor": "Still warm. That's not great."},
	{"name": "Alien Egg", "icon": "alien_egg", "zone": 5, "rarity": 4, "value": 600000.0, "flavor": "It hums when you're not looking."},
	{"name": "Giant Geode", "icon": "geode", "zone": 5, "rarity": 3, "value": 400000.0, "flavor": "Crack it open later. Or never."},
	{"name": "Dragon Scale", "icon": "scale", "zone": 6, "rarity": 4, "value": 2.6e6, "flavor": "Still hot. Dragons run hot."},
	{"name": "Mole King's Crown", "icon": "crown", "zone": 7, "rarity": 4, "value": 1.1e7, "flavor": "Your moles bow when you wear it."},
	{"name": "Lost Satellite", "icon": "satellite", "zone": 8, "rarity": 4, "value": 4.5e7, "flavor": "How did it get down here?"},
	{"name": "The Core", "icon": "core", "zone": 9, "rarity": 4, "value": 2e8, "flavor": "The middle of the Earth.", "core": true},
]

# --- Lift ---------------------------------------------------------------------------------
const LIFT_RANGE := 2.6           # how close you need to be to the lift (or the lift stop) to ride it
const LIFT_STOP_STEP := 2.5       # the lift stop moves down once you stand this much deeper
const LIFT_MIN_DEPTH := 4.0       # the lift won't take you down before you've dug this far
const LIFT_RIDE_MIN := 1.6        # seconds
const LIFT_RIDE_PER_M := 0.012    # extra seconds per metre ridden (capped below)
const LIFT_RIDE_MAX := 3.4

# --- Ads and purchases ------------------------------------------------------------------
# Nothing digs while the game is closed: it's played in sittings.
const BOOST_DURATION := 300.0          # "watch an ad: 2x digging for 5 min"
const BOOST_STACK_MAX := 900.0         # ...stacks up to 15 min
const BOOST_MULT := 2.0
const PERMANENT_MULT := 2.0            # "Remove Ads + permanent 2x" (IAP)
const GOLDEN_BONUS := 1.1              # premium cosmetic tool: +10% digging
const HELPER_RUSH_DURATION := 180.0    # "helpers dig 3x for 3 min"
const HELPER_RUSH_MULT := 3.0
const CASH_MINUTES := 3.0              # instant cash = this many minutes of recent income...
const CASH_MIN := 80.0                 # ...at least this much, so it's worth an ad early on
const CASH_MAX_FRACTION_OF_NEXT := 0.6 # ...and never more than this share of the next tool's price
const INTERSTITIAL_COOLDOWN := 240.0   # at most one every 4 min
const INTERSTITIAL_FIRST_AFTER := 300.0  # none in the first 5 min of play
const INTERSTITIAL_AFTER_REWARDED := 180.0  # none for 3 min after you chose to watch one
const STARTER_PACK_AFTER := 600.0      # offered once, after 10 min of play
const STARTER_PACK_CASH := 25000.0
const CASH_PACKS = {                   # consumable IAPs: cash in minutes of the next tool's price
	"small": {"fraction": 0.35, "min": 500.0},
	"medium": {"fraction": 1.0, "min": 2500.0},
	"large": {"fraction": 3.0, "min": 10000.0},
}

# Timed offer tag (see AdOffers): rare, short, and backs off when ignored.
const OFFER_FIRST_AFTER := 150.0
const OFFER_GAP := 200.0
const OFFER_GAP_MAX := 480.0
const OFFER_GAP_GROWTH := 1.5
const OFFER_LIFETIME := 40.0
const FIND_DOUBLE_SECONDS := 9.0       # how long "double this find" stays on the find card
const AD_REWARDS = {
	"cash": {"icon": "cash", "title": "Instant cash", "placement": "instant_cash"},
	"boost": {"icon": "boost", "title": "2x digging for 5 minutes", "placement": "boost_2x_dig"},
	"helper_rush": {"icon": "helper_rush", "title": "Crew digs 3x for 3 minutes", "placement": "helper_rush"},
}


static func zone_count() -> int:
	return ZONES.size()


static func material_hp(m: int, zone: int) -> float:
	return float(ZONES[zone].hp) * float(MATERIALS[m].get("hp_mult", 1.0))


static func rarity(f: int) -> Dictionary:
	return RARITIES[int(FINDS[f].get("rarity", 0))]


static func finds_in(zone: int) -> Array:
	var out: Array = []
	for f in FINDS.size():
		if int(FINDS[f].zone) == zone:
			out.append(f)
	return out


static func core_find() -> int:
	for f in FINDS.size():
		if FINDS[f].get("core", false):
			return f
	return FINDS.size() - 1
