Pod::Spec.new do |s|
  s.name           = 'PlainlimitWidgets'
  s.version        = '1.0.0'
  s.summary        = 'Lets the app ask iOS to redraw its home screen widget'
  s.description    = 'Lets the app ask iOS to redraw its home screen widget after its settings change.'
  s.license        = 'MIT'
  s.author         = 'Game Quarry'
  s.homepage       = 'https://github.com/gamequarryllc/game-studio'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/gamequarryllc/game-studio' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
