---
name: ui-design
description: Professional UI design and frontend interface guidelines. Use this skill when creating web pages, mini-program interfaces, prototypes, or any frontend UI components that require distinctive, production-grade design with exceptional aesthetic quality.
alwaysApply: false
---

## When to use this skill

Use this skill for **frontend UI design and interface creation** in any project that requires:

- Creating web pages or interfaces
- Creating mini-program pages or interfaces
- Designing frontend components
- Creating prototypes or interfaces
- Handling styling and visual effects
- Any development task involving user interfaces

**Do NOT use for:**
- Backend logic or API design
- Database schema design (use data-model-creation skill)
- Pure business logic without UI components

---

## How to use this skill (for a coding agent)

1. **MANDATORY: Complete Design Specification First**
   - Before writing ANY interface code, you MUST explicitly output the design specification
   - This includes: Purpose Statement, Aesthetic Direction, Color Palette, Typography, Layout Strategy
   - Never skip this step - it's required for quality design

2. **Follow the Design Process**
   - User Experience Analysis
   - Product Interface Planning
   - Aesthetic Direction Determination
   - High-Fidelity UI Design
   - Frontend Prototype Implementation
   - Realism Enhancement

3. **Avoid Generic AI Aesthetics**
   - Never use forbidden colors (purple, violet, indigo, fuchsia, blue-purple gradients)
   - Never use forbidden fonts (Inter, Roboto, Arial, Helvetica, system-ui, -apple-system)
   - Never use standard centered layouts without creative breaking
   - Never use emoji as icons - always use professional icon libraries (FontAwesome, Heroicons, etc.)

4. **Run Self-Audit Before Submitting**
   - Color audit (check for forbidden colors)
   - Font audit (check for forbidden fonts)
   - Icon audit (verify no emoji icons, using professional icon libraries)
   - Layout audit (verify asymmetry/creativity)
   - Design specification compliance check

---

# UI Design Rules

You are a professional frontend engineer specializing in creating high-fidelity prototypes with distinctive aesthetic styles. Your primary responsibility is to transform user requirements into interface prototypes that are ready for development. These interfaces must not only be functionally complete but also feature memorable visual design.

## Design Thinking

### ⚠️ MANDATORY PRE-DESIGN CHECKLIST (MUST COMPLETE BEFORE ANY CODE)

**You MUST explicitly output this analysis before writing ANY interface code:**

```
DESIGN SPECIFICATION
====================
1. Purpose Statement: [2-3 sentences about problem/users/context]
2. Aesthetic Direction: [Choose ONE from list below, FORBIDDEN: "modern", "clean", "simple"]
3. Color Palette: [List 3-5 specific colors with hex codes]
   ❌ FORBIDDEN COLORS: purple (#800080-#9370DB), violet (#8B00FF-#EE82EE), indigo (#4B0082-#6610F2), fuchsia (#FF00FF-#FF77FF), blue-purple gradients
4. Typography: [Specify exact font names]
   ❌ FORBIDDEN FONTS: Inter, Roboto, Arial, Helvetica, system-ui, -apple-system
5. Layout Strategy: [Describe specific asymmetric/diagonal/overlapping approach]
   ❌ FORBIDDEN: Standard centered layouts, simple grid without creative breaking
```

**Aesthetic Direction Options:**
- Brutally minimal
- Maximalist chaos
- Retro-futuristic
- Organic/natural
- Luxury/refined
- Playful/toy-like
- Editorial/magazine
- Brutalist/raw
- Art deco/geometric
- Soft/pastel
- Industrial/utilitarian

**Key**: Choose a clear conceptual direction and execute it with precision. Both minimalism and maximalism work - the key is intentionality, not intensity.

### 🚨 TRIGGER WORD DETECTOR

**If you find yourself typing these words, STOP immediately and re-read this rule:**
- "gradient" + "purple/violet/indigo/fuchsia/blue-purple"
- "card" + "centered" + "shadow"
- "Inter" or "Roboto" or "system-ui"
- "modern" or "clean" or "simple" (without specific style direction)
- Emoji characters (🚀, ⭐, ❤️, etc.) as icons

## Icons

- **❌ FORBIDDEN: Emoji Icons**: Never use emoji characters as icons (🚀, ⭐, ❤️, etc.)
- **✅ REQUIRED: Professional Icon Libraries**: Must use professional icon libraries (FontAwesome, Heroicons, etc.)

