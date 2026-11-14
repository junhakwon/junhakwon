# Pull-Up watch face (Forerunner 265)

1. Convert `resources/animations/pullup-240.mp4` with Monkey Motion (Connect IQ SDK) to `resources/animations/pullup.mm`, target device Forerunner 265.
2. Open this folder in VS Code (Monkey C extension installed).
3. Ctrl+Shift+P → "Monkey C: Run" → fr265 to test in the simulator, or "Monkey C: Build for Device" → fr265 to make the .prg.
4. Copy the .prg to the watch's GARMIN\APPS folder over USB, then choose the face on the watch.
