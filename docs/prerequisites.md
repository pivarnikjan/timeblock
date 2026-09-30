# Prerequisites

Everything needed to run and work on TimeBlock on a new Windows computer. The
app itself is plain Node.js; the start, stop and autostart scripts are
Windows PowerShell.

| Tool | Why | Install | Check |
| --- | --- | --- | --- |
| **Node.js 24 LTS or newer** (tested on 26) | Runs the app; the database is Node's built-in `node:sqlite` | `winget install --id OpenJS.NodeJS.LTS --source winget` | `node -v` |
| **Git** | Get the code, commit | `winget install --id Git.Git --source winget` | `git --version` |
| **GitHub SSH key** | Clone and push `git@github.com:…` | see [GitHub over SSH](#github-over-ssh) | `ssh -T git@github.com` |
| **GitHub CLI** (optional) | Open pull requests from the terminal | `winget install --id GitHub.cli --source winget` | `gh --version` |
| **Google account + Cloud project** | Calendar access | [`google-calendar-setup.md`](google-calendar-setup.md) | **Settings** shows *Connected* |
| **Android SDK** (optional) | Build the phone app on this computer instead of in Expo's cloud | [`android-sdk.md`](android-sdk.md) | `adb --version` |

## Installing with winget

- **Always add `--source winget`.** Without it winget also searches the
  Microsoft Store, and on a machine whose HTTPS traffic is inspected — an
  antivirus with HTTPS scanning (e.g. Avast Web Shield) or a company proxy —
  that fails with `Failed when searching source: msstore … 0x8a15005e : The
  server certificate did not match any of the expected values`. None of these
  tools come from the Store.
- **If winget still fails with a certificate error**, download the installer
  from the vendor instead: [nodejs.org](https://nodejs.org) (LTS),
  [git-scm.com](https://git-scm.com/download/win),
  [cli.github.com](https://cli.github.com) (`gh_*_windows_amd64.msi`).
- **Open a new terminal after installing.** A terminal that was already open
  does not see the new program, so it answers `The term 'gh' is not recognized
  as the name of a cmdlet…`. If a new terminal still does not find it, call it
  by its full path, e.g. `& "C:\Program Files\GitHub CLI\gh.exe" auth login`.

## GitHub over SSH

Once per computer:

```powershell
ssh-keygen -t ed25519 -C "you@example.com"   # accept the default file; a passphrase is recommended
Get-Content $HOME\.ssh\id_ed25519.pub | Set-Clipboard
```

Paste the key into GitHub → **Settings → SSH and GPG keys → New SSH key**, then
check with `ssh -T git@github.com` (answer *yes* the first time; it greets you
by username).

Set your commit identity for this repository. GitHub's no-reply address keeps
your personal email out of the public history (find it under GitHub →
**Settings → Emails**):

```powershell
git config user.name "your-github-username"
git config user.email "ID+your-github-username@users.noreply.github.com"
```

## GitHub CLI (for pull requests)

After installing, in a **new** terminal:

```powershell
gh auth login   # GitHub.com → SSH → your key → Login with a web browser
gh auth status
```

Without `gh`, open a pull request from the branch's page on GitHub instead.
