Pod::Spec.new do |s|
  s.name           = 'PlainlimitWidgets'
  s.version        = '1.0.0'
  s.summary        = 'Lets the app ask iOS to redraw its home screen widget'
  s.description    = 'Lets the app ask iOS to redraw its home screen widget, and gives the usage report from Screen Time a place on screen.'
  s.license        = 'MIT'
  s.author         = 'Game Quarry'
  s.homepage       = 'https://github.com/gamequarryllc/game-studio'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/gamequarryllc/game-studio' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
