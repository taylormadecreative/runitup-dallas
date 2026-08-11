require 'xcodeproj'
proj = Xcodeproj::Project.open('ios/App/App.xcodeproj')
abort 'RunItUpWatchTests already exists' if proj.targets.any? { |t| t.name == 'RunItUpWatchTests' }
watch = proj.targets.find { |t| t.name == 'RunItUpWatch' } or abort 'RunItUpWatch missing'

t = proj.new_target(:unit_test_bundle, 'RunItUpWatchTests', :watchos, '10.0')
grp = proj.main_group.new_group('RunItUpWatchTests', 'RunItUpWatchTests')
t.add_file_references([grp.new_file('RunEnginesTests.swift')])
# Pure engines compile into the test bundle — a watch app executable cannot be
# linked as a TEST_HOST for logic tests.
watch_grp = proj.main_group['RunItUpWatch']
%w[RunMilestones.swift AutoPause.swift].each do |f|
  ref = watch_grp.files.find { |x| x.path.to_s == f } || watch_grp.new_file(f)
  t.add_file_references([ref])
end
t.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.runitupdallas.app.watchkitapp.tests'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SDKROOT'] = 'watchos'
  s['WATCHOS_DEPLOYMENT_TARGET'] = '10.0'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '4'
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = 'KR5KYG8W44'
  s['TEST_HOST'] = ''
end
t.add_dependency(watch)
proj.save
puts 'RunItUpWatchTests added'
