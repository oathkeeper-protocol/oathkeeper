---
title: "feat: Align miniapp design with dashboard design system"
type: feat
status: completed
date: 2026-03-05
deepened: 2026-03-06
---

# Align MiniApp Design with Dashboard Design System

## Enhancement Summary

**Deepened on:** 2026-03-06
**Research agents used:** frontend-design, best-practices-researcher (mobile WebView CSS), World MiniKit SDK docs, TypeScript reviewer, code-simplicity reviewer

### Key Improvements from Research
1. **iOS `:active` fix** -- must add `touchstart` listener or touch feedback is broken on iOS WebView
2. **GPU-only animations** -- replace `border-color`/`box-shadow` transitions with opacity-on-pseudo-element pattern
3. **Safe area insets** -- use `MiniKit.deviceProperties.safeAreaInsets` instead of hardcoded `pt-12`
4. **Scope cuts** -- remove `btn-secondary` (YAGNI) and `glass-card-glow` (invisible on mobile, adds complexity)
5. **Mesh gradient wow factor** -- ambient background that shifts color based on system state (15 min, zero deps)

### New Considerations Discovered
- World App has an official UI kit (`@worldcoin/mini-apps-ui-kit-react`) -- not adopting it (too late in hackathon), but judges may reference it
- `viewport-fit=cover` meta tag required for `env(safe-area-inset-*)` to work
- Font-weight should be 500 (medium) for body text on dark mobile screens -- regular weight appears thin
- `whileTap` (framer-motion) is better than CSS `:active` for animated touch feedback, but CSS `:active` is simpler for static feedback -- use both strategically

---

## Overview

The miniapp (World App Mini App) uses inline style objects and is missing the dashboard's glass-card system, button classes, input focus rings, and visual components (BondHealthBar). This plan ports the dashboard design system to the miniapp with mobile-first adaptations.

**Key constraint:** The miniapp runs inside World App's mobile WebView. No hover states, no noise overlay, no scrollbar styling. Touch targets must be 44px+. Performance matters.

## Problem Statement

The dashboard looks polished. The miniapp looks like a prototype. Judges see both. They should feel like the same product.

**Current gaps:**
- Inline `style={card}` / `style={primaryBtn}` instead of CSS classes
- No glass-card transitions, no input focus rings
- CSS variable mismatches (`--card`, `--card-border` differ, `--muted-strong`/`--input-bg`/`--card-border-hover` missing)
- SLA list has no visual indicators (BondHealthBar)
- Back button touch target is ~14px (needs 44px+)
- Claim success is a dead end (no "File Another" or "Back to Home")
- SLA list doesn't link to claim form (manual SLA ID entry required)
- No safe area inset handling for notched devices

## Proposed Solution

Port dashboard CSS classes to miniapp with mobile adaptations, replace inline styles, add BondHealthBar component, improve navigation flow.

### What to port

| From Dashboard | To MiniApp | Adaptation |
|---|---|---|
| `.glass-card` + `:hover` | `.glass-card` + `:active` | Replace hover with active feedback; add touchstart listener for iOS |
| `.btn-primary` + `:hover` | `.btn-primary` + `:active` | Replace hover glow with active opacity |
| `input[type] + :focus` | Same | Blue focus ring, same visual |
| `--card: #151525` | Same (opaque) | Replace translucent `rgba(22,22,38,0.7)` |
| `--card-border: rgba(255,255,255,0.08)` | Same | Align from 0.06 |
| `--card-border-hover`, `--muted-strong`, `--input-bg` | Add to miniapp | Missing variables |
| `@theme` block | Add to miniapp | Enables Tailwind color tokens |
| `BondHealthBar` component | Port to miniapp SLA list | `max={3}` hardcoded (demo) |

### What to skip

| Item | Reason |
|---|---|
| `.glass-card-glow::before` | Subtle 1px glow is invisible on small mobile screens. Adds pseudo-element complexity for zero demo value. |
| `.btn-secondary` | YAGNI -- dashboard doesn't have this class either. Keep existing inline style or use `.glass-card` as background. |
| `RiskBadge` | Requires BreachWarning event fetch -- additional RPC calls too expensive on mobile |
| `ComplianceChart` | Recharts too heavy for mobile WebView |
| Noise overlay | SVG filter expensive on mobile, no visual payoff |
| Scrollbar styling | Irrelevant -- mobile uses native scroll |

### What to fix (UX gaps)

1. **Back button touch target** -- wrap in padded container (min 44px)
2. **SLA-to-Claim navigation** -- tap SLA card to pre-fill claim form with SLA ID (~5 lines)
3. **Claim success dead end** -- add "File Another Claim" + "Back to Home" buttons (~4 lines)
4. **SLA fetch error state** -- distinguish from empty state, add retry button
5. **iOS touchstart listener** -- required for `:active` to fire in iOS WebView
6. **Safe area insets** -- use MiniKit device properties for proper padding

### What to add (wow factor)

**Ambient mesh gradient background** that shifts color based on system state:
- Healthy (default): blue-purple slow drift
- Warning: amber tint
- Breach: red pulse

This is 15 minutes of work, zero dependencies, and communicates system state subconsciously. Judges remember ambient details.

## Acceptance Criteria

- [x] MiniApp CSS variables match dashboard exactly (`--card`, `--card-border`, `--muted-strong`, `--card-border-hover`, `--input-bg`)
- [x] `.glass-card`, `.btn-primary` classes in miniapp `globals.css` with `:active` states
- [x] iOS touchstart listener added for `:active` state reliability
- [x] Input focus ring styling (blue border + glow) working on claim form
- [x] All inline `style={card}`, `style={primaryBtn}`, `style={secondaryBtn}`, `style={input}` replaced with CSS classes
- [x] `BondHealthBar` component rendered on each SLA card in the SLA list
- [x] Back button has 44px+ touch target
- [x] Tapping an SLA card navigates to claim screen with SLA ID pre-filled
- [x] Claim success screen has "File Another" and "Back to Home" actions
- [x] SLA fetch error state is visually distinct from empty state with retry button
- [x] `@theme` block with Tailwind color tokens added to miniapp CSS
- [x] `viewport-fit=cover` meta tag added to layout
- [x] Safe area bottom inset applied to sticky/bottom elements
- [x] Mesh gradient background responds to system state
- [x] App renders correctly in World App WebView (no broken layouts)

## Technical Considerations

### iOS `:active` state fix (CRITICAL)

Apple's documentation confirms: on iOS, `:active` pseudo-state may never fire without a touch event listener. **This is a hard requirement** -- without it, all touch feedback CSS is dead code in World App (iOS).

```tsx
// Add to layout.tsx or top-level useEffect in page.tsx
useEffect(() => {
  document.addEventListener('touchstart', () => {}, { passive: true });
}, []);
```

One line. Non-negotiable.

### GPU-only animation strategy

The original plan animated `border-color` and `box-shadow`, which trigger main-thread paint operations. On budget Android WebViews, this causes frame drops.

**Safe (GPU-composited):** `transform`, `opacity`
**Unsafe (triggers paint):** `border-color`, `box-shadow`, `background-color`

For `.glass-card:active`, use only `transform: scale(0.98)` -- skip `border-color` change. The scale alone provides sufficient tactile feedback on mobile.

For input `:focus`, the `box-shadow` ring is static (not animated on every frame), so the paint cost on focus is acceptable -- it only fires once per interaction.

### Safe area insets

World App exposes device insets via MiniKit:

```typescript
// Available after MiniKit.install()
MiniKit.deviceProperties.safeAreaInsets // { top, right, bottom, left }
```

Also available as `window.WorldApp.safe_area_insets`.

**Approach:** Read insets on mount, apply as CSS custom properties:

```tsx
useEffect(() => {
  if (MiniKit.isInstalled()) {
    const insets = MiniKit.deviceProperties?.safeAreaInsets;
    if (insets) {
      document.documentElement.style.setProperty('--sat', `${insets.top}px`);
      document.documentElement.style.setProperty('--sab', `${insets.bottom}px`);
    }
  }
}, []);
```

Then in CSS: `padding-top: var(--sat, 48px)` (fallback to current `pt-12` = 48px).

Also add `viewport-fit=cover` to the layout meta tag -- required for `env()` values to be non-zero:

```tsx
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### Specificity: no `!important`

Dashboard CSS uses `!important` everywhere to override Tailwind resets. The miniapp should NOT copy this pattern:
- Fewer Tailwind utility classes = fewer conflicts
- `.glass-card` selector is already more specific than Tailwind base resets
- Only use `!important` as last resort for global `input/textarea` selectors if Tailwind overrides them

### Migration must be atomic per element

Do NOT mix inline `style={card}` with `className="glass-card"` on the same element. Inline styles override class-based styles regardless of specificity. Remove the inline style completely when switching to the class.

### BondHealthBar max value

Dashboard hardcodes `max={3}`. Use the same constant in miniapp:

```tsx
const MAX_BOND_ETH = 3; // Demo: max 3 ETH for visual scaling
```

Don't pass `max` as a prop if every call site uses the same value. Make it a module constant.

### Screen navigation for SLA-to-Claim

Extract the handler -- don't inline 3 setState calls in onClick:

```typescript
const handleSLATap = (slaId: number) => {
  setClaimForm({ slaId: String(slaId), description: "" });
  setClaimStatus("idle");
  setScreen("claim");
};
```

Then: `<button onClick={() => handleSLATap(sla.id)}>`. Add `aria-label={`File claim for SLA ${sla.id}`}` for accessibility.

### Typography for mobile dark screens

- Body text: **15px minimum** (current 13px is too small for primary content)
- Font-weight: **500 (medium)** for body -- regular weight appears thin on dark backgrounds due to subpixel rendering
- Keep 13px for tertiary labels only (timestamps, metadata)
- `-webkit-font-smoothing: antialiased` is correct and required for dark themes on iOS

### Sequential SLA fetch optimization

The miniapp fetches SLAs in a sequential `for` loop (N separate RPC calls). Switch to `Promise.all` in the same PR:

```typescript
const results = await Promise.all(
  Array.from({ length: n }, (_, i) =>
    sepoliaClient.readContract({
      address: SLA_CONTRACT_ADDRESS as `0x${string}`,
      abi: SLA_ABI,
      functionName: "slas",
      args: [BigInt(i)],
    })
  )
);
```

This turns N sequential calls into N parallel calls -- meaningful improvement on mobile networks.

## File Changes

| File | Change |
|------|--------|
| `miniapp/src/app/globals.css` | Add missing CSS variables, port `.glass-card`, `.btn-primary`, input focus, `@theme` block. Mobile `:active` states. Mesh gradient background. |
| `miniapp/src/app/page.tsx` | Remove inline style objects. Apply CSS classes. Add `BondHealthBar`. Add `handleSLATap`. Fix back button. Add claim success actions. Add error state. Add touchstart listener. Add safe area inset handling. Parallelize SLA fetch. |
| `miniapp/src/app/layout.tsx` | Add `viewport-fit=cover` to meta tag. |

## MVP

### miniapp/src/app/globals.css

```css
@import "tailwindcss";

@theme {
  --color-chainlink-blue: #375BD2;
  --color-chainlink-light: #5493F7;
  --color-chainlink-dark: #1a1a2e;
}

:root {
  --background: #0a0a14;
  --foreground: #e2e8f0;
  --card: #151525;
  --card-border: rgba(255, 255, 255, 0.08);
  --card-border-hover: rgba(255, 255, 255, 0.14);
  --chainlink-blue: #375BD2;
  --chainlink-light: #5493F7;
  --muted: rgba(255, 255, 255, 0.45);
  --muted-strong: rgba(255, 255, 255, 0.6);
  --input-bg: rgba(255, 255, 255, 0.04);
  --sat: 48px; /* safe area top -- overridden by JS if MiniKit available */
  --sab: 0px;  /* safe area bottom */
}

* {
  -webkit-tap-highlight-color: transparent;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: 'General Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  font-weight: 500;
  overscroll-behavior: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Glass card -- GPU-only animations (transform + opacity) */
.glass-card {
  background: var(--card);
  border: 1px solid var(--card-border);
  transition: transform 0.15s ease-out;
}
.glass-card:active {
  transform: scale(0.98);
}

/* Primary button */
.btn-primary {
  background: var(--chainlink-blue);
  color: white;
  font-weight: 600;
  border-radius: 16px;
  transition: opacity 0.15s ease;
  cursor: pointer;
}
.btn-primary:active:not(:disabled) {
  opacity: 0.8;
}
.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Input styling */
input[type="text"],
input[type="number"],
textarea {
  background: var(--input-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
}
input[type="text"]:focus,
input[type="number"]:focus,
textarea:focus {
  border-color: rgba(84, 147, 247, 0.4);
  box-shadow: 0 0 0 3px rgba(84, 147, 247, 0.1);
  outline: none;
}

/* Ambient mesh gradient -- shifts based on system state */
.mesh-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  opacity: 0.25;
  transition: background 1.5s ease;
  pointer-events: none;
}
.mesh-bg--healthy {
  background:
    radial-gradient(ellipse at 20% 50%, #375BD2 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, #5493F7 0%, transparent 50%),
    #0a0a14;
  animation: meshDrift 8s ease-in-out infinite alternate;
}
.mesh-bg--warning {
  background:
    radial-gradient(ellipse at 30% 60%, #D29537 0%, transparent 50%),
    radial-gradient(ellipse at 70% 30%, #5493F7 0%, transparent 50%),
    #0a0a14;
}
.mesh-bg--breach {
  background:
    radial-gradient(ellipse at 50% 50%, #D23737 0%, transparent 50%),
    radial-gradient(ellipse at 20% 80%, #375BD2 0%, transparent 50%),
    #0a0a14;
  animation: meshPulse 2s ease-in-out infinite;
}

@keyframes meshDrift {
  to { background-position: 60% 40%, 30% 70%; }
}
@keyframes meshPulse {
  50% { opacity: 0.4; }
}
```

### miniapp/src/app/page.tsx -- BondHealthBar component

```tsx
const MAX_BOND_ETH = 3; // Demo: max 3 ETH for visual scaling

function BondHealthBar({ bond }: { bond: number }) {
  const pct = Math.min((bond / MAX_BOND_ETH) * 100, 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[12px] mb-1.5" style={{ color: "var(--muted)" }}>
        <span>Bond Health</span>
        <span className="text-white font-medium">{bond.toFixed(4)} ETH</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: "var(--chainlink-blue)" }}
        />
      </div>
    </div>
  );
}
```

### miniapp/src/app/page.tsx -- SLA card with tap-to-claim

```tsx
const handleSLATap = (slaId: number) => {
  setClaimForm({ slaId: String(slaId), description: "" });
  setClaimStatus("idle");
  setScreen("claim");
};

// In SLA list:
{slas.filter(s => s.active).map((sla) => (
  <button
    key={sla.id}
    onClick={() => handleSLATap(sla.id)}
    aria-label={`File claim for SLA ${sla.id}`}
    className="glass-card rounded-2xl p-4 w-full text-left"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>SLA #{sla.id}</p>
        <p className="text-[15px] mt-0.5" style={{ color: "var(--muted-strong)" }}>
          Provider: {sla.provider.slice(0, 6)}...{sla.provider.slice(-4)}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Min uptime: {(Number(sla.minUptimeBps) / 100).toFixed(1)}%
        </p>
      </div>
      <span className="text-xs px-2 py-1 rounded-full text-green-400 bg-green-400/10">Active</span>
    </div>
    <BondHealthBar bond={Number(formatEther(sla.bondAmount))} />
  </button>
))}
```

### miniapp/src/app/page.tsx -- iOS touchstart + safe area insets

```tsx
// Add to top of App component:
useEffect(() => {
  // Required for :active CSS to fire on iOS WebView
  document.addEventListener('touchstart', () => {}, { passive: true });
}, []);

useEffect(() => {
  if (MiniKit.isInstalled()) {
    const insets = (MiniKit as any).deviceProperties?.safeAreaInsets;
    if (insets) {
      document.documentElement.style.setProperty('--sat', `${insets.top}px`);
      document.documentElement.style.setProperty('--sab', `${insets.bottom}px`);
    }
  }
}, []);
```

### miniapp/src/app/page.tsx -- Mesh gradient background

```tsx
// Determine state from SLA data (add after SLA fetch):
const bgState = breachDetected ? 'breach' : warningDetected ? 'warning' : 'healthy';

// In the render, as first child of the outer div:
<div className={`mesh-bg mesh-bg--${bgState}`} />
```

### miniapp/src/app/page.tsx -- Back button with proper touch target

```tsx
<button
  onClick={() => setScreen("home")}
  className="py-3 pr-4 -ml-1 mb-4"
  style={{ color: "var(--muted)" }}
>
  <span className="text-[15px]">Back</span>
</button>
```

### miniapp/src/app/page.tsx -- Claim success actions

```tsx
{claimStatus === "success" && (
  <div className="glass-card rounded-2xl p-4">
    <p className="text-green-400 font-semibold">Claim filed on-chain!</p>
    <p className="text-[15px] mt-1" style={{ color: "var(--muted)" }}>
      CRE will monitor provider response time and auto-enforce if breached.
    </p>
    <div className="flex gap-3 mt-4">
      <button
        onClick={() => { setClaimStatus("idle"); setClaimForm({ slaId: "0", description: "" }); }}
        className="btn-primary flex-1 py-3 text-[15px]"
      >
        File Another
      </button>
      <button
        onClick={() => setScreen("home")}
        className="glass-card flex-1 py-3 text-[15px] text-white rounded-2xl"
      >
        Home
      </button>
    </div>
  </div>
)}
```

### miniapp/src/app/layout.tsx -- viewport-fit meta tag

```tsx
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

## References

- Dashboard CSS: `dashboard/src/app/globals.css`
- Dashboard components: `dashboard/src/app/dashboard/page.tsx` (StatCard, BondHealthBar, RiskBadge)
- MiniApp target files: `miniapp/src/app/globals.css`, `miniapp/src/app/page.tsx`, `miniapp/src/app/layout.tsx`
- Dashboard CLAUDE.md: `dashboard/CLAUDE.md`
- MiniApp CLAUDE.md: `miniapp/CLAUDE.md`
- [Apple: Handling Events in Safari](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html) -- iOS `:active` fix
- [Chrome: Hardware-Accelerated Animations](https://developer.chrome.com/blog/hardware-accelerated-animations) -- GPU-only property list
- [World App Guidelines](https://docs.world.org/mini-apps/design/app-guidelines) -- mini app UI constraints
- [World Mini Apps UI Kit](https://github.com/worldcoin/mini-apps-ui-kit) -- official component library (not adopted)
- [Tailwind v4 @theme docs](https://tailwindcss.com/docs/customizing-colors) -- color token syntax
