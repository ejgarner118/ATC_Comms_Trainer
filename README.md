# ATC Comms Trainer

A browser trainer for one Class D departure and one straight-in arrival at KSLE, McNary Field. The controller speaks from a script. It does not invent clearances.

Departure starts on the GA apron with Ground on 121.9. Listen to ATIS on 124.55 first: Step moves the standby frequency, and Swap tunes it. The broadcast repeats until you swap away. A complete taxi call receives runway 31 via Charlie, cross runway 34, via Foxtrot, hold short of runway 31. Read back the crossing and the hold short, and the airplane taxis. Swap to Tower, call ready, read back the takeoff clearance, and the airplane lines up and rolls. Tower then approves a frequency change.

Arrive starts on a straight-in to runway 31. Call Salem Tower, read back the landing clearance, and taxi back to the GA apron via Foxtrot, across runway 34, and Charlie. Reading a landing clearance back as cleared for takeoff is a critical miss, and the airplane stays on the approach.

The Line up and wait checkbox is on the departure lesson only. It is off unless you turn it on. Reading that clearance back as cleared for takeoff is a critical miss, and it stays on the card.

The lesson card lists how each required call went, and it appears when the hop is done. Reset flies the selected lesson again.

The typed box works in any browser. Chrome or Edge can use the microphone. On the published site, the microphone uses the browser’s speech recognition and the controller uses the browser voice. Locally, `npm run speak` uses the radio voice and the faster recognizer.

## Published site

The site is a static Vite build. Typed calls, both maps, and the lesson all run in the browser.

## Run locally

```powershell
npm install
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

In one terminal:

```powershell
npm run speak
```

In another:

```powershell
npm run dev
```

Open the local URL Vite prints.

Sample departure call:

```text
Salem Ground, Skyhawk three six niner four sierra, GA apron, with information Bravo, taxi VFR to the northwest.
```

Ground should answer:

```text
Skyhawk 3694S, Salem Ground, Runway 31, taxi via Charlie, cross Runway 34, via Foxtrot, hold short of Runway 31.
```

The local audio is a neural voice passed through a 300 Hz highpass and a 3400 Hz lowpass. Without the speech server, the same lines are spoken by the browser.

## Checks

```powershell
npm test
npm run build
```

## Sources

FAA PDFs and the checksum manifest are in `docs/sources/`. The rules the parser follows are in `docs/phraseology/ksle-vfr-departure.md`.

This is a training aid. The airport picture is a simplified diagram, not a chart, and it is not for navigation.
