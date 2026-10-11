<img src="docs/logo.png" alt="" width="72" align="left">

# FamilyDesk

The family's day, at a glance by the front door.
<br clear="left">

**English** · [Português](README.pt.md)

That iPad 2 that has spent the last three years as a very expensive paperweight in the kitchen drawer? It has a job again — and this time it shows up on time, every day.

FamilyDesk is a wall dashboard for an old **iPad** (yes, even an iPad 2 stuck on iOS 9) hanging by the front door. It shows:

- clock, date, quote of the day and the current weather (with sunrise and sunset);
- a strip with the next few hours and the next 6 days; the expanded view adds UV, wind and gusts, air quality, pollen and 7 detailed days; IPMA weather warnings and hints such as "take an umbrella" only appear when they matter;
- **one agenda for the next 30 days**: calendars (iPhone, optionally Outlook), the kids' events, birthdays and household deadlines, with scrolling;
- each kid's activities for the week, one line per activity, with the days and what to bring; school today and tomorrow;
- a **"🎒 Don't forget"** block: everything that goes in each kid's backpack (after 6 pm it switches to tomorrow);
- family photos, live traffic to today's destinations and the next school dates;
- automatic public holidays and school breaks: activities pause on those days;
- a finances panel, hidden by default;
- a night mode with random family photos.

Everything is managed from a web page (`/gerir`) and published as a **calendar you can subscribe to on your iPhone**.

**Project page:** [fmrgcarvalho.github.io/familydesk](https://fmrgcarvalho.github.io/familydesk/) ([in Portuguese](https://fmrgcarvalho.github.io/familydesk/pt/)).

![Dashboard](docs/dashboard-ipad.png)

| Finances (tap 💶) | Management page |
|---|---|
| ![Finances](docs/dashboard-financas.png) | ![Manage](docs/gerir.png) |

## Language

The interface is available in **English** and **Portuguese**. Set `"idioma"` in `config.json`:

```json
"idioma": "en"
```

`"en"` (the default) or `"pt"`. It switches everything: the iPad dashboard, the iPhone page, the `/gerir` management page, server messages and the subscribed calendar. Restart the server after changing it.

The configuration keys, the file names and the `/gerir` URL are in Portuguese (the project started life in a Portuguese hallway). Each key is explained in English in the [configuration table](#configuration-configjson).

## How it works

```
 Outlook (ICS) ─┐                                          ┌──> iPad (dashboard)
 iCloud (ICS) ──┤                                          │
 Open-Meteo ────┼──>  server.js (PC / Raspberry Pi)  ──────┼──> PC / iPhone: /gerir (edit)
 IPMA warnings ─┘      + data/familia.json                 │
                                                           └──> iPhone: /familia.ics (subscribed calendar)
```

The iPad 2 is stuck on iOS 9.3.5. Its Safari has no `fetch`, no CSS Grid, and no longer trusts many current HTTPS certificates. So:

- the **server** fetches everything and hands it to the iPad in a single HTTP request (`/api/dashboard`);
- the **iPad page** (`public/index.html` and `app.js`) is written in ES5 and uses flexbox only;
- the **management page** (`public/gerir.html`) uses modern JavaScript, because you open it on a PC or an iPhone.

The server must stay on, on your home network. It can be your PC, a Raspberry Pi or a NAS with Node.js.

## Install

You need [Node.js 18 or later](https://nodejs.org).

```bash
git clone https://github.com/fmrgcarvalho/familydesk.git
cd familydesk
npm install
cp config.example.json config.json
npm start
```

The terminal shows the addresses:

```
  iPad:    http://192.168.1.50:3000
  Gerir:   http://localhost:3000/gerir
```

To see the agenda filled with sample appointments: `DEMO=1 npm start` (PowerShell: `$env:DEMO=1; npm start`).

## Opening it on the iPhone and iPad (home network)

The server accepts connections from any device on the same Wi-Fi.

1. On the PC, run `npm start`. The terminal shows the address, for example `http://192.168.1.50:3000`.
2. On the iPhone or iPad, on the home Wi-Fi, open `http://192.168.1.50:3000` in Safari. Type `http://`, not `https://`.
   - The **iPhone** gets the phone version (`/iphone`) automatically.
   - The **iPad** gets the full-screen dashboard.
   - To manage everything: `/gerir`.
3. To make it feel like an app: Share → **Add to Home Screen**. It gets a "Home" icon and opens full screen.

### iPhone version

<img src="docs/iphone.png" width="300" align="right" alt="iPhone version">

- The same information as the iPad, in one scrolling column: current weather, the next hours, 5 days with temperature bars, countdowns, warnings, agenda, activities and birthdays.
- Follows the iPhone's **light or dark mode**.
- The bottom bar has Summary, Manage, Calendar and Refresh. Data refreshes when you come back to the app and every 5 minutes.
- **Finances** stay blurred until you tap "Show", and hide again after 60 seconds or when you leave the app.
- To see the iPad version on the phone, use `/#ipad`.

<br clear="right">

**If it doesn't open**, it is almost always the Windows firewall. Run this once in PowerShell **as administrator**:

```powershell
New-NetFirewallRule -DisplayName "FamilyDesk" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Public
```

**To keep it working:**
- **Fixed IP:** create a *DHCP reservation* for the PC in your router. If the IP changes, the links on the iPhone and iPad stop working.
- **No sleep:** Settings → System → Power → Sleep: *Never* (at least when plugged in).
- **Start automatically:** create a Windows Task Scheduler task that runs `arrancar.cmd` at logon. `arrancar.cmd` restarts the server 5 seconds after it stops, so to restart it by hand just end `node.exe` in Task Manager and it comes back on its own. You can also move the server to a Raspberry Pi.

## Managing the family — `/gerir`

| Tab | What's in it |
|---|---|
| Appointments and events | Doctor 🩺, school 🏫 and other events 🎈 with date, time and place. They show up in the dashboard agenda in each kid's colour. |
| Weekly activities | Swimming, football, etc., with the weekday, time and what to bring 🎒 |
| Birthdays | Each kid's classmates. With a birth year, it shows the age they're turning. |
| Kids | Name, colour and school level. Renaming a kid updates every entry. |
| 💶 Accounts / 💸 Payments | Balances and monthly payments such as rent, school fees or electricity |
| 📅 School and holidays | School calendar, last day of classes per level and upcoming holidays |
| 🌙 Night mode | Photo folder status and preview |
| 📱 iPhone calendar | Links to subscribe |

Data is stored in `data/familia.json`. If the file doesn't exist, it is created on the first save. To protect changes with a PIN, fill in `pinGestao` in `config.json`.

## iPhone calendar

The server publishes `http://<ip>:3000/familia.ics`, or `familia.ics?quem=Maria` for a single kid, with:

- weekly activities as recurring events;
- appointments and events, with an alert the day before for doctor appointments;
- birthdays as yearly events;
- public holidays and school breaks.

On the iPhone, open `/gerir` → **iPhone calendar** → **Subscribe**. Or: Settings → Calendar → Accounts → Add Account → Other → *Add Subscribed Calendar*. Pick the iCloud account so the calendar appears on all your devices. Repeat on each family member's iPhone.

> ⚠️ The link only works inside your home network. Away from home, the iPhone keeps showing what it already had and updates when you get back. To make it work anywhere, expose the server with [Tailscale](https://tailscale.com) (private, recommended) or a Cloudflare Tunnel.

## Public holidays and school breaks

The holidays and school calendars are Portugal's (mainland). Other countries are welcome as contributions.

- **National holidays** are calculated automatically, including Easter, Good Friday and Corpus Christi. Your **municipal holiday** goes in `feriadoMunicipal` in `config.json`, either with a fixed date (`"06-13"`) or relative to Easter (`"pascoa+39"` for Ascension Thursday).
- **School calendar per kid.** In `/gerir` → Kids, choose each kid's calendar:
  - **National**, in `data/calendario-escolar.json`;
  - the **school cluster's** own calendar, for schools with semesters, assessment breaks or a different Christmas break. It lives in `data/calendario-escolar.local.json`, which is not pushed to GitHub because it gives away the school;
  - **Nursery**: holidays only, because nurseries don't close for school breaks.
- The **national calendar** for mainland Portugal is in `data/calendario-escolar.json`. 2026/27 is already filled in. Add the next year when the official dispatch comes out, usually in June or July.
- In `/gerir` → Kids, set each kid's **school level**. The last day of classes varies: years 9, 11 and 12 finish on 4 June, years 5 to 8 and 10 on 11 June, and pre-school and years 1 to 4 on 30 June.
- Activities with **"Pause during breaks and holidays"** (on by default) disappear from the dashboard on those days and become exceptions in the iPhone calendar. Turn it off for activities that carry on during breaks, like swimming at the club.
- The dashboard shows the **next 3 dates** on one line at the bottom of the right column: "All Saints' Day in 21 days · Christmas break in 66 days…". The iPhone keeps the full countdowns, including family birthdays.
- The agenda and the iPhone calendar show holidays 🇵🇹 and school breaks 🎄🎭🐣.

![School and holidays](docs/gerir-escola.png)

## Class timetables

In `/gerir` → 🕘 Timetables there is a grid per kid: periods (class, after-school activity, break, lunch) × Monday to Friday, plus "what to bring" per subject (e.g. PE → judo kit).

- **Dashboard (Today and Tomorrow):** "🏫 School until 15:30 · after-school sport until 17:15 · 🎒 judo kit".
- **iPhone:** a card with the full timetable for the day and the current class highlighted. If there's no school today, it shows the next school day.
- On holidays and breaks, following each kid's school calendar, school doesn't appear.

## Household deadlines

Car tax, MOT, insurance, car service, ID card, passport, dentist, tax return… In `/gerir` → 📋 Deadlines there are **one-tap templates**: pick one and just add the date.

- Each deadline has a date, a repeat (monthly, every 6 months, yearly, every 2, 5 or 10 years) and how many days ahead it shows up (30 by default).
- **iPad:** in the agenda, on the right day, once it's 30 days away or less (orange in the last 7). Overdue ones appear in red at the top of the agenda, under "Overdue".
- **iPhone:** a 📋 Deadlines card with **✓ Done**. If it repeats, it moves to the next date; if not, it's archived.
- **iPhone calendar:** deadlines become events with an alert at the chosen lead time and on the day before.

## Traffic

Travel time from **home** to each destination, updated every 5 minutes between 06:00 and 23:00 (configurable).

- **iPad:** a list at the bottom of the right column, one destination per line. Green means normal, orange heavy traffic (10–30% above normal) and red a jam (over 30%), with "+N" minutes of delay. The main screen shows today's destinations (each destination's "Show" option: always, weekdays or weekends); the expanded view shows them all, with km and normal time.
- **iPhone:** a card with distance, arrival time and delay. Tapping a destination opens Google Maps with the route.
- **`/gerir` → 🚗 Traffic:** paste the Google Maps link for home and for each destination. Short links (`maps.app.goo.gl`) work too.

**Live traffic (free):** create an account at [developer.tomtom.com](https://developer.tomtom.com), copy the *API Key* and paste it into `transito.tomtomChave` in `config.json`. The free plan gives 2,500 requests a day; 6 destinations every 5 minutes use about 1,700. Without a key, times come from OSRM and **don't include traffic**.

| `config.json` → `transito` (traffic) | |
|---|---|
| `tomtomChave` | TomTom API key |
| `intervaloMinutos` | refresh interval in minutes (5) |
| `horaInicio` / `horaFim` | start / end of the hours when it refreshes (outside them the last value stays) |

## Photos on screen

In the right column, between the activities and the traffic, photos from a folder **change every 10 seconds** (configurable). The photo fills the remaining space. Portrait photos are shown whole, with a dark background on the sides; landscape ones fill the frame. Tap a photo to see it full screen. While finances are open, the photo hides.

```json
"agendaFotos": { "pasta": "C:\\Photos\\Dashboard", "intervaloSegundos": 10 }
```

`pasta` is the folder, `intervaloSegundos` the seconds per photo. It accepts JPG, PNG, WEBP and **HEIC** (iPhone photos, converted automatically). The server shrinks each photo to 1024 px and caches it. Just add or remove photos in the folder — the list is re-read every 30 minutes. The folder can be one synced by Google Drive for desktop.

## Night mode with photos

Between 22:00 and 07:00 (configurable), instead of just dimming, the iPad shows **random family photos** with the clock in the corner. Tapping the screen shows the dashboard for 2 minutes. The server shrinks each photo to 1024 px before sending it, because the iPad 2 has very little memory, and keeps them in `cache/fotos`.

There are two ways to get the photos from a Google Drive folder.

**A) Google Drive for desktop (simplest).** Install [Google Drive for desktop](https://www.google.com/drive/download/) on the server PC and point to the synced folder:

```json
"modoNoite": { "inicio": "22:00", "fim": "07:00", "intervaloSegundos": 60,
  "fotos": { "pasta": "G:\\My Drive\\Dashboard photos" } }
```

It reads JPG, PNG and WEBP, up to 3 levels of subfolders. iPhone HEIC photos are not read this way. Export them as JPG, or on the iPhone set Settings → Camera → Formats → *Most Compatible*.

**B) Straight from Google Drive (the folder stays private).**
1. At [console.cloud.google.com](https://console.cloud.google.com): create a project → *APIs & Services* → enable the **Google Drive API**.
2. *Credentials* → **Create service account** → *Keys* → Add key → JSON. Save the file as `google-service-account.json` in the project folder. It is already in `.gitignore`.
3. In Google Drive, **share the photo folder** with the service account's e-mail (`…@….iam.gserviceaccount.com`) as Viewer.
4. Copy the folder ID, the last part of the URL `drive.google.com/drive/folders/<ID>`:

```json
"fotos": { "googleDrive": { "pastaId": "<ID>", "contaServico": "google-service-account.json" } }
```

This way also shows HEIC photos, through Drive's thumbnails. To check everything works, open `/gerir` → 🌙 Night mode (it shows how many photos it found) or preview at `http://<ip>:3000/#noite`.

## Finances

- Turn it on or off in `/gerir` → 💶 Accounts → "Show the finances panel on the dashboard". When it's off, the numbers are not even sent to the iPad.
- When it's on, a discreet 💶 appears in the bottom-left corner of the iPad. Tap it and balances and upcoming payments appear for 60 seconds, then hide on their own.
- Balances are updated by hand. Connecting straight to a bank needs a PSD2 aggregator, because Portuguese banks don't offer direct access.

## Configuration (`config.json`)

The keys are in Portuguese; the second column says what each one means.

| Key | Meaning | What it does |
|---|---|---|
| `idioma` | language | `"en"` (default) or `"pt"`. Switches the whole interface and the subscribed calendar. |
| `porta` | port | HTTP port (3000) |
| `local` | location | Name and coordinates (`nome`, `latitude`, `longitude`) for the weather |
| `ipmaArea` | IPMA area | District for IPMA weather warnings (`LSB` Lisbon, `PTO` Porto, `STB` Setúbal, `FAR` Faro, `CBR` Coimbra, `BRG` Braga, …). Empty turns warnings off. |
| `fusoHorario` | time zone | `Europe/Lisbon` by default |
| `diasAniversarios` | birthday days | Classmates' birthdays in the next N days (30) |
| `diasAgenda` | agenda days | Days shown in the agenda (30) |
| `diasContagemFamilia` | family countdown days | On the iPhone, countdown to family birthdays starting N days before (120; always for the kids) |
| `ecra` | screen | Screen fine-tuning, all optional: `atualizarMinutos` refresh minutes (2), `recarregarHoras` full reload hours (6), `fecharPainelSegundos` close expanded panel after seconds (60), `fecharFotoMinutos` close full-screen photo after minutes (10), `fecharMenuSegundos` hide menu after seconds (20), `financasSegundos` show finances for seconds (60), `acordadoNoiteMinutos` stay awake at night after a tap, minutes (2), `mochilaAmanhaAPartirDas` switch "Don't forget" to tomorrow from this hour (18), `datasEscolaMax` max school dates shown (3) |
| `pinGestao` | management PIN | PIN to save changes in `/gerir` (asked once and remembered in that browser) |
| `feriadoMunicipal` | municipal holiday | `{ "nome": "Santo António", "data": "06-13" }`. In Porto, for example, it would be `06-24`. |
| `calendarios` | calendars | List of `{ nome, cor, url }` (name, colour, ICS link) |
| `modoNoite` | night mode | Hours (`inicio`/`fim`), seconds per photo and photo source (see above) |
| `agendaFotos` | dashboard photos | Photo folder and seconds per photo (see above) |
| `transito` | traffic | TomTom key and refresh hours (see above) |

`config.json` and `data/familia.json` are in `.gitignore`, because they hold private links, names and amounts.

### Outlook ICS link

Outlook on the web: Settings ⚙️ → Calendar → Shared calendars → *Publish a calendar* → "Can view all details" → Publish → copy the **ICS** link. If it's a work account and the option isn't there, your administrator has blocked publishing.

### iPhone calendar link (iCloud)

Calendar app → **Calendars** → ⓘ next to the calendar → turn on **Public Calendar** → copy the `webcal://` link and paste it as is. Anyone with the link can see the calendar, so don't share it.

## Setting up the iPad

1. In Safari, open `http://<server-ip>:3000` → Share → **Add to Home Screen**.
2. Settings → Display & Brightness → **Auto-Lock: Never**.
3. Settings → General → Accessibility → **Guided Access** to lock the iPad into the app.
4. Give the server a fixed IP in your router.

**Menu bar (iPad):** hidden to save space. The **☰** button in the bottom-left corner shows it; it hides again 20 seconds after the last tap. Buttons: 📅 Agenda · 🎒 Activities · ⛅️ Weather · 🚗 Traffic · 📷 Photos (full screen) · 💶 Finances (if enabled) · ✏️ Manage (hidden on the iPad 2's Safari, which can't open `/gerir`) · 🔄 Refresh.

**Quote of the day:** between the clock and the weather there's a new inspirational quote every day, from [ZenQuotes](https://zenquotes.io); in Portuguese it is translated with MyMemory. Both are free. It's fetched once a day. If the APIs fail, a built-in list of quotes is used.

**Expanding panels:** tap a panel (agenda, activities, traffic, finances or the weather strip) to open it full screen, with bigger text, all the content and more detail. Tap again to go back. If nobody touches it, it closes after 60 seconds. To preview on the PC: `/#expandir=painel-transito`.

The page refreshes its data every 2 minutes and reloads itself when the server restarts or when the page files (`index.html`, `app.js`, `comum.js`, `style.css`) change. It also reloads every 6 hours, just in case. At night it shows family photos or, if none are configured, simply dims.

## Licence

[MIT](LICENSE): you can use, change and share it freely, as long as you keep the copyright notice.
