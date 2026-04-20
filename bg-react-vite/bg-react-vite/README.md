# BG Staff Portal — React + Vite

This is a React + Vite conversion of your uploaded HTML staff portal.

## Included
- Login screen
- First-time password setup flow
- Staff portal tabs
  - Clock in/out
  - Apply leave
  - Submit MC
  - My leaves
- Admin portal tabs
  - Leave requests
  - Attendance
  - Manage staff
  - Add user
- Public holiday off-in-lieu logic
- Late / early / overtime timing logic
- Local browser persistence for demo state

## Start
```bash
npm install
npm run dev
```

## Important
This version is still a **frontend demo with localStorage**, not a shared production backend yet.
Your next step is to connect it to Supabase or another backend.

## Suggested next files to add
- `src/lib/supabase.js`
- `src/api/attendance.js`
- `src/api/leaves.js`
- `src/api/users.js`

## Notes from the original HTML
Your original app had all data stored in a large in-page `DB` object and local browser logic for leave, MC, attendance, and admin controls. This React version keeps that logic structure but moves it into React state/hooks so it is much easier to connect to a real backend.
