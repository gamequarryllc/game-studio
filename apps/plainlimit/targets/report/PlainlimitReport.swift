import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

// The "what used it" list on Today: the apps that used the most time since the
// battery last recharged, as Apple's Screen Time counts them.
//
// The phone runs this in a sealed box: it may draw, and nothing else. The app
// shows the picture and never learns what is in it.

struct AppUse: Identifiable {
  let id: String
  let token: ApplicationToken?
  let name: String
  let seconds: TimeInterval
}

struct UsageSummary {
  let apps: [AppUse]
  let more: Int
}

extension DeviceActivityReport.Context {
  static let topApps = Self("TopApps")
}

func durationWords(_ seconds: TimeInterval) -> String {
  let minutes = max(1, Int((seconds / 60).rounded()))
  if minutes < 60 { return "\(minutes) min" }
  let hours = minutes / 60
  let rest = minutes % 60
  return rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min"
}

struct TopAppsReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .topApps
  let content: (UsageSummary) -> TopAppsView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> UsageSummary {
    var seconds: [String: TimeInterval] = [:]
    var tokens: [String: ApplicationToken] = [:]
    var names: [String: String] = [:]

    for await device in data {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          for await app in category.applications {
            let key =
              app.application.bundleIdentifier ?? app.application.localizedDisplayName ?? "unknown"
            seconds[key, default: 0] += app.totalActivityDuration
            if let token = app.application.token { tokens[key] = token }
            if let name = app.application.localizedDisplayName { names[key] = name }
          }
        }
      }
    }

    // Under half a minute is a glance, not use.
    let all =
      seconds
      .filter { $0.value >= 30 }
      .map { AppUse(id: $0.key, token: tokens[$0.key], name: names[$0.key] ?? "An app", seconds: $0.value) }
      .sorted { $0.seconds > $1.seconds }
    let top = Array(all.prefix(5))
    return UsageSummary(apps: top, more: max(0, all.count - top.count))
  }
}

struct TopAppsView: View {
  let summary: UsageSummary

  private let ink = Color(red: 244 / 255, green: 245 / 255, blue: 242 / 255)
  private let quiet = Color(red: 169 / 255, green: 174 / 255, blue: 179 / 255)
  private let rule = Color(red: 37 / 255, green: 40 / 255, blue: 44 / 255)
  private let ground = Color(red: 14 / 255, green: 16 / 255, blue: 17 / 255)

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if summary.apps.isEmpty {
        Text("Nothing has used any time yet.")
          .font(.system(size: 16))
          .foregroundStyle(quiet)
          .padding(.vertical, 14)
      } else {
        ForEach(Array(summary.apps.enumerated()), id: \.element.id) { index, app in
          HStack(spacing: 12) {
            if let token = app.token {
              Label(token)
                .labelStyle(.titleAndIcon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(ink)
                .lineLimit(1)
            } else {
              Text(app.name)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(ink)
                .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(durationWords(app.seconds))
              .font(.system(size: 17, weight: .semibold, design: .rounded))
              .foregroundStyle(quiet)
              .monospacedDigit()
          }
          .frame(height: 52)
          if index < summary.apps.count - 1 {
            Rectangle().fill(rule).frame(height: 1)
          }
        }
        if summary.more > 0 {
          Text(summary.more == 1 ? "and 1 more app" : "and \(summary.more) more apps")
            .font(.system(size: 14))
            .foregroundStyle(quiet)
            .padding(.top, 10)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(ground)
  }
}

@main
struct PlainlimitReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TopAppsReport { summary in
      TopAppsView(summary: summary)
    }
  }
}
