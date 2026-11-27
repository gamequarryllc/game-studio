import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI

// The person's own app icons, in a grid: the Essentials screen shows the apps
// that stay free as the icons the person knows, not as a number in a sentence
// (the owner, 2026-11-25: the screen was "boring" and "very wordy").
//
// Apple draws each icon from the picks (`Label(token)` from FamilyControls).
// The tokens are sealed: the app hands them back to iOS to draw and never
// learns which apps they are, so nothing here changes what Plainlimit knows.
public class PlainlimitIconsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlainlimitIcons")

    View(AppIconsView.self) {
      Prop("selection") { (view: AppIconsView, value: String?) in
        view.selection = value
      }
      Prop("minus") { (view: AppIconsView, value: String?) in
        view.minus = value
      }
      Prop("size") { (view: AppIconsView, value: Double) in
        view.size = value
      }
      Prop("gap") { (view: AppIconsView, value: Double) in
        view.gap = value
      }
      Prop("columns") { (view: AppIconsView, value: Int) in
        view.columns = value
      }
      Prop("limit") { (view: AppIconsView, value: Int) in
        view.limit = value
      }
      Prop("dim") { (view: AppIconsView, value: Bool) in
        view.dim = value
      }
    }
  }
}

/// One square of the grid: an app, a website, or "+N" for the ones left out.
enum IconItem: Identifiable {
  case app(ApplicationToken, String)
  case site(WebDomainToken, String)
  case more(Int)

  var id: String {
    switch self {
    case .app(_, let key): return "a" + key
    case .site(_, let key): return "s" + key
    case .more(let n): return "+\(n)"
    }
  }
}

class AppIconsView: ExpoView {
  /// The picks to draw, as Apple's picker handed them over.
  var selection: String? { didSet { if selection != oldValue { rebuild() } } }
  /// Picks to leave out (the essentials, when drawing every other app).
  var minus: String? { didSet { if minus != oldValue { rebuild() } } }
  var size: Double = 44 { didSet { if size != oldValue { rebuild() } } }
  /// Space between rows. Across, the icons spread to fill the width.
  var gap: Double = 12 { didSet { if gap != oldValue { rebuild() } } }
  var columns: Int = 6 { didSet { if columns != oldValue { rebuild() } } }
  /// At most this many squares; the last becomes "+N" when there are more. 0: no limit.
  var limit: Int = 0 { didSet { if limit != oldValue { rebuild() } } }
  /// Grey and faded: apps that use the battery.
  var dim: Bool = false { didSet { if dim != oldValue { rebuild() } } }

  private var host: UIHostingController<AnyView>?
  /// Bumped on every rebuild, so the grid is drawn afresh: in build 157 a new
  /// essential (Hinge) only showed after leaving the screen and coming back,
  /// the old grid kept on screen though the picks had changed.
  private var generation = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    backgroundColor = .clear
  }

  // Nothing here can be tapped: a tap goes to whatever holds the grid.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    return nil
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
  }

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

  private static func picks(_ text: String?) -> FamilyActivitySelection? {
    guard let text, !text.isEmpty, let data = Data(base64Encoded: text) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  /// A token written out, so the icons keep one order from one launch to the next (a set has none).
  private static func key<T: Encodable>(_ token: T) -> String {
    (try? JSONEncoder().encode(token))?.base64EncodedString() ?? ""
  }

  private func items() -> [IconItem] {
    guard let picked = AppIconsView.picks(selection) else { return [] }
    let left = AppIconsView.picks(minus)
    let apps = picked.applicationTokens.subtracting(left?.applicationTokens ?? [])
    let sites = picked.webDomainTokens.subtracting(left?.webDomainTokens ?? [])
    var all: [IconItem] = apps.map { IconItem.app($0, AppIconsView.key($0)) }.sorted { $0.id < $1.id }
    all += sites.map { IconItem.site($0, AppIconsView.key($0)) }.sorted { $0.id < $1.id }
    if limit > 0, all.count > limit {
      let shown = max(0, limit - 1)
      return Array(all.prefix(shown)) + [.more(all.count - shown)]
    }
    return all
  }

  private func rebuild() {
    generation += 1
    let grid = AnyView(
      IconGrid(items: items(), size: CGFloat(size), gap: CGFloat(gap), columns: max(1, columns), dim: dim)
        .allowsHitTesting(false)
        .ignoresSafeArea()
        .id(generation))
    if let host {
      host.rootView = grid
    } else {
      let created = UIHostingController(rootView: grid)
      created.safeAreaRegions = []
      created.view.backgroundColor = .clear
      created.view.isUserInteractionEnabled = false
      created.view.frame = bounds
      addSubview(created.view)
      host = created
      attach()
    }
  }
}

struct IconGrid: View {
  let items: [IconItem]
  let size: CGFloat
  let gap: CGFloat
  let columns: Int
  let dim: Bool

  var body: some View {
    GeometryReader { box in
      let across = columns > 1 ? max(0, (box.size.width - size * CGFloat(columns)) / CGFloat(columns - 1)) : 0
      VStack(alignment: .leading, spacing: gap) {
        ForEach(Array(stride(from: 0, to: items.count, by: columns)), id: \.self) { start in
          HStack(spacing: across) {
            ForEach(items[start..<min(start + columns, items.count)]) { item in
              cell(item)
            }
          }
        }
      }
      .frame(width: box.size.width, height: box.size.height, alignment: .topLeading)
    }
  }

  @ViewBuilder
  private func cell(_ item: IconItem) -> some View {
    switch item {
    case .app(let token, _):
      TokenIcon(size: size) { Label(token) }
        .grayscale(dim ? 1 : 0)
        .opacity(dim ? 0.45 : 1)
    case .site(let token, _):
      TokenIcon(size: size) { Label(token) }
        .grayscale(dim ? 1 : 0)
        .opacity(dim ? 0.45 : 1)
    case .more(let n):
      RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
        .fill(Color(red: 0x24 / 255, green: 0x27 / 255, blue: 0x2B / 255))
        .frame(width: size, height: size)
        .overlay(
          Text("+\(n)")
            .font(.system(size: size * 0.34, weight: .semibold))
            .foregroundStyle(Color(red: 0xA9 / 255, green: 0xAE / 255, blue: 0xB3 / 255))
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            .padding(.horizontal, 3))
    }
  }
}

/// Apple's icon for a token, at `size`. Apple draws it about 20 points across
/// whatever font or frame it is given, in a box of its own that does follow
/// the font. So it is drawn as it comes and then scaled up to the square.
///
/// How that was learnt, on the owner's phone: build 157 measured the box and
/// scaled it to the square, and the icons came out 27 points in 44 (a
/// 20-point icon in a 32-point box, scaled by 44/32). Build 158 took that for
/// the font's doing, dropped the scaling for a font of 1.3 of the square, and
/// the icons went back to 20 points: in 42-point squares on the Essentials
/// screen and on setup's last screen (builds 166 and 171), where they looked
/// lost. The font is kept as it was on those builds, since 20 points is what
/// it was measured to give; only the scaling is new.
struct TokenIcon<Content: View>: View {
  let size: CGFloat
  @ViewBuilder let label: () -> Content

  var body: some View {
    label()
      .labelStyle(.iconOnly)
      .font(.system(size: size * 1.3))
      .fixedSize()
      .scaleEffect(size / appleIconPoints)
      .frame(width: size, height: size)
  }
}

/// How big Apple draws a token's icon, in points (see TokenIcon).
private let appleIconPoints: CGFloat = 20
