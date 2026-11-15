import AVFoundation
import ExpoModulesCore
import QuickLook
import UIKit
import UniformTypeIdentifiers
import Vision

// Plainproof's own native module: the few things the app needs that no Expo
// library does. Everything here runs on the phone; nothing is sent anywhere.
//
//   recognizeText(uri)        the text in a photo, line by line (Apple's Vision)
//   mediaDate(uri)            when a video was recorded, from the file itself
//   preview(uri, title)       a PDF or picture full screen (Quick Look)
//   pickFolder()              the person chooses a folder in Files (iCloud Drive)
//   folderInfo(bookmark)      the name of that folder, or nil if it is gone
//   saveToFolder(...)         copies a backup into that folder, keeping the one before
//
// A chosen folder is remembered with a bookmark: iOS lets an app keep writing
// to a folder the person picked, across restarts, as long as it holds one.
public class PlainproofNativeModule: Module {
  private var folderPicker: FolderPicker?
  private var previewer: Previewer?

  public func definition() -> ModuleDefinition {
    Name("PlainproofNative")

    AsyncFunction("recognizeText") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try recognizeLines(uri))
        } catch {
          promise.reject("ERR_TEXT", error.localizedDescription)
        }
      }
    }

    AsyncFunction("mediaDate") { (uri: String) async -> Double? in
      guard let url = fileURL(uri) else { return nil }
      let asset = AVURLAsset(url: url)
      guard let item = try? await asset.load(.creationDate) else { return nil }
      guard let date = try? await item.load(.dateValue) else { return nil }
      return date.timeIntervalSince1970 * 1000
    }

    AsyncFunction("preview") { (uri: String, title: String, promise: Promise) in
      guard let url = fileURL(uri) else {
        promise.reject("ERR_PREVIEW", "That is not a file on this iPhone")
        return
      }
      guard let currentVc = appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_PREVIEW", "There is no screen to show it on")
        return
      }
      let previewer = Previewer(url: url, title: title) { [weak self] in
        self?.previewer = nil
      }
      self.previewer = previewer
      let controller = QLPreviewController()
      controller.dataSource = previewer
      controller.delegate = previewer
      currentVc.present(controller, animated: true)
      promise.resolve(nil)
    }.runOnQueue(.main)

    AsyncFunction("pickFolder") { (promise: Promise) in
      if folderPicker != nil {
        promise.reject("ERR_BUSY", "A folder is already being chosen")
        return
      }
      guard let currentVc = appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_PICKER", "There is no screen to show the picker on")
        return
      }
      let picker = FolderPicker { [weak self] url in
        self?.folderPicker = nil
        guard let url = url else {
          promise.resolve(nil)
          return
        }
        do {
          promise.resolve(try pickedFolder(url))
        } catch {
          promise.reject("ERR_FOLDER_ACCESS", error.localizedDescription)
        }
      }
      folderPicker = picker
      picker.present(from: currentVc)
    }.runOnQueue(.main)

    AsyncFunction("folderInfo") { (bookmark: String, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        guard let folder = try? resolveBookmark(bookmark) else {
          promise.resolve(nil)
          return
        }
        let accessing = folder.url.startAccessingSecurityScopedResource()
        defer {
          if accessing { folder.url.stopAccessingSecurityScopedResource() }
        }
        var isFolder: ObjCBool = false
        guard FileManager.default.fileExists(atPath: folder.url.path, isDirectory: &isFolder), isFolder.boolValue else {
          promise.resolve(nil)
          return
        }
        promise.resolve(describe(folder.url))
      }
    }

    AsyncFunction("saveToFolder") { (bookmark: String, sourceUri: String, fileName: String, previousName: String, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        do {
          var out: [String: Any] = [:]
          if let fresh = try saveIntoFolder(bookmark: bookmark, sourceUri: sourceUri, fileName: fileName, previousName: previousName) {
            out["bookmark"] = fresh
          }
          promise.resolve(out)
        } catch let failure as FolderFailure {
          promise.reject(failure.code, failure.message)
        } catch {
          promise.reject("ERR_SAVE", error.localizedDescription)
        }
      }
    }
  }
}

// MARK: - Text

private func fileURL(_ uri: String) -> URL? {
  if uri.hasPrefix("file://") { return URL(string: uri) }
  if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
  return nil
}

private func orientation(of image: UIImage) -> CGImagePropertyOrientation {
  switch image.imageOrientation {
  case .up: return .up
  case .upMirrored: return .upMirrored
  case .down: return .down
  case .downMirrored: return .downMirrored
  case .left: return .left
  case .leftMirrored: return .leftMirrored
  case .right: return .right
  case .rightMirrored: return .rightMirrored
  @unknown default: return .up
  }
}

/// The lines of text in a picture, top to bottom and left to right.
private func recognizeLines(_ uri: String) throws -> [String] {
  guard let url = fileURL(uri) else { return [] }
  guard let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else { return [] }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  // Serial numbers and prices are not words: "correcting" them into words would spoil them.
  request.usesLanguageCorrection = false
  let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation(of: image), options: [:])
  try handler.perform([request])
  let observations = request.results ?? []
  // Vision measures from the bottom left, so a higher midY is higher on the page.
  let sorted = observations.sorted { a, b in
    let dy = a.boundingBox.midY - b.boundingBox.midY
    if abs(dy) > 0.012 { return dy > 0 }
    return a.boundingBox.minX < b.boundingBox.minX
  }
  return sorted.compactMap { $0.topCandidates(1).first?.string }
}

// MARK: - Quick Look

private final class PreviewItem: NSObject, QLPreviewItem {
  var previewItemURL: URL?
  var previewItemTitle: String?

  init(url: URL, title: String) {
    previewItemURL = url
    previewItemTitle = title
  }
}

private final class Previewer: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  private let item: PreviewItem
  private let done: () -> Void

  init(url: URL, title: String, done: @escaping () -> Void) {
    item = PreviewItem(url: url, title: title)
    self.done = done
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
    return 1
  }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
    return item
  }

  func previewControllerDidDismiss(_ controller: QLPreviewController) {
    done()
  }
}

// MARK: - The backup folder

private struct FolderFailure: Error {
  let code: String
  let message: String
}

private final class FolderPicker: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private let done: (URL?) -> Void
  private var finished = false

  init(done: @escaping (URL?) -> Void) {
    self.done = done
  }

  func present(from currentVc: UIViewController) {
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
    picker.delegate = self
    picker.presentationController?.delegate = self
    picker.allowsMultipleSelection = false
    picker.modalPresentationStyle = .pageSheet
    currentVc.present(picker, animated: true)
  }

  private func finish(_ url: URL?) {
    if finished { return }
    finished = true
    done(url)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finish(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(nil)
  }
}

private func describe(_ url: URL) -> [String: Any] {
  let values = try? url.resourceValues(forKeys: [.localizedNameKey, .isUbiquitousItemKey])
  let inCloud = (values?.isUbiquitousItem ?? false) || url.path.contains("/Mobile Documents/")
  return ["name": values?.localizedName ?? url.lastPathComponent, "inCloud": inCloud]
}

private func pickedFolder(_ url: URL) throws -> [String: Any] {
  let accessing = url.startAccessingSecurityScopedResource()
  defer {
    if accessing { url.stopAccessingSecurityScopedResource() }
  }
  let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
  var info = describe(url)
  info["bookmark"] = bookmark.base64EncodedString()
  return info
}

private func resolveBookmark(_ base64: String) throws -> (url: URL, stale: Bool) {
  guard let data = Data(base64Encoded: base64) else {
    throw FolderFailure(code: "ERR_FOLDER_GONE", message: "The folder is not known")
  }
  var stale = false
  let url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
  return (url, stale)
}

/// Copies the file into the folder as `fileName`. The copy already there becomes
/// `previousName`, so one bad backup can never be the only one. The new file is
/// written beside the old one first and only then moved into place, so the
/// folder never holds half a backup under the real name. Returns a fresh
/// bookmark when iOS says the old one is out of date.
private func saveIntoFolder(bookmark: String, sourceUri: String, fileName: String, previousName: String) throws -> String? {
  let folder: (url: URL, stale: Bool)
  do {
    folder = try resolveBookmark(bookmark)
  } catch {
    throw FolderFailure(code: "ERR_FOLDER_GONE", message: error.localizedDescription)
  }
  guard folder.url.startAccessingSecurityScopedResource() else {
    throw FolderFailure(code: "ERR_FOLDER_GONE", message: "Plainproof can no longer open the folder")
  }
  defer { folder.url.stopAccessingSecurityScopedResource() }

  var isFolder: ObjCBool = false
  guard FileManager.default.fileExists(atPath: folder.url.path, isDirectory: &isFolder), isFolder.boolValue else {
    throw FolderFailure(code: "ERR_FOLDER_GONE", message: "The folder is gone")
  }
  guard let source = fileURL(sourceUri) else {
    throw FolderFailure(code: "ERR_SAVE", message: "The backup file is missing")
  }

  let target = folder.url.appendingPathComponent(fileName)
  let previous = folder.url.appendingPathComponent(previousName)
  var coordinationError: NSError?
  var workError: Error?
  NSFileCoordinator(filePresenter: nil).coordinate(
    writingItemAt: target, options: .forReplacing,
    writingItemAt: previous, options: .forReplacing,
    error: &coordinationError
  ) { newTarget, newPrevious in
    let fm = FileManager.default
    let staged = newTarget.deletingLastPathComponent().appendingPathComponent(".\(fileName).saving")
    do {
      if fm.fileExists(atPath: staged.path) { try fm.removeItem(at: staged) }
      try fm.copyItem(at: source, to: staged)
      if fm.fileExists(atPath: newTarget.path) {
        if fm.fileExists(atPath: newPrevious.path) { try fm.removeItem(at: newPrevious) }
        try fm.moveItem(at: newTarget, to: newPrevious)
      }
      try fm.moveItem(at: staged, to: newTarget)
    } catch {
      try? fm.removeItem(at: staged)
      workError = error
    }
  }
  if let error = coordinationError {
    throw FolderFailure(code: "ERR_SAVE", message: error.localizedDescription)
  }
  if let error = workError {
    throw FolderFailure(code: "ERR_SAVE", message: error.localizedDescription)
  }
  if folder.stale {
    return try? folder.url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil).base64EncodedString()
  }
  return nil
}
