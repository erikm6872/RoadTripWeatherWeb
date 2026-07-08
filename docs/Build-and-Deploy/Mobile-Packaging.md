---
tags: [build, mobile]
---

# Mobile Packaging

Two independent ways to get the app onto a phone, for each of Android and
iOS. Documented in full in `MOBILE.md` at the repo root; this page
summarizes the mechanics.

## Path 1 — Install as a PWA (no build tools)

Works because of [[PWA-and-Service-Worker]]. Requires the `www/` bundle
hosted over **HTTPS** (browsers only offer PWA installation over HTTPS or
localhost):

- **Android**: open the hosted URL in Chrome → menu → *Add to Home screen*
  → *Install*. Launches fullscreen, shell works offline.
- **iOS**: must use **Safari** specifically (other iOS browsers can't
  install PWAs) → Share → *Add to Home Screen*. No install *banner* like
  Chrome offers — the user has to know to look in the Share sheet. iOS may
  also evict the service worker's cache after weeks of disuse — see
  [[Limitations-and-Risks]].

## Path 2 — Native build via Capacitor

`capacitor.config.json`:
```json
{
  "appId": "com.roadtripweather.app",
  "appName": "Road Trip Weather",
  "webDir": "www",
  "android": { "allowMixedContent": false },
  "server": { "androidScheme": "https" }
}
```

Capacitor wraps the `www/` bundle (see [[Build-Pipeline]]) in a native
WebView shell. `package.json` scripts:

| Script | Does |
|---|---|
| `npm run android:add` | `build_www.py` + `npx cap add android` — one-time project creation |
| `npm run android:sync` | rebuild `www/` + `npx cap sync android` — after any code change |
| `npm run android:open` | opens the generated project in Android Studio |
| `npm run android:run` | sync + `npx cap run android` — deploy straight to a USB-debugging device |
| `ios:add` / `ios:sync` / `ios:open` / `ios:run` | same, for Xcode — **requires a Mac** |

- **Android**: needs Node.js + Android Studio (any OS). Build → Build
  APK(s) for a sideloadable debug APK, or Generate Signed App Bundle for
  the Play Store.
- **iOS**: needs a Mac with Xcode (Apple's toolchain doesn't run on
  Windows/Linux). Free Apple ID installs to your own device for 7 days at a
  time; a paid Apple Developer account is needed for TestFlight/App Store.

**Before publishing**: change `appId` in `capacitor.config.json` away from
the placeholder `com.roadtripweather.app` if that's not the real bundle ID
you want to ship under — app store bundle IDs can't be changed later.

## Which path should you use?

PWA install is zero-setup and enough for personal use or quick sharing.
Capacitor is only needed for app-store distribution, deeper native
integration, or an icon that behaves exactly like a "real" installed app on
platforms where PWA install UX is weak (notably iOS's hidden Share-sheet
flow).

Regardless of path, both consume the free public APIs in
[[Data-Sources-Overview]] directly from the device — there's no backend
between the installed app and Nominatim/OSRM/Open-Meteo, so
[[Limitations-and-Risks]] (rate limits, demo-server caveats) apply exactly
the same to an installed app as to the website.
