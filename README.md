# tbye-sdp-datetime
Plugin for the Elgato StreamDeck Family of Devices.  Display date, time, and segments of dates and times.

<img src="/src/com.tbye.datetime.sdPlugin/actions/template/assets/preview.png" width="600">

### Supported OSes
- Windows 11
- macOS 14 (Sonoma)
- Others may be supported.  These have been tested. YMMV


### Releases

Version **1.1.0** now available: [Download](https://github.com/tbye/tbye-sdp-datetime/releases/download/1.1.0/com.tbye.datetime.streamDeckPlugin). Previous: [1.0.2](https://github.com/tbye/tbye-sdp-datetime/releases/download/1.0.2/com.tbye.datetime.streamDeckPlugin).

Release Notes:
1.1.0
- Shared wall-clock tick so multi-tile clocks stay in sync (#16)
- Region date/hour formats + D.M.YYYY / DD.MM.YYYY (#14, PR #15)
- ISO 8601 week number (#4, #13)
- Day name / abbreviation (#11)
- Language selection for localized day/month names (#7)
- Copy current value to clipboard on key press; multi-action friendly (#5)
- Date (No Year) fixed for non-US locales (#6)
- Time without seconds fixed for 24h / non-US locales (#10, #12)
- Default title font size raised to 16 (#8)
- Linux-friendly release packaging (`scripts/build-release.sh`)

1.0.2
- Fixed issue #2.  Thanks T. J.

### Building a release (Linux-friendly)

See **[RELEASE.md](RELEASE.md)** for the full packaging, GitHub release, and Elgato Marketplace workflow.

```bash
npm install -g @elgato/cli@latest
git submodule update --init --recursive
./scripts/build-release.sh          # → dist/com.tbye.datetime.streamDeckPlugin
```

### Installation

1. Download plugin to the mac or windows pc where your StreamDeck app is installed.
1. Double click the downloaded file.
1. Find Tbye.com in your category list.
1. Expand it to find DateTime.
1. Drag DateTime to an available button.
1. Click the button to show the Property Inspector.
1. Choose the segments you'd like to display on the button.
1. Optionally set **Date Format**, **Hour Format**, and **Language** (system default or a specific language for day/month names and locale-style date/time).
1. Use the Title formatting styles to style the date segment.
1. **Press the key** to copy the current displayed value to the system clipboard (works in multi-actions too — copy here, then paste in a later step).


### Issues, Support and Feedback Welcome!

Please create an [issue](https://github.com/tbye/tbye-sdp-datetime/issues/new) if there's anything I can help you with.


### Contributors

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for full attribution. Thank you to everyone who has improved this plugin!


### Thanks

This project is inspired by [streamdeck-myip](https://github.com/Nuagic/streamdeck-myip)
