import UIKit
import Capacitor

class RIUViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RunEnginePlugin())
    }
}
