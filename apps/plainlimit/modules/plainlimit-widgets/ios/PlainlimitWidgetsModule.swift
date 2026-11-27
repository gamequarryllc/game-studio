import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import WidgetKit

// Two small jobs the app cannot do from JavaScript:
//   reload()          asks iOS to redraw the home screen widget after something it
//                     draws from has changed.
//   UsageReportView   a place on screen for one of Apple's usage reports: the "what
//                     used it" list, or the day's total. Either is drawn by the
//                     report extension in targets/report/; this only says which
//                     report, which hours and which apps.
public class PlainlimitWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlainlimitWidgets")

    Function("reload") {
      WidgetCenter.shared.reloadAllTimelines()
    }

    // The installed app's own version and build number, for the test build's readout.
    Function("build") { () -> String in
      let info = Bundle.main.infoDictionary
      let version = info?["CFBundleShortVersionString"] as? String ?? "?"
      let build = info?["CFBundleVersion"] as? String ?? "?"
      return "\(version) (\(build))"
    }

    View(UsageReportView.self) {
      Prop("fromMs") { (view: UsageReportView, value: Double) in
        view.fromMs = value
      }
      Prop("toMs") { (view: UsageReportView, value: Double) in
        view.toMs = value
      }
      Prop("selection") { (view: UsageReportView, value: String?) in
        view.selection = value
      }
      Prop("context") { (view: UsageReportView, value: String?) in
        view.context = value ?? "TopApps"
      }
      Prop("minus") { (view: UsageReportView, value: String?) in
        view.minus = value
      }
    }
  }
}

class UsageReportView: ExpoView {
  var fromMs: Double = 0 { didSet { if fromMs != oldValue { refresh() } } }
  var toMs: Double = 0 { didSet { if toMs != oldValue { refresh() } } }
  /// The person's picks, as Apple's picker handed them over; nil means every app.
  /// Closing the picker can hand over the same picks written another way (a
  /// set's order is not fixed), so only different picks draw the report again:
  /// each new drawing is a chance for the phone never to finish it (build 127,
  /// setup's chart after Back, the essentials and Next).
  var selection: String? { didSet { if !UsageReportView.samePicks(selection, oldValue) { refresh() } } }
  /// Which report: "TopApps" (the list), "Total" (the day's figure), and the rest of targets/report's list.
  var context: String = "TopApps" { didSet { if context != oldValue { refresh() } } }
  /// The essentials, which the "BatteryApps" list, the "BatteryTotal" figure
  /// and setup's picture leave out. The report reads them for itself (it
  /// cannot be handed "every app but these"); they are here only so that a
  /// change of essentials draws the picture again.
  var minus: String? { didSet { if !UsageReportView.samePicks(minus, oldValue) { refresh() } } }

  private var host: UIHostingController<AnyView>?

  private static func picks(_ text: String?) -> FamilyActivitySelection? {
    guard let text, !text.isEmpty, let data = Data(base64Encoded: text) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  /// Whether two of Apple's selections, as handed over, name the same apps, categories and sites.
  private static func samePicks(_ a: String?, _ b: String?) -> Bool {
    if a == b { return true }
    guard let one = picks(a), let other = picks(b) else { return false }
    return one.applicationTokens == other.applicationTokens
      && one.categoryTokens == other.categoryTokens
      && one.webDomainTokens == other.webDomainTokens
  }

  // The list is drawn by another process. A touch that lands on it is handed
  // to that process by iOS before this app is asked anything, so a finger on
  // the list could not scroll the screen it sits in, whatever this view said
  // about touches. A sheet of this app's own, almost clear, lies over the list:
  // the touch now lands on the sheet, comes to this app, and `hitTest` below
  // passes it to the screen behind.
  private let sheet = UIView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear
    sheet.backgroundColor = UIColor(white: 0, alpha: 0.02)
    addSubview(sheet)
  }

  // Nothing in the list can be tapped; touches go to whatever is behind.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    return nil
  }

  private var laidOutSize = CGSize.zero

  override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
    // When the box gets its real size after the report was first drawn, ask
    // the report to lay itself out again, so it does not keep the first size.
    if bounds.size != laidOutSize {
      let first = laidOutSize == .zero
      laidOutSize = bounds.size
      host?.view.setNeedsLayout()
      host?.view.layoutIfNeeded()
      // A report first laid out at another size could keep drawing as if it
      // still had it (build 86: the day's figure half below its box now and
      // then). Building it again at the real size starts it from that size.
      if !first, host != nil { refresh() }
    }
    sheet.frame = bounds
    bringSubviewToFront(sheet)
  }

  // The report is drawn by another process and shown through the hosting
  // controller. That only works when the controller is part of the screen's
  // own chain of view controllers; a bare view on its own stays blank.
  override func didMoveToWindow() {
    super.didMoveToWindow()
    attach()
  }

  private func attach() {
    guard let host else { return }
    if window != nil {
      if host.parent == nil, let parent = nearestViewController {
        parent.addChild(host)
        host.didMove(toParent: parent)
      }
    } else if host.parent != nil {
      host.willMove(toParent: nil)
      host.removeFromParent()
    }
  }

  private var nearestViewController: UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController { return controller }
      responder = next
    }
    return nil
  }

  /// Props arrive one at a time; build the report once they have all landed.
  /// Bumped on every rebuild. The phone's report does not redraw when only its
  /// filter changes (build 51: unticking an app left it in the list until the
  /// app was reopened), so each rebuild gets a new identity.
  private var generation = 0

  /// Counts the asks, so only the last of a burst builds the report.
  private var asked = 0

  // The first report is built as soon as its props have landed. Later ones
  // wait for half a second of quiet: tapping a stepper (the recharge time)
  // asked for a new report on every tap, and after a burst of those the phone
  // stopped drawing at all and left the dots showing (build 99, setup's
  // "Used today" and "Daily average").
  private func refresh() {
    asked += 1
    let mine = asked
    let wait: DispatchTimeInterval = host == nil ? .milliseconds(0) : .milliseconds(500)
    DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
      guard let self, self.asked == mine else { return }
      self.rebuild()
    }
  }

  private func rebuild() {
    guard fromMs > 0, toMs > fromMs else { return }
    generation += 1
    let interval = DateInterval(
      start: Date(timeIntervalSince1970: fromMs / 1000),
      end: Date(timeIntervalSince1970: toMs / 1000)
    )

    var filter = DeviceActivityFilter(segment: .hourly(during: interval))
    if let selection, !selection.isEmpty, let data = Data(base64Encoded: selection),
      let picked = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) {
      filter = DeviceActivityFilter(
        segment: .hourly(during: interval),
        applications: picked.applicationTokens,
        categories: picked.categoryTokens,
        webDomains: picked.webDomainTokens
      )
    }

    // Safe areas are ignored: a hosting view near the clock was given a top
    // inset, which pushed the phone's figure down and shrank it, so it showed
    // squeezed under Plainlimit's own number (build 67, Today's "Used today").
    let report = AnyView(
      DeviceActivityReport(DeviceActivityReport.Context(context), filter: filter)
        .allowsHitTesting(false)
        .ignoresSafeArea()
        .id(generation))
    if let host {
      host.rootView = report
    } else {
      let created = UIHostingController(rootView: report)
      created.safeAreaRegions = []
      created.view.backgroundColor = .clear
      created.view.isUserInteractionEnabled = false
      created.view.frame = bounds
      insertSubview(created.view, belowSubview: sheet)
      host = created
      attach()
    }
  }
}
