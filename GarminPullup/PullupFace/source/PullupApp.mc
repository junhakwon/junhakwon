import Toybox.Application;
import Toybox.WatchUi;

// Entry point: the watch loads this class and shows PullupView as the watch face.
class PullupApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        return [ new PullupView() ];
    }
}
