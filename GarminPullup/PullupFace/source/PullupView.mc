import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// Restarts the animation each time it finishes, so the 5-rep set loops while the watch is awake.
class LoopDelegate extends WatchUi.AnimationDelegate {
    private var _view;

    function initialize(view) {
        AnimationDelegate.initialize();
        _view = view;
    }

    function onAnimationEvent(event, options) {
        if (event == WatchUi.ANIMATION_EVENT_COMPLETE) {
            _view.replay();
        }
    }
}

// Forerunner 265, 416 x 416 AMOLED.
// Awake (after a wrist raise): pull-up animation, date, large time, heart rate / steps / battery.
// Asleep (always-on): only the time and day in dim colours, shifted each minute against burn-in.
class PullupView extends WatchUi.WatchFace {
    private const RED = 0xE5402F;
    private const LIGHT = 0xE9EBEE;
    private const GREY = 0xC9CCD1;
    private const GREEN = 0x7BD88F;
    private const DAYS = ["", "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    private const MONTHS = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    private var _anim = null;
    private var _delegate = null;
    private var _sleeping = false;

    function initialize() {
        WatchFace.initialize();
    }

    function onLayout(dc) {
        // 240 x 240 animation, centred horizontally, near the top of the screen
        _anim = new WatchUi.AnimationLayer(Rez.Drawables.Pullup, { :locX => 88, :locY => 18 });
        addLayer(_anim);
        _delegate = new LoopDelegate(self);
    }

    function onShow() {
        replay();
    }

    function replay() {
        if (_anim != null && !_sleeping) {
            _anim.play({ :delegate => _delegate });
        }
    }

    // Wrist raised: show and start the animation
    function onExitSleep() {
        _sleeping = false;
        if (_anim != null) {
            _anim.setVisible(true);
        }
        replay();
        WatchUi.requestUpdate();
    }

    // Watch dims: stop and hide the animation, switch to the low-power face
    function onEnterSleep() {
        _sleeping = true;
        if (_anim != null) {
            _anim.stop();
            _anim.setVisible(false);
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var clock = System.getClockTime();
        var timeText = formatTime(clock);
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);

        if (_sleeping) {
            drawAlwaysOn(dc, clock, timeText, info);
            return;
        }

        var cx = dc.getWidth() / 2;

        // date under the animation
        dc.setColor(RED, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 248, Graphics.FONT_SMALL,
            DAYS[info.day_of_week] + " " + info.day.toString() + " " + MONTHS[info.month],
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // large time
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 306, Graphics.FONT_NUMBER_HOT, timeText,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // heart rate, steps, battery
        drawStat(dc, 128, "HR", heartRateText(), RED);
        drawStat(dc, 208, "STEPS", stepsText(), GREY);
        drawStat(dc, 288, "BATT", batteryText(), GREEN);
    }

    private function drawStat(dc, x, label, value, colour) {
        dc.setColor(colour, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, 356, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(LIGHT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, 382, Graphics.FONT_TINY, value, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // Low power: few lit pixels, dim colours, position nudged every minute
    private function drawAlwaysOn(dc, clock, timeText, info) {
        var dx = (clock.min % 5) * 3 - 6;
        var dy = (clock.min % 3) * 3 - 3;
        var cx = dc.getWidth() / 2 + dx;
        dc.setColor(0x7A2219, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 150 + dy, Graphics.FONT_XTINY,
            DAYS[info.day_of_week] + " " + info.day.toString(),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(0x8A9098, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 220 + dy, Graphics.FONT_NUMBER_MEDIUM, timeText,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function formatTime(clock) {
        var hour = clock.hour;
        if (!System.getDeviceSettings().is24Hour) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        return hour.toString() + ":" + clock.min.format("%02d");
    }

    private function heartRateText() {
        var hr = null;
        var act = Activity.getActivityInfo();
        if (act != null && act.currentHeartRate != null) {
            hr = act.currentHeartRate;
        } else if (ActivityMonitor has :getHeartRateHistory) {
            var sample = ActivityMonitor.getHeartRateHistory(1, true).next();
            if (sample != null && sample.heartRate != ActivityMonitor.INVALID_HR_SAMPLE) {
                hr = sample.heartRate;
            }
        }
        return hr == null ? "--" : hr.toString();
    }

    private function stepsText() {
        var info = ActivityMonitor.getInfo();
        if (info == null || info.steps == null) {
            return "--";
        }
        var steps = info.steps;
        if (steps >= 1000) {
            return (steps / 1000).toString() + "," + (steps % 1000).format("%03d");
        }
        return steps.toString();
    }

    private function batteryText() {
        return System.getSystemStats().battery.toNumber().toString() + "%";
    }
}
