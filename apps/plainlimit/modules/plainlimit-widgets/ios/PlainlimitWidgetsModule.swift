import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import WidgetKit

// Two small jobs the app cannot do from JavaScript:
//   reload()          asks iOS to redraw the home screen widget after something it
//                     draws from has changed.
//   UsageReportView   a place on screen for Apple's usage report (the "what used it"
//                     list). The list itself is drawn by the report extension in
//                     targets/report/; this only says which hours and which apps.
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
    }
  }
}

class UsageReportView: ExpoView {
  var fromMs: Double = 0 { didSet { if fromMs != oldValue { refresh() } } }
  var toMs: Double = 0 { didSet { if toMs != oldValue { refresh() } } }
  /// The person's picks, as Apple's picker handed them over; nil means every app.
  var selection: String? { didSet { if selection != oldValue { refresh() } } }

  private var host: UIHostingController<AnyView>?

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

  override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
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

  private func refresh() {
    guard fromMs > 0, toMs > fromMs else { return }
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

    let report = AnyView(DeviceActivityReport(DeviceActivityReport.Context("TopApps"), filter: filter).allowsHitTesting(false))
    if let host {
      host.rootView = report
    } else {
      let created = UIHostingController(rootView: report)
      created.view.backgroundColor = .clear
      created.view.isUserInteractionEnabled = false
      created.view.frame = bounds
      insertSubview(created.view, belowSubview: sheet)
      host = created
      attach()
    }
  }
}
