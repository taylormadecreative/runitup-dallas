# Adds the RunItUpWatch watchOS app target (Xcode 14+ single-target style)
# and embeds it in the iOS App target. Idempotent: bails if it already exists.
require 'xcodeproj'

proj = Xcodeproj::Project.open('ios/App/App.xcodeproj')
abort 'RunItUpWatch target already exists' if proj.targets.any? { |t| t.name == 'RunItUpWatch' }
app = proj.targets.find { |t| t.name == 'App' } or abort 'App target not found'

watch = proj.new_target(:application, 'RunItUpWatch', :watchos, '10.0')

grp = proj.main_group.new_group('RunItUpWatch', 'RunItUpWatch')
watch.add_file_references([grp.new_file('RunItUpWatchApp.swift')])
grp.new_file('Info.plist')
grp.new_file('RunItUpWatch.entitlements')
assets = grp.new_file('Assets.xcassets')
watch.resources_build_phase.add_file_reference(assets)

watch.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.runitupdallas.app.watchkitapp'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'RunItUpWatch/Info.plist'
  s['CODE_SIGN_ENTITLEMENTS'] = 'RunItUpWatch/RunItUpWatch.entitlements'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SDKROOT'] = 'watchos'
  s['WATCHOS_DEPLOYMENT_TARGET'] = '10.0'
  s['TARGETED_DEVICE_FAMILY'] = '4'
  s['SUPPORTED_PLATFORMS'] = 'watchsimulator watchos'
  s['SWIFT_VERSION'] = '5.0'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = 'KR5KYG8W44'
  s['MARKETING_VERSION'] = '1.3'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['SKIP_INSTALL'] = 'YES'
  s['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  s['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  s['ENABLE_PREVIEWS'] = 'YES'
end

# Embed into the iOS app under Watch/
app.add_dependency(watch)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Watch Content' } ||
        app.new_copy_files_build_phase('Embed Watch Content')
embed.symbol_dst_subfolder_spec = :products_directory
embed.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
bf = embed.add_file_reference(watch.product_reference)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

proj.save
puts 'RunItUpWatch target added'
