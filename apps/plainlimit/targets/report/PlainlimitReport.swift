import CoreText
import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

// Two pictures for Today, both as Apple's Screen Time counts:
//   TopApps  the "what used it" list: the apps that used the most time since the
//            battery last recharged.
//   Total    the day's figure: every minute the counted apps have been used
//            since the recharge, to the minute, added up app by app. The app
//            itself only learns use in steps, so this is the exact number the
//            person sees.
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
  static let total = Self("Total")
}

private let ink = Color(red: 244 / 255, green: 245 / 255, blue: 242 / 255)
private let quiet = Color(red: 169 / 255, green: 174 / 255, blue: 179 / 255)
private let rule = Color(red: 37 / 255, green: 40 / 255, blue: 44 / 255)
private let ground = Color(red: 14 / 255, green: 16 / 255, blue: 17 / 255)

/// The app's display face, shipped inside this extension (the build copies it
/// in). If it cannot be loaded the phone's own bold face is used instead.
private let displayFace: String? = {
  guard let url = Bundle.main.url(forResource: "SpaceGrotesk_700Bold", withExtension: "ttf") else { return nil }
  CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
  return "SpaceGrotesk-Bold"
}()

/// "1:23", the way the app writes a length of time.
func clockWords(_ seconds: TimeInterval) -> String {
  let minutes = max(0, Int(seconds / 60))
  return "\(minutes / 60):" + String(format: "%02d", minutes % 60)
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

struct TotalReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .total
  let content: (TimeInterval) -> TotalView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> TimeInterval {
    // Added up app by app, the same way as the list. A segment's own total is
    // all screen-on time, including time in no app at all (build 48 showed it:
    // 3:10 against 1:50 of app use), and it ignores which apps are ticked.
    // Websites are left out: their time is already inside the browser's.
    var seconds: TimeInterval = 0
    for await device in data {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          for await app in category.applications {
            seconds += app.totalActivityDuration
          }
        }
      }
    }
    return seconds
  }
}

struct TotalView: View {
  let seconds: TimeInterval

  var body: some View {
    HStack(spacing: 0) {
      Text(clockWords(seconds))
        .font(displayFace.map { Font.custom($0, size: 48) } ?? .system(size: 48, weight: .bold))
        .tracking(-1.6)
        .foregroundStyle(ink)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(ground)
  }
}

@main
struct PlainlimitReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TopAppsReport { summary in
      TopAppsView(summary: summary)
    }
    TotalReport { seconds in
      TotalView(seconds: seconds)
    }
  }
}
