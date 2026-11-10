class_name AdMobAds
extends Node
## Real rewarded and interstitial ads through the Poing Studios AdMob plugin
## (addons/admob), including Google's consent flow (UMP: the EEA/UK/Swiss consent
## form, and on iPhone the App Tracking Transparency prompt when the "IDFA
## explainer" message is switched on in AdMob > Privacy & messaging).
## Adapted from the studio's reference game (Melt a Glacier).
##
## Order at startup, as Google requires: update consent info -> show the form if
## the player must answer it -> only then initialise the SDK and load ads.
## If consent can't be determined (offline on first launch), ads stay off and the
## check is retried every minute; the game itself never waits on any of it.
## Failed loads retry with a doubling back-off (4 s up to 2 min).

signal rewarded_done(placement: String, ok: bool, reason: String)   # exactly once per show
signal interstitial_done(placement: String)                          # exactly once per show

const RETRY_MIN := 4.0
const RETRY_MAX := 120.0
const CONSENT_RETRY := 60.0
const REWARD_GRACE := 1.0   # the reward callback can land just after the ad closes

var interstitials_enabled := true   # false once "Remove ads" is owned

var _consent_busy := false
var _started := false                 # SDK initialised
var _rewarded: Dictionary = {}        # unit id -> RewardedAd (loaded, unused)
var _loading: Dictionary = {}         # unit id -> true
var _retry: Dictionary = {}           # unit id -> seconds until the next try after a failure
var _interstitial: InterstitialAd
var _showing := false


static func available() -> bool:
	return Engine.has_singleton("PoingGodotAdMob")


func start() -> void:
	MobileAds.set_ios_app_pause_on_background(true)   # pause the game under the ad (iOS)
	_request_consent()


# --- Consent -----------------------------------------------------------------------------
func _request_consent() -> void:
	if _consent_busy or _started:
		return
	_consent_busy = true
	var request := ConsentRequestParameters.new()
	request.tag_for_under_age_of_consent = false   # the game is not for children
	UserMessagingPlatform.consent_information.update(request, _on_consent_info, _on_consent_info_failed)


func _on_consent_info() -> void:
	var info := UserMessagingPlatform.consent_information
	if info.get_is_consent_form_available() \
			and info.get_consent_status() == ConsentInformation.ConsentStatus.REQUIRED:
		UserMessagingPlatform.load_consent_form(
			func(form: ConsentForm): form.show(func(_err: FormError): _consent_finished()),
			func(err: FormError):
				print("[AdMob] consent form failed to load: %s" % (err.message if err else "?"))
				_consent_finished())
	else:
		_consent_finished()


func _on_consent_info_failed(err: FormError) -> void:
	print("[AdMob] consent info update failed: %s" % (err.message if err else "?"))
	_consent_finished()   # a previous session's answer may still allow ads


func _consent_finished() -> void:
	_consent_busy = false
	if can_request_ads():
		_start_sdk()
	elif is_inside_tree():
		print("[AdMob] no consent decision yet; ads stay off, retrying in %ds" % int(CONSENT_RETRY))
		get_tree().create_timer(CONSENT_RETRY).timeout.connect(_request_consent)


func can_request_ads() -> bool:
	var s := UserMessagingPlatform.consent_information.get_consent_status()
	return s == ConsentInformation.ConsentStatus.OBTAINED or s == ConsentInformation.ConsentStatus.NOT_REQUIRED


func privacy_options_required() -> bool:
	return UserMessagingPlatform.consent_information.get_privacy_options_requirement_status() \
		== ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED


func show_privacy_options() -> void:
	## The "change my ad choices" form that EEA/UK players must be able to reopen.
	UserMessagingPlatform.show_privacy_options_form(func(_err: FormError):
		if not _started and can_request_ads():
			_start_sdk())


# --- SDK ---------------------------------------------------------------------------------
func _start_sdk() -> void:
	if _started:
		return
	_started = true
	var config := RequestConfiguration.new()
	config.max_ad_content_rating = StoreConfig.MAX_AD_CONTENT_RATING
	MobileAds.set_request_configuration(config)
	var listener := OnInitializationCompleteListener.new()
	listener.on_initialization_complete = func(_status): _preload_all()
	MobileAds.initialize(listener)


func _preload_all() -> void:
	print("[AdMob] ready (%s ads)" % ("test" if StoreConfig.use_test_ads() else "live"))
	var units := {StoreConfig.rewarded_unit(""): true}
	for placement in StoreConfig.ADMOB_REWARDED_BY_PLACEMENT:
		units[StoreConfig.rewarded_unit(placement)] = true
	for unit in units:
		_load_rewarded(unit)
	_load_interstitial()


# --- Rewarded ----------------------------------------------------------------------------
func is_rewarded_ready(placement: String) -> bool:
	return not _showing and _rewarded.has(StoreConfig.rewarded_unit(placement))


func _load_rewarded(unit: String) -> void:
	if unit == "" or not _started or _loading.has(unit) or _rewarded.has(unit):
		return
	_loading[unit] = true
	var cb := RewardedAdLoadCallback.new()
	cb.on_ad_loaded = func(ad: RewardedAd):
		_loading.erase(unit)
		_retry.erase(unit)
		_rewarded[unit] = ad
	cb.on_ad_failed_to_load = func(err: LoadAdError):
		_loading.erase(unit)
		_retry_later(unit, err.message if err else "?", _load_rewarded)
	RewardedAdLoader.new().load(unit, AdRequest.new(), cb)


func show_rewarded(placement: String) -> void:
	var unit := StoreConfig.rewarded_unit(placement)
	var ad: RewardedAd = _rewarded.get(unit)
	if ad == null or _showing:
		rewarded_done.emit(placement, false, "No ad ready yet. Try again in a moment.")
		_load_rewarded(unit)
		return
	_rewarded.erase(unit)
	_showing = true
	var state := {"earned": false, "closed": false, "finished": false}
	var finish := func(ok: bool, reason: String):
		if state.finished:
			return
		state.finished = true
		_showing = false
		ad.destroy()
		_load_rewarded(unit)
		rewarded_done.emit(placement, ok, reason)
	var reward := OnUserEarnedRewardListener.new()
	reward.on_user_earned_reward = func(_item):
		state.earned = true
		if state.closed:
			finish.call(true, "")
	ad.full_screen_content_callback.on_ad_dismissed_full_screen_content = func():
		state.closed = true
		if state.earned:
			finish.call(true, "")
		else:
			get_tree().create_timer(REWARD_GRACE).timeout.connect(func():
				finish.call(state.earned, "" if state.earned else "closed early"))
	ad.full_screen_content_callback.on_ad_failed_to_show_full_screen_content = func(err: AdError):
		finish.call(false, err.message if err else "ad failed to show")
	ad.show(reward)


# --- Interstitial ------------------------------------------------------------------------
func _load_interstitial(_unit: String = "") -> void:
	var unit := StoreConfig.interstitial_unit()
	if unit == "" or not _started or not interstitials_enabled \
			or _interstitial != null or _loading.has(unit):
		return
	_loading[unit] = true
	var cb := InterstitialAdLoadCallback.new()
	cb.on_ad_loaded = func(ad: InterstitialAd):
		_loading.erase(unit)
		_retry.erase(unit)
		_interstitial = ad
	cb.on_ad_failed_to_load = func(err: LoadAdError):
		_loading.erase(unit)
		_retry_later(unit, err.message if err else "?", _load_interstitial)
	InterstitialAdLoader.new().load(unit, AdRequest.new(), cb)


func show_interstitial(placement: String) -> void:
	var ad := _interstitial
	if ad == null or _showing or not interstitials_enabled:
		interstitial_done.emit(placement)
		_load_interstitial()
		return
	_interstitial = null
	_showing = true
	var done := func():
		if not _showing:
			return
		_showing = false
		ad.destroy()
		_load_interstitial()
		interstitial_done.emit(placement)
	ad.full_screen_content_callback.on_ad_dismissed_full_screen_content = done
	ad.full_screen_content_callback.on_ad_failed_to_show_full_screen_content = func(_err): done.call()
	ad.show()


func set_interstitials_enabled(on: bool) -> void:
	interstitials_enabled = on
	if not on and _interstitial != null:
		_interstitial.destroy()
		_interstitial = null
	elif on:
		_load_interstitial()


# --- Retry -------------------------------------------------------------------------------
func _retry_later(unit: String, reason: String, loader: Callable) -> void:
	var wait: float = clampf(_retry.get(unit, RETRY_MIN / 2.0) * 2.0, RETRY_MIN, RETRY_MAX)
	_retry[unit] = wait
	print("[AdMob] load failed for %s (%s), retrying in %ds" % [unit, reason, int(wait)])
	if is_inside_tree():
		get_tree().create_timer(wait).timeout.connect(func(): loader.call(unit))
