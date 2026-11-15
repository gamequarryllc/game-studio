Pod::Spec.new do |s|
  s.name           = 'PlainproofNative'
  s.version        = '1.0.0'
  s.summary        = 'Text recognition, Quick Look and a chosen backup folder for Plainproof'
  s.description    = 'Reads the text in a photo with Vision, shows a document with Quick Look, reads when a video was recorded, and keeps writing backups to a folder the person chose in Files.'
  s.license        = 'MIT'
  s.author         = 'Game Quarry'
  s.homepage       = 'https://github.com/gamequarryllc/game-studio'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/gamequarryllc/game-studio' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'QuickLook', 'AVFoundation', 'UniformTypeIdentifiers'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
