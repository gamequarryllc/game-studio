import AVFoundation
import ExpoModulesCore
import UIKit
import Vision

// Push-ups, counted with the front camera (the owner, 2026-11-26: push-ups as
// an alternative to sums for earning more time).
//
// The phone lies flat on the floor under the face. Many times a second the
// camera's picture is handed to Apple's Vision face finder, and only how big
// the biggest face looks goes to the app (src/domain/pushUps.ts counts). No
// picture is kept, saved or sent: each one is dropped as soon as it is read.
public class PlainlimitPushUpsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlainlimitPushUps")

    // "granted", "denied", "unasked", or "none" when there is no front camera.
    Function("cameraAccess") { () -> String in
      return PlainlimitPushUpsModule.access()
    }

    AsyncFunction("askCamera") { (promise: Promise) in
      if AVCaptureDevice.authorizationStatus(for: .video) != .notDetermined {
        promise.resolve(PlainlimitPushUpsModule.access())
        return
      }
      AVCaptureDevice.requestAccess(for: .video) { _ in
        promise.resolve(PlainlimitPushUpsModule.access())
      }
    }

    View(PushUpCameraView.self) {
      Events("onFace")
      Prop("active") { (view: PushUpCameraView, value: Bool) in
        view.active = value
      }
    }
  }

  static func access() -> String {
    if AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) == nil { return "none" }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: return "granted"
    case .notDetermined: return "unasked"
    default: return "denied"
    }
  }
}

/// The camera's picture on screen, and the face finder behind it.
class PushUpCameraView: ExpoView {
  let onFace = EventDispatcher()
  /// Off: the camera stops (the screen showing it has moved on).
  var active: Bool = true { didSet { if active != oldValue { update() } } }

  private let reader: PushUpFaceReader
  private let preview: AVCaptureVideoPreviewLayer
  private var running = false
  /// The rotation coordinator (iOS 17 and later) and its watch, kept while the view lives.
  private var rotation: AnyObject?
  private var watching: NSKeyValueObservation?

  required init(appContext: AppContext? = nil) {
    let reader = PushUpFaceReader()
    self.reader = reader
    preview = AVCaptureVideoPreviewLayer(session: reader.session)
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    preview.videoGravity = .resizeAspectFill
    layer.addSublayer(preview)
    reader.onSize = { [weak self] size, at in
      // Sent from the camera's queue; events go out from the main one.
      DispatchQueue.main.async {
        self?.onFace(["size": size ?? -1, "t": at])
      }
    }
    reader.onReady = { [weak self] device in
      DispatchQueue.main.async {
        if #available(iOS 17.0, *) { self?.turnUpright(device) }
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    update()
  }

  private func update() {
    let want = active && window != nil
    if want == running { return }
    running = want
    // Nobody touches the phone while doing push-ups: it must not dim and lock.
    UIApplication.shared.isIdleTimerDisabled = want
    if want { reader.start() } else { reader.stop() }
  }

  /// Keeps the picture upright, as the phone is held (it is drawn the way the phone last stood when it lies flat).
  /// The camera stops, and the screen may dim again, when the view leaves the screen (`didMoveToWindow`).
  @available(iOS 17.0, *)
  private func turnUpright(_ device: AVCaptureDevice) {
    let coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: preview)
    rotation = coordinator
    let apply = { [weak self] in
      guard let self, let connection = self.preview.connection else { return }
      let angle = coordinator.videoRotationAngleForHorizonLevelPreview
      if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
    }
    apply()
    watching = coordinator.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.new]) { _, _ in
      DispatchQueue.main.async { apply() }
    }
  }
}

/// Runs the camera on its own queue and finds the face in each picture.
final class PushUpFaceReader: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let session = AVCaptureSession()
  /// How big the biggest face looks (the square root of its share of the picture, 0 to 1), or nil; and when, in ms.
  var onSize: ((Double?, Double) -> Void)?
  /// The camera is set up: the view keeps its picture upright from it.
  var onReady: ((AVCaptureDevice) -> Void)?

  private let queue = DispatchQueue(label: "com.gamequarry.plainlimit.pushups")
  private var configured = false
  private var lastRead: CFTimeInterval = 0
  /// Which way up the picture is read. The phone held upright, front camera: left, mirrored. When no face is
  /// found for a while, the others are tried in turn, in case the phone lies the other way round.
  private let orientations: [CGImagePropertyOrientation] = [.leftMirrored, .rightMirrored, .upMirrored, .downMirrored]
  private var orientationAt = 0
  private var misses = 0

  func start() {
    queue.async {
      if !self.configured { self.configure() }
      if self.configured && !self.session.isRunning { self.session.startRunning() }
    }
  }

  func stop() {
    let session = self.session
    queue.async {
      if session.isRunning { session.stopRunning() }
    }
  }

  private func configure() {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
      let input = try? AVCaptureDeviceInput(device: device)
    else { return }
    session.beginConfiguration()
    // A small picture is plenty to find a face, and keeps the phone cool.
    if session.canSetSessionPreset(.vga640x480) { session.sessionPreset = .vga640x480 }
    guard session.canAddInput(input) else {
      session.commitConfiguration()
      return
    }
    session.addInput(input)
    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
    output.setSampleBufferDelegate(self, queue: queue)
    guard session.canAddOutput(output) else {
      session.removeInput(input)
      session.commitConfiguration()
      return
    }
    session.addOutput(output)
    session.commitConfiguration()
    configured = true
    onReady?(device)
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let now = CACurrentMediaTime()
    // About 20 readings a second is plenty for push-ups.
    if now - lastRead < 0.045 { return }
    lastRead = now
    guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let request = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientations[orientationAt], options: [:])
    do {
      try handler.perform([request])
    } catch {
      onSize?(nil, now * 1000)
      return
    }
    let biggest = (request.results ?? []).map { Double($0.boundingBox.width * $0.boundingBox.height) }.max()
    if let area = biggest, area > 0 {
      misses = 0
      onSize?(min(1, area.squareRoot()), now * 1000)
      return
    }
    misses += 1
    // At the bottom of a push-up the face is often too close to be found: give that a moment before trying another way up.
    if misses >= 30 && misses % 10 == 0 { orientationAt = (orientationAt + 1) % orientations.count }
    onSize?(nil, now * 1000)
  }
}
