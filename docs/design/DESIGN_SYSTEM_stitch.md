---
name: Sensory Magazine
colors:
  surface: '#faf9f5'
  surface-dim: '#dbdad6'
  surface-bright: '#faf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f0'
  surface-container: '#efeeea'
  surface-container-high: '#e9e8e4'
  surface-container-highest: '#e3e2df'
  on-surface: '#1b1c1a'
  on-surface-variant: '#55433d'
  inverse-surface: '#2f312e'
  inverse-on-surface: '#f2f1ed'
  outline: '#88726c'
  outline-variant: '#dbc1ba'
  surface-tint: '#96472d'
  primary: '#93452b'
  on-primary: '#ffffff'
  primary-container: '#b25d41'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb59e'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e4e2e1'
  on-secondary-container: '#656464'
  tertiary: '#00685d'
  on-tertiary: '#ffffff'
  tertiary-container: '#008376'
  on-tertiary-container: '#f4fffb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd0'
  primary-fixed-dim: '#ffb59e'
  on-primary-fixed: '#3a0b00'
  on-primary-fixed-variant: '#783118'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#87f5e4'
  tertiary-fixed-dim: '#69d9c8'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005047'
  background: '#faf9f5'
  on-background: '#1b1c1a'
  surface-variant: '#e3e2df'
  paper-background: '#FDFCF8'
  ink-text: '#2D2D2D'
  terracotta-accent: '#C36A4D'
  border-faint: rgba(45, 45, 45, 0.1)
  surface-card: '#FFFFFF'
typography:
  headline-xl:
    fontFamily: Libre Caslon Text
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Libre Caslon Text
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Libre Caslon Text
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  headline-xl-mobile:
    fontFamily: Libre Caslon Text
    fontSize: 30px
    fontWeight: '700'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 640px
  margin-mobile: 20px
  margin-desktop: 40px
  gutter: 16px
  stack-lg: 32px
  stack-md: 16px
  stack-sm: 8px
---

## Brand & Style

This design system embodies the aesthetic of a **curated lifestyle magazine**. It targets sophisticated users seeking intentional, high-quality experiences rather than generic data. The emotional response is one of calm discovery, trust, and refined taste.

The design style is **Minimalist Editorial**. It prioritizes generous "magazine-like" whitespace to let content breathe, uses a restricted but warm color palette to evoke tactile paper textures, and relies on high-contrast typography to establish clear information hierarchy. Visual elements are characterized by razor-thin borders and subtle, natural depth, avoiding the "heavy" look of traditional digital interfaces.

## Colors

The palette is inspired by high-end print media. 
- **Paper Background (#FDFCF8):** A warm, off-white "cream" base that reduces eye strain and feels more premium than pure white.
- **Ink Text (#2D2D2D):** A soft charcoal that provides high legibility while maintaining a sophisticated, non-harsh contrast.
- **Terracotta Accent (#C36A4D):** An earthy, organic point color used sparingly for calls-to-action, active states, and key highlights.

The color mode is strictly **Light**, mimicking physical paper. Surfaces use subtle shifts between the background cream and pure white to define layers.

## Typography

The typographic system creates an "Editorial Tension" between an elegant Serif and a clean Sans-serif.

- **Headlines:** Use **Libre Caslon Text**. This font brings authority and a literary feel. It should be used for course titles and section headers.
- **Body & Labels:** Use **Plus Jakarta Sans**. Its modern, slightly rounded geometry ensures high readability for spot descriptions and UI metadata (location, price, tags).

**Scale & Rhythm:**
- Use `headline-xl` for the primary screen title (e.g., "Today's Course").
- Use `label-md` with slight letter-spacing for metadata like "VERIFIED" or "SLOT" badges to create a refined, technical contrast to the serif headings.

## Layout & Spacing

The system uses a **Fixed-Fluid Hybrid** layout. On mobile, it fills the width with safe margins; on larger screens, it caps at **640px** and centers itself to mimic a vertical magazine column.

**Spacing Philosophy:**
- **Verticality:** Use generous vertical padding (`stack-lg`) between major sections to emphasize the "Luxury of Space."
- **Nesting:** Cards and related groups use tighter spacing (`stack-sm`) to remain cohesive.
- **Grids:** While mostly a single-column stack, use a simple 2-column grid for small metadata or pill groups (like the "Mood" selection).

## Elevation & Depth

This design system avoids heavy drop shadows. Depth is communicated through **Tonal Layering** and **Minimalist Outlines**:

- **Primary Cards:** Use a very thin (0.5px or 1px) border in `border-faint`. No shadow is required when placed on the cream background.
- **Hover/Active States:** For interactive cards, apply an "Ambient Glow"—a soft, high-diffusion shadow with very low opacity (2-4%) to suggest a slight lift from the paper.
- **Overlays:** Use a subtle backdrop blur (glassmorphism light) when showing the "Saved Courses" drawer to maintain a sense of context without cluttering the screen.

## Shapes

The shape language is **Soft (0.25rem)**. While a modern digital app might go fully rounded, this system keeps corners tighter to reflect the sharp edges of a printed magazine or a physical photograph.

- **Cards:** 0.5rem (`rounded-lg`) for a gentle, approachable feel.
- **Buttons/Pills:** 0.75rem (`rounded-xl`) or fully rounded for high-action items like "Create Course."
- **Input Fields:** 0.25rem to maintain a structured, professional look.

## Components

- **Buttons:** 
  - *Primary:* Solid Terracotta (#C36A4D) with white text. Rounded-xl.
  - *Secondary:* Transparent with an Ink Text border (1px). High-end, minimal.
- **Step Cards:** White background (#FFFFFF). 1px `border-faint`. Title in Serif, subtext in Sans-serif. Use a small Terracotta accent for the "Verified" icon or slot number.
- **Mood Pills:** Small, capsule-shaped buttons. Inactive: Cream background with faint border. Active: Solid Ink Text with white font.
- **Input Fields:** Minimalist. Only a bottom border (1px Ink) or a very light 4-sided border. Use Sans-serif for the typed text.
- **Timeline Connector:** A single, thin (1px) vertical line in `border-faint` connecting step cards to visualize the flow of the day.
- **Badges:** Small, uppercase `label-md` typography. Backgrounds should be very desaturated versions of the accent colors.
