# VoxRider release lanes (local fastlane)

Local, key-file-auth releases for both stores — no CI, no GitHub secrets. Run from the repo root.

## One-time setup
1. `cp fastlane/.env.example fastlane/.env` and fill in the paths (the `.env` is gitignored).
2. **iOS** — needs the `Apple Distribution: Naveen Gowda (WKVSGRCJD9)` cert in your login keychain
   (already present) and the ASC API key `.p8` at `ASC_KEY_FILEPATH`.
3. **Android** — needs:
   - the release keystore at `android/app/voxrider-release.keystore` + `android/keystore.properties`
     (see CLAUDE.md / play-store notes), and
   - a Google Play **service-account JSON** at `PLAY_JSON_KEY_FILEPATH`
     (Google Cloud → service account → JSON key; Play Console → Users & permissions → grant app access).

## Usage
```bash
fastlane ios_release       # archive (distribution) → TestFlight  (does NOT submit for App Store review)
fastlane android_release   # signed AAB → Play "internal" track as a DRAFT (does NOT release to testers)
```

Both lanes are deliberately gated: iOS stops at TestFlight, Android stops at an internal draft.
Promote to public review / production yourself in App Store Connect / Play Console.

## Notes
- **Bump versions before releasing** (otherwise the store rejects a duplicate). iOS:
  `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` in `ios/VoxRider.xcodeproj/project.pbxproj`;
  Android: `versionCode` / `versionName` in `android/app/build.gradle`.
- `android_release` aborts if the keystore is missing **or** the AAB comes out debug-signed —
  so it can never silently upload an unsigned build to Play.
- Back up all three credentials (keystore + passwords, ASC `.p8`, Play JSON) in your password manager.
