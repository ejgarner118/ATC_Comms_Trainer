# KSLE VFR departure ruleset

Scripted transmissions for the McNary Field trainer. The radio says only these lines. The HUD may coach. This file is our checklist, not a copy of the orders.

Sources, all effective 9 July 2026 unless noted:

- FAA Order JO 7110.65BB, Change 3, paragraphs 3-7-2, 3-9-4, and 3-9-10
- AIM Chapter 4, paragraphs 4-2-2, 4-2-3, 4-2-4, and 4-3-18
- AIM paragraph 4-4-7 and paragraph 5-5-2 for readback of runway assignments and hold-short instructions
- Chart Supplement, Pacific Northwest, KSLE, cycle effective 1 October 2026
- Airport diagram AL-361, d-TPP cycle 2610

The airport diagram cycle is superseded on 29 October 2026. Refresh `docs/sources/faa/KSLE-airport-diagram-2610.pdf` when the diagram is used for anything beyond this training schematic.

## Setup the student hears before calling

- Aircraft: Cessna 172, call sign Skyhawk 3694S. "Cessna 3694S" is also a full call sign (AIM 4-2-4). The leading "N" is omitted when the type or model is spoken.
- Place: north ramp.
- ATIS Information Bravo: wind 310 at 8, visibility 10, sky clear, temperature 18, altimeter 30.02, runway 31 in use.
- Intention: taxi for a VFR departure to the northwest. That matches runway 31. A south departure does not.
- Frequencies: ATIS 124.55, Ground 121.9, Tower 119.1. Seattle Approach 125.8 is not used on this hop.

The drawn route is a training simplification: ramp to Taxiway Alpha to the runway 31 hold-short line, with no runway crossing. It is not a chart.

## 1. Initial taxi call

State: at the ramp, Ground tuned.

Pilot shape, AIM 4-2-3: facility, full call sign, position, then the request. ATIS is recommended in the same paragraph and is coached here, not required.

Pass:

- Facility is Salem Ground
- Call sign is Skyhawk 3694S or Cessna 3694S
- Position is the north ramp
- The request includes taxi

Coach, and still issue the clearance if the four items above pass:

- ATIS code missing
- The pilot says "cleared to taxi". Controllers do not use "cleared" for taxi (AIM 4-3-18, JO 7110.65 3-7-2)
- The pilot asks to go south while runway 31 is in use

Fail, and do not issue a taxi clearance:

- No recognizable call sign: "Aircraft calling Salem Ground, say again call sign."
- Call sign present, but facility, position, or taxi request missing: "Skyhawk 3694S, Salem Ground, say again request."
- Transmission on any frequency other than 121.9: Ground does not answer

Ground clearance when the call passes, JO 7110.65 3-7-2:

"Skyhawk 3694S, Salem Ground, Runway 31, taxi via Alpha, hold short of Runway 31."

Spoken audio uses aviation digits: three, six, niner, four, sierra, and runway three one.

## 2. Hold-short readback

State: clearance issued, aircraft still at the ramp until the readback passes.

Pass, AIM 4-3-18: the readback includes hold short, runway 31, and the call sign. The call sign may be at the start or the end.

Radio on a pass: silence. The HUD explains that the readback was complete.

Fail: runway missing, or "hold short" missing. Ground says "Skyhawk 3694S, read back hold instructions." The aircraft does not move.

## 3. Ready for departure

State: holding short of runway 31, Tower tuned to 119.1.

Pass: Salem Tower, call sign, holding short of runway 31, ready for departure.

A ready call on Ground does not reach Tower. Ground does not invent a takeoff clearance.

## 4. Takeoff

Tower, JO 7110.65 3-9-10, runway first:

"Skyhawk 3694S, Runway 31, cleared for takeoff."

Pilot readback must include the runway and the call sign. A miss gets "say again" and the aircraft stays short of the runway.

After the aircraft is rolling, Tower says: "Skyhawk 3694S, frequency change approved." This VFR hop does not use "contact departure."

## 5. Line up and wait

Not the default path. A briefing checkbox, off unless the student turns it on, is the scenario flag. Reset keeps that checkbox and returns the airplane to the ramp.

When the flag is on, the ready call on 119.1 is answered with JO 7110.65 3-9-4:

"Skyhawk 3694S, Runway 31, line up and wait."

That is not a takeoff clearance. The airplane stays at the hold bars until the readback passes.

Pass: "line up and wait," runway 31, and the call sign at the start or the end. Radio on a pass: silence. The airplane lines up and holds on the runway. When it is in position, Tower issues the 3-9-10 takeoff clearance.

Fail, and do not enter the runway:

- "Cleared for takeoff," even with the runway and the call sign. This is a critical miss. Tower repeats "Runway 31, line up and wait."
- Runway or call sign missing. Tower repeats the same clearance.

Saying "cleared for takeoff" after the airplane is on the runway, and before Tower has issued the takeoff clearance, is the same critical miss. The airplane stays on the runway. Tower repeats line up and wait.

## 6. ATIS

124.55 is on the standby knob with Ground and Tower. Seattle Approach is not. When 124.55 becomes the active frequency, the scripted Information Bravo broadcast plays once. A transmission on ATIS gets silence. Leaving ATIS off the taxi call is still coaching, not a failed call.

## Radio discipline

- Listen before transmitting (AIM 4-2-2). The push-to-talk control does not open while Ground or Tower audio is playing.
- A transmission held open a long time is coached as a stuck mike. It does not change the clearance.
- Swap changes the tuned frequency. It does not, by itself, advance the flight.

## 7. Lesson card

When Tower approves the frequency change, the Readback column lists the required calls: taxi call, hold-short readback, ready call, line up and wait when that flag is on, and the takeoff readback.

A later try replaces that call. A taxi call that still receives the clearance, with a missing ATIS code or "cleared to taxi," is a check. Saying "cleared for takeoff" when the clearance was line up and wait is a critical miss, and that miss stays on the card after the correct readback. Reset clears the card.
