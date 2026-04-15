# UAT Tests

## 1. Disclaimer Banner

1. **Fresh visit** — Clear `localStorage` (or use incognito). Banner appears at bottom of viewport with full disclaimer text and "I understand" button. Tool content (intro text, map, panels) is visible immediately without scrolling past the disclaimer.

2. **Accept disclaimer** — Click "I understand". Banner slides/fades out smoothly. Verify `localStorage` key `resonate_disclaimer_accepted` is set to `"true"` in DevTools > Application > Local Storage.

3. **Subsequent visit** — Reload page. Banner does not appear at all. No flash of banner content.

4. **Map controls not obscured** — With banner visible, verify map zoom controls, toolbar buttons, and bottom-of-map elements (Save JPG, etc.) are accessible and not hidden behind the banner.

5. **Narrow viewport** — Resize to ≤600 px width. Banner content stacks vertically, button is full-width, text is readable.

6. **Reset acceptance** — In DevTools > Application > Local Storage, delete `resonate_disclaimer_accepted`. Reload. Banner reappears.

7. **Intro text preserved** — The intro sentence ("A screening tool to predict noise levels...") and "under construction" notice remain visible in the header.

8. **No console errors** — Open DevTools console, verify no errors related to the banner or missing elements.

## 2. Phase 1 Layout — Full-viewport map with drawer

### Layout

9. **Page loads** — Map fills the full viewport below the header. No grey Leaflet tiles — map renders correctly at full size.

10. **Drawer visible** — Drawer is visible on the right (520px wide) with all panels inside, scrollable. Panels appear in the same order as before.

11. **Map behind drawer** — Map extends behind the drawer — visible on the left side.

12. **Header compact** — Logo, title, and action buttons are on one horizontal row. Under-construction notice and intro text are compact below.

### Drawer toggle

13. **Click toggle button** — Drawer slides closed smoothly. Map is now 100% visible and usable. Toggle icon flips direction.

14. **Click toggle again** — Drawer slides open. Scroll position within the drawer is preserved.

15. **Press `]` key** — Toggles drawer. Does NOT trigger when typing in a text input field.

16. **Reload page** — Drawer open/closed state persists via localStorage.

### Map interaction with drawer open

17. **Pan and zoom** — Pan and zoom the map on the visible portion (left of drawer). Responds normally.

18. **Place source** — Click map to place a source — coordinates are correct (source appears where clicked, not offset by drawer width).

19. **Place receiver** — Click map to place a receiver — same coordinate check.

20. **Drag marker** — Drag a marker — works correctly.

21. **Map toolbars** — Map toolbars (Mapping / Tools / Modelling) are accessible. When drawer is open, they may be partially behind it. When drawer is closed, all are fully visible.

### Panel functionality

22. **Expand/collapse panels** — Expand/collapse individual panels within the drawer — all still work.

23. **Collapse All button** — "Collapse All" button still works (in header).

24. **Criteria populate** — Place source + receivers. Criteria populate in the Receivers & criteria panel. Values are correct.

25. **Noise sources** — Add noise sources in the Day/Evening/Night tables. Predicted levels update correctly.

26. **Objects sidebar** — The Objects sidebar (on the map, in fullscreen mode) still slides in/out correctly and is independent of the drawer.

### Save/Load/Report

27. **Save → Load round-trip** — Full assessment setup → Save Assessment → reload → Load Assessment → all state restores correctly.

28. **Generate Report** — Generate Report → output includes content from all panels (not just visible ones — scroll down in drawer to verify all sections contributed).

### Noise map

29. **Noise map calculation** — Run a noise map calculation. Contours render correctly across the full map width (including behind the drawer).

30. **Save JPG** — Save JPG captures the map only, not the drawer.

### General

31. **All keyboard shortcuts** — P, L, A, B, N, 1–4, M, T, C, O, Z, R, H, S, E, Esc, Ctrl+Z, etc. all work.

32. **No console errors** — No errors in DevTools console.

33. **No missing elements** — No elements are visually missing or misplaced compared to the original layout (same panels, same content, just in the drawer now).

## 3. Phase 2 — Sticky compliance strip + jump navigation

### Empty state

34. **Fresh page load** — No source or receivers placed. The compliance strip at the top of the drawer shows "Place source and receivers to see compliance" in italic grey. Jump nav shows 5 buttons (Setup / Criteria / Sources / Results / Export).

### SA criteria display

35. **Place source + R1 in Adelaide CBD** — Strip populates with one row: `R1 <address> · Capital City Zone | (no subzone) · INL-5 · Cl 5(5)`. Period cells show `D —/52`, `N —/45` (grey, no source data yet). Drawer auto-scrolls to the Criteria section. Criteria jump button highlights.

36. **Place R2** — Second row appears in strip. Both receivers show up to 4 period cells each.

37. **Verify matching values** — Strip criteria values match the Receivers & criteria table below. Zone label matches the dropdown in the table.

38. **Clause detection** — If the receiver falls inside an intervening noise-designated zone, strip shows `Cl 5(6)`. If source + receiver same category, strip shows `Cl 5(4)`. Default is `Cl 5(5)`.

### Compliance display

39. **Enter source Lw** — Set source `lw.day = 90`. Strip updates to show `D 31/52 ✓ −21` or similar (green badge, compliant by 21 dB). Verify the predicted value matches the Predicted noise levels table.

40. **Push to exceedance** — Bump `sourcePins[0].lw` to 115 dB. Strip updates to `D 56/52 ✗ +4` (red badge, exceeded by 4 dB). No scroll needed — the strip stays visible.

41. **Iteration loop** — Perform 3 cycles of: adjust source Lw → observe strip update. Confirm the strip updates immediately without needing to scroll or click anywhere. This is the core UX win.

42. **Per-period visibility** — In SA, only Day and Night appear (no Evening). In VIC/NSW, Day + Evening + Night appear. In OTHER with Evening unchecked, Evening disappears.

### Jump navigation

43. **Click Setup** — Drawer scrolls to Development information panel. Panel header visible (not hidden behind the sticky strip). "Setup" button highlights active.

44. **Click Criteria** — Scrolls to Receivers & criteria panel. Active highlight moves.

45. **Click Sources** — Scrolls to Custom sources panel.

46. **Click Results** — Scrolls to Predicted noise levels area.

47. **Click Export** — Scrolls to PDF / GIS Export / Methodology area.

48. **Scroll spy** — Manually scroll the drawer. The active jump button updates automatically based on scroll position.

### Strip row click

49. **Click a receiver row in the strip** — Drawer scrolls smoothly to the Criteria derivation section. The clicked receiver's row in the Derivation table is visible.

### Auto-scroll on placement

50. **Close drawer, place new receiver** — Drawer auto-opens and scrolls to Criteria section.

51. **Drawer already open, place new receiver** — Drawer scrolls to Criteria section (was possibly showing Results).

52. **Change source after placement** — Adjusting source Lw does NOT trigger auto-scroll. Only the strip updates silently.

### Save/Load

53. **Save → Load round-trip** — Full assessment with source + 2 receivers + Lw set → Save Assessment → reload → Load Assessment → strip populates correctly with restored values. Jump nav still works.

### Regressions (must still pass)

54. **ISO/TR 17534-3 validation** — Click "Run validation" in Propagation method panel → all T01–T03 PASS within ±0.05 dB. No calc changes in Phase 2.

55. **Save JPG** — Captures the map only, not the drawer or compliance strip.

56. **Generate Report** — Word report collects content from all panels regardless of drawer position (uses global `.card` query).

57. **All keyboard shortcuts** — P, L, A, B, N, 1–4, M, T, C, O, Z, R, H, S, E, `]`, Esc, Ctrl+Z still work.

58. **No console errors** — No errors attributable to Phase 2 code. (The `showSaveFilePicker` security error when triggering Save via scripted click is a browser restriction, not a Phase 2 regression.)

## 4. Phase 4 — Expand button cleanup, shortcut documentation, responsive

### Expand button repurposed

59. **Expand button visible in toolbar** — On page load with the drawer open, the "Expand" button appears in the top-right map toolbar (inside `#mapPanelContainer`) alongside Save JPG, Mapping, Tools, and Modelling. Label reads `Expand`.

60. **Click Expand with drawer open** — Drawer slides closed, map fills the viewport. Button label updates to `Panels`.

61. **Click button again (now "Panels")** — Drawer slides back open at its saved width. Label reverts to `Expand`.

62. **Press `E` keyboard shortcut** — Same behaviour as clicking the button: toggles the drawer.

63. **No legacy fullscreen glitches** — No residual `.map-fullscreen` class is applied to `#mapCard`, no layout jumps, no duplicated Objects sidebar.

### Esc key priority

64. **Drawer open → Esc** — Drawer closes immediately. No other Esc side effects (draw mode stays active if it was, context menus stay unless they catch Esc elsewhere).

65. **Drawer closed → Esc** — No drawer change. Other Esc handlers run normally (e.g. cancels an in-progress draw, dismisses modal).

66. **Drawer open + draw mode active** — First Esc closes drawer. Second Esc cancels draw mode.

67. **Drawer open + Quick Reference modal open** — First Esc closes drawer (drawer is topmost). Second Esc closes the modal via its existing click-outside handler (or another press of `?`).

68. **Esc while typing in an input** — No drawer change. Esc falls through to native input behaviour.

### Quick Reference update

69. **Open Quick Reference (`?` key)** — Expand the `Keyboard shortcuts` details section. Verify a new `Layout` subsection is present at the bottom with three rows: `]`, `E`, `Esc`.

70. **Old entries removed** — `E — Expand/restore map` no longer appears under `Tools`. `Esc — Exit maximised mode` no longer appears under `Editing`.

### Responsive breakpoints

71. **Resize browser to 1000px wide** — Drawer defaults to 420px (unless user has dragged and saved a different width — clamp still applies). All panels render without horizontal scroll.

72. **Resize browser to 700px wide** — Drawer becomes full-width (100% of viewport). Resize handle is hidden. Toggle button reappears at bottom-left corner (not top-right).

73. **Click toggle on narrow viewport** — Drawer slides away, map is fully visible. Click again: drawer slides back full-width.

74. **Resize from 700px back to 1440px** — Drawer returns to its saved `resonate_drawer_width` (or 520px default). Resize handle reappears and works.

### Regressions (must still pass)

75. **All keyboard shortcuts** — P, L, A, B, N, K, 1–4, T, C, O, F, Z, R, M, H, S, `?`, `]`, `E`, `Esc`, Ctrl+Z, Ctrl+Shift+Z all work.

76. **ISO/TR 17534-3 validation** — Click "Run validation" → all T01–T03 PASS within ±0.05 dB.

77. **Save/Load round-trip** — Full assessment → Save → reload → Load → all state restores, including drawer width and drawer open state.

78. **Compliance strip + jump nav still functional** — Place source + receiver, enter Lw, verify strip updates and jump nav scrolls correctly.

79. **No console errors** — No errors attributable to Phase 4 code.
