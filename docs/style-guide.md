# ATC Comms Simulator — UI/UX Design System & Avionics Style Guide

This style guide defines the front-end layout, visual language, interaction patterns, and anti-patterns for the **ATC Comms Simulator**. 

When building or refactoring components, adhere strictly to these specifications. Do not fall back to generic SaaS UI patterns.

---

## 1. Core Visual Metaphor: "Avionics Tactile"

The interface must feel like purpose-built cockpit hardware and professional Electronic Flight Bag (EFB) software (e.g., Garmin G3X/G1000, ForeFlight, BendixKing radio stacks):
* **High visual density:** Crisp, scannable information organized into logical equipment banks. Minimal dead whitespace.
* **Mechanical surface depth:** Use 1px micro-borders, stepped luminance, and top bevel highlights rather than fuzzy floating drop shadows.
* **Tactile annunciators:** Discrete hardware-style LED jewel indicators for transmitter states (`TX`, `RX`, `STBY`).
* **Zero "AI slop":** No soft rounded pill cards, no purple/indigo SaaS gradients, and no generic dashboard cards floating on blurred backgrounds.

---

## 2. Hard Anti-Patterns (Banned Styles)

Any generated component containing the following patterns must be rejected:
* **No gradients:** Never use `bg-gradient-to-r from-indigo-500 to-purple-600` or colorful accent fades.
* **No hyper-rounded corners:** Never use border radii greater than `6px` (`rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` are strictly forbidden for containers and buttons).
* **No card-in-card nesting:** Do not stack floating cards with identical drop shadows (`shadow-md`, `shadow-lg`).
* **No frosted glassmorphism:** Avoid `backdrop-blur-md bg-white/10` or soft translucent overlays.
* **No sluggish transitions:** Avoid spring/bounce animations or transitions longer than `150ms`. State changes should be crisp and immediate.

---

## 3. Design Tokens & Palette

### CSS Variables / Tailwind Hex Values

```css
:root {
  /* Surfaces & Chassis */
  --surface-panel: #11141B;       /* Main chassis, equipment frames, splitters */
  --surface-well: #0A0C10;        /* Inset display screens (map, transcript CRT, frequency boxes) */
  --surface-raised: #1A1F2B;      /* Buttons, rocker switches, interactive keypads */
  
  /* Structural Edges & Bevels */
  --border-edge: #262E3D;         /* 1px primary structural grid line */
  --border-highlight: #3B465C;    /* 1px top highlight border to simulate milled beveling */
  --border-inset: #050608;        /* 1px bottom inner shadow for inset wells */

  /* Text & Labels */
  --text-primary: #E1E7F0;        /* Off-white readout text (never pure #FFFFFF) */
  --text-secondary: #8C9AB0;      /* Labels, units, secondary telemetry */
  --text-muted: #4B5565;          /* Inactive toggle states, placeholder info */

  /* Avionics & Annunciator Colors */
  --phosphor-green: #33EE99;      /* Valid readback, ATC RX active, taxi centerline */
  --amber-caution: #FFB020;       /* Hold short alert, unacknowledged ATC message */
  --crimson-tx: #FF3344;          /* Mic hot / TX active, pilot deviation warning */
  --avionics-cyan: #38BDF8;       /* Active COM frequency, aircraft target vector */
}
```
