import ExpoModulesCore
import WidgetKit

// One job: the app calls reload() after it changes anything the home screen
// widget draws from (the goal, the recharge time), so the widget does not wait
// for iOS to refresh it on its own.
public class PlainlimitWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlainlimitWidgets")

    Function("reload") {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
