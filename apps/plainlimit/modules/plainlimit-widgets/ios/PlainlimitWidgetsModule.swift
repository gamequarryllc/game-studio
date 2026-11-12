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

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
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

    let report = AnyView(DeviceActivityReport(DeviceActivityReport.Context("TopApps"), filter: filter))
    if let host {
      host.rootView = report
    } else {
      let created = UIHostingController(rootView: report)
      created.view.backgroundColor = .clear
      created.view.frame = bounds
      addSubview(created.view)
      host = created
    }
  }
}
