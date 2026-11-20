# Publishing Mini Pucks

## Done
- The game, the server, accounts, online play, and a privacy page at `/privacy.html`.
- Play as a guest, and account deletion inside the game (Settings → Delete Account).
- The Android app, built from `app/`: the newest `.aab` is in `Desktop\Mini Pucks - Play Store`.
- The store listing words: `app/store-listing.md`.

## Not done
1. A GitHub repo (`mini-pucks`) and a Render web service (`mini-pucks.onrender.com`) for the live
   server. The app talks to that address, so it needs to be live before anyone plays online.
2. A Google Play app for it: in the Play Console, **Create app** → "Mini Pucks". It is a separate
   app from Mini Strikers and Mini Dunkers, under the same developer account.
3. Store pictures (the feature graphic and screenshots).
4. The iPhone app (needs a Mac with Xcode).
5. Coin packs are off (no store products for this app).

## The signing key
The `.aab` is signed with the same *upload key* as Mini Strikers and Mini Dunkers, kept in
`C:\Users\NoahL\AndroidBuild\signing\` (outside OneDrive, never committed). Google allows one upload
key for several apps; Play App Signing gives each app its own app-signing key. Back that folder up.

## Building the Android file again
1. Raise `versionCode` (and `versionName`) in `app/version.json`.
2. `powershell -ExecutionPolicy Bypass -File app\build-android.ps1`
3. The new file appears in `Desktop\Mini Pucks - Play Store`.

It builds in `C:\Users\NoahL\AndroidBuild\work-pucks`, its own folder: Mini Strikers builds in
`work` and Mini Dunkers in `work-dunkers`, so the Android projects never mix. The app id
`com.irizarrygames.minipucks` cannot be changed after the first upload.

## Steps, in order
1. Upload the `.aab` to a Closed testing track (a new app on a personal account needs 12 testers for
   14 days before production), then apply for production access.
2. Listing: `app/store-listing.md`. Fill in the age-rating questionnaire and the Data safety form
   (answers are in the listing file).
3. A reviewer account: make a demo account on the live game and put it in the review notes.
