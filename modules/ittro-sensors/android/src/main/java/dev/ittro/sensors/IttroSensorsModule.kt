package dev.ittro.sensors

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Skeleton of the on-phone sensor module. Filled in during the dev-client
// build phase: owned grayscale frame buffers (never a retained camera
// buffer), capture timestamps and frame IDs on every snapshot, and
// hand-landmark results with capture-to-use age.
class IttroSensorsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IttroSensors")

    Function("getStatus") {
      mapOf(
        "available" to true,
        "module" to "IttroSensors",
      )
    }
  }
}
