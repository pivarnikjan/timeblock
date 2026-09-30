# Installing the Android SDK (to build the phone app on this computer)

The [TimeBlock Android app](https://github.com/pivarnikjan/timeblock-mobile) is
normally built in Expo's cloud (EAS) — that needs none of this. Follow this
guide to build it **on your own computer** instead: no build queue, no Expo
account, and a debug build you can reinstall in a minute while working on it.

About 45 minutes the first time and ~5 GB of disk (the SDK, the NDK, Gradle's
caches).

> **This computer is Windows 11 on Arm.** Check with
> `$env:PROCESSOR_ARCHITECTURE` — `ARM64` here, `AMD64` on an Intel/AMD PC.
> Google does not ship Android Studio or the Android Emulator for Windows on
> Arm. Neither is needed: the SDK's command-line tools build the app, and it
> runs on your phone. The SDK's native programs (`adb`, `aapt2`, the NDK's
> compilers) are x64 programs, which Windows 11 runs through its built-in x64
> emulation — slower the first time, fine after. The Java parts run natively.
> Should a native build step fail on this machine, the EAS cloud build in the
> app's README remains the way to get an APK.
>
> **On an Intel/AMD PC** you can do steps 2–4 in [Android Studio](https://developer.android.com/studio)
> instead (*Standard* install, then **SDK Manager** → the packages of step 4),
> and use its emulator. Steps 1 and 5–7 are the same.

---

## Step 1 — Java 17

Android's build (Gradle with the Android Gradle Plugin 8.12, which React
Native 0.86 uses) needs a JDK — version 17. Microsoft's build has a native Arm
version; winget picks it on this machine:

```powershell
winget install --id Microsoft.OpenJDK.17 --source winget
```

Point `JAVA_HOME` at it (the build tools look for it there):

```powershell
$jdk = (Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-17*' | Sort-Object Name | Select-Object -Last 1).FullName
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk, 'User')
```

**Open a new terminal**, then check:

```powershell
java -version                                            # openjdk version "17.0.…" … Microsoft
java -XshowSettings:properties -version 2>&1 | Select-String 'os.arch'   # aarch64 on Arm, amd64 on Intel/AMD
$env:JAVA_HOME
```

## Step 2 — The SDK command-line tools

1. On <https://developer.android.com/studio#command-line-tools-only>, download
   **Command line tools only → Windows** (`commandlinetools-win-…_latest.zip`)
   and accept the terms.
2. Unpack it where Android Studio would put the SDK, as
   `…\Sdk\cmdline-tools\latest` — the folder layout `sdkmanager` insists on:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
Expand-Archive -Path "$HOME\Downloads\commandlinetools-win-*_latest.zip" -DestinationPath "$sdk\cmdline-tools"
Rename-Item "$sdk\cmdline-tools\cmdline-tools" latest
Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"   # True
```

## Step 3 — Environment variables

`ANDROID_HOME` tells the build where the SDK is; the two `Path` entries make
`adb` and `sdkmanager` commands:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
$path = [Environment]::GetEnvironmentVariable('Path', 'User')
[Environment]::SetEnvironmentVariable('Path', "$path;$sdk\platform-tools;$sdk\cmdline-tools\latest\bin", 'User')
```

**Open a new terminal** and check: `$env:ANDROID_HOME` prints the folder, and
`sdkmanager --version` prints a version.

## Step 4 — SDK packages

Accept Google's licences (answer `y` to each), then install what the app's
build uses:

```powershell
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
```

| Package | Why |
| --- | --- |
| `platform-tools` | `adb`: talks to the phone |
| `platforms;android-36` | The Android version the app compiles against (Android 16) |
| `build-tools;36.0.0` | Packs and signs the APK |
| `ndk;27.1.12297006`, `cmake;3.22.1` | Compile the native parts (React Native, SQLite) |

These versions come from React Native's build settings,
`node_modules/react-native/gradle/libs.versions.toml` in the app (`compileSdk`,
`buildTools`, `ndkVersion`) — look there after an Expo SDK upgrade. Since the
licences are accepted, the build also downloads anything missing by itself.

Check: `adb --version`, and `sdkmanager --list_installed` lists the five.

## Step 5 — Connect the phone

On the phone:

1. **Settings → About phone** → tap **Build number** seven times ("You are now
   a developer"). On Samsung it is under **Software information**.
2. **Settings → System → Developer options** → turn on **USB debugging**.

**Over Wi-Fi (recommended on this computer — no USB driver needed).** Phone and
computer on the same network; Android 11 or newer:

1. **Developer options → Wireless debugging** → on → **Pair device with pairing
   code**. It shows an address like `192.168.1.23:37123` and a six-digit code.
2. On the computer: `adb pair 192.168.1.23:37123`, enter the code.
3. Back on the **Wireless debugging** screen, note the *IP address & Port* (a
   different port) and run `adb connect 192.168.1.23:41567`.

**Over USB.** Plug it in, choose *File transfer* if the phone asks, and allow
the *Allow USB debugging?* prompt (tick *Always allow from this computer*).
Some phones need their maker's USB driver on Windows (Samsung: *Samsung Android
USB Driver*); on Windows on Arm such a driver may not exist — use Wi-Fi then.

Check: `adb devices` lists the phone as `device`. (`unauthorized` = accept the
prompt on the phone; nothing listed = cable, USB mode or driver.)

## Step 6 — Build TimeBlock and install it

In the app's folder (see its README for cloning with the submodule and
`npm install`):

```powershell
npx expo run:android
```

The first run generates the native project (`android\`, not committed),
compiles everything — **much longer the first time, especially on Arm** — and
installs a *debug* build on the phone, which loads its JavaScript from the dev
server this command starts. Later, JavaScript changes need only `npx expo
start` and a reload; run `npx expo run:android` again after adding a package
with native code.

For a build that runs on its own (JavaScript inside, no dev server), for
everyday use:

```powershell
npx expo run:android --variant release
```

## Step 7 — Let Google sign-in accept this build

Builds made on this computer are signed with the project's **debug keystore**
(`android\app\debug.keystore`), not EAS's, so Google needs its certificate too.
Read its SHA-1:

```powershell
cd android
.\gradlew signingReport
cd ..
```

Under *Variant: debug* (and *release*, same keystore), copy the **SHA1** line.
In <https://console.cloud.google.com/>, in the **same project as the desktop**:
**Google Auth platform → Clients → Create client → Android**, package name
`com.pivarnikjan.timeblock`, that SHA-1, **Create**. It can sit next to the
client for the EAS builds — one Android client per signing certificate. If
`android\` is ever regenerated (deleted, or `npx expo prebuild --clean`), run
`signingReport` again: a different SHA-1 needs registering too.

The debug keystore is a well-known one, meant for your own devices; share only
builds signed with a release key (EAS makes and keeps one for you).

---

## Troubleshooting

| What you see | Why | Do this |
| --- | --- | --- |
| `The term 'sdkmanager' / 'adb' is not recognized…` | The terminal was open before step 3. | Open a new terminal; check `$env:Path` holds the two SDK folders. |
| `JAVA_HOME is not set` / `Unsupported class file major version` | Gradle found no Java, or a different one. | Step 1: `java -version` must say 17 and `$env:JAVA_HOME` must point at that JDK. |
| `SDK location not found` | `ANDROID_HOME` missing in this terminal. | Step 3, new terminal. (Or put `sdk.dir=C\:\\Users\\…\\Android\\Sdk` in `android\local.properties`.) |
| `Failed to install the following Android SDK packages as some licences have not been accepted` | Step 4's first line was skipped. | `sdkmanager --licenses`. |
| A CMake / ninja error mentioning a path of 250+ characters | Windows' 260-character path limit; the native build nests folders deeply. | Clone the app to a short path such as `C:\dev\timeblock-mobile`. Also allow long paths (admin PowerShell): `New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`, and `git config --global core.longpaths true`. |
| `adb devices` shows nothing | Cable (charge-only), USB mode, or no driver. | Try another cable and *File transfer* mode — or use Wi-Fi (step 5). |
| Sign-in on the phone fails with `DEVELOPER_ERROR` (code 10) | This build's certificate is not registered. | Step 7 — the SHA-1 of the keystore that signed *this* build. |
| The build fails in a native step on Windows on Arm | An x64 tool did not run under emulation. | Use the EAS cloud build (app README); please note the failing step. |

## Removing it

Delete `%LOCALAPPDATA%\Android\Sdk` and `%USERPROFILE%\.gradle` (Gradle's
caches), remove `ANDROID_HOME` and the two `Path` entries (**Settings → System
→ About → Advanced system settings → Environment Variables**), and
`winget uninstall --id Microsoft.OpenJDK.17`.
