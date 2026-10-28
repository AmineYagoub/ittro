# Ittro sensors consumer rules, shipped to the app with this module.
# ExpoModulesHelper loads the generated list by literal name with
# Class.forName, but upstream expo keeps only its members, so release
# builds rename the class and no native module registers. Keep it whole.
-keep class expo.modules.ExpoModulesPackageList { *; }
