# Adds the RunItUpWidgets Live Activity extension target to App.xcodeproj.
# Idempotence: bails if the target already exists.
require 'xcodeproj'

proj = Xcodeproj::Project.open('ios/App/App.xcodeproj')
abort 'RunItUpWidgets target already exists' if proj.targets.any? { |t| t.name == 'RunItUpWidgets' }
app = proj.targets.find { |t| t.name == 'App' } or abort 'App target not found'

w = proj.new_target(:app_extension, 'RunItUpWidgets', :ios, '16.2')

grp = proj.main_group.new_group('RunItUpWidgets', 'RunItUpWidgets')
srcs = ['RunItUpWidgetsBundle.swift', 'RunActivityWidget.swift'].map { |f| grp.new_file(f) }
grp.new_file('Info.plist')
w.add_file_references(srcs)

# RunActivityAttributes.swift is shared between the app target and the widget
app_grp = proj.main_group['App']
attr_ref = app_grp.files.find { |f| f.path.to_s.end_with?('RunActivityAttributes.swift') }
unless attr_ref
  attr_ref = app_grp.new_file('RunActivityAttributes.swift')
  app.add_file_references([attr_ref])
end
w.add_file_references([attr_ref])

# LiveActivityBridge.swift belongs to the app target only
unless app_grp.files.any? { |f| f.path.to_s.end_with?('LiveActivityBridge.swift') }
  app.add_file_references([app_grp.new_file('LiveActivityBridge.swift')])
end

w.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.runitupdallas.app.RunItUpWidgets'
  s['INFOPLIST_FILE'] = 'RunItUpWidgets/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  s['INFOPLIST_KEY_CFBundleDisplayName'] = 'Run It UP!'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = 'KR5KYG8W44'
  s['MARKETING_VERSION'] = '1.3'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['SKIP_INSTALL'] = 'YES'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
end

app.add_dependency(w)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.dst_subfolder_spec = '13' # PlugIns
bf = embed.add_file_reference(w.product_reference)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

proj.save
puts 'RunItUpWidgets target added'
