import { useMemo, useState } from 'react'
import { localDateToStr, parseLocalDate } from '../utils'
import Modal from './Modal'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function CalendarView({ db, helpers, currentUserId, currentUser, onAddEvent, onDeleteEvent }) {
  const now   = new Date()
  const [year,  setYear]    = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth())
  const [selected, setSelected]   = useState(null)
  const [addModal, setAddModal]   = useState(null)
  const [newEvent, setNewEvent]   = useState({ title: '', color: '#AB47BC' })

  const isAdmin    = currentUser?.role === 'admin'
  const isTeamLead = currentUser?.role === 'team_lead'
  const today      = localDateToStr(now)

  const visibleUids = useMemo(() => {
    if (isAdmin) return Object.keys(db.users)
    if (isTeamLead) return [currentUserId, ...helpers.getAllSubordinates(currentUserId)]
    return [currentUserId]
  }, [db.users, isAdmin, isTeamLead, currentUserId, helpers])

  const eventMap = useMemo(() => {
    const map = {}
    const add = (date, ev) => { if (!map[date]) map[date] = []; map[date].push(ev) }

    // Admin calendar events
    ;(db.calendarEvents || []).forEach((ev) => {
      add(ev.date, { type: 'event', label: ev.title, color: ev.color, id: ev.id, key: `ev-${ev.id}`, createdBy: ev.createdBy })
    })

    // Schedules
    visibleUids.forEach((uid) => {
      ;(db.schedules?.[uid] || []).forEach((shift) => {
        const tpl    = helpers.getShiftTemplate(shift.templateId)
        const branch = helpers.getBranch(shift.branchId)
        const color  = tpl?.color || branch?.color || '#7986CB'
        const uname  = uid === currentUserId ? 'My shift' : db.users[uid]?.name || uid
        add(shift.date, {
          type:  'shift',
          label: `${uname}: ${tpl?.name || shift.startTime}–${shift.endTime}`,
          color, uid, shiftId: shift.id, key: `sh-${shift.id}`,
        })
      })
    })

    // Birthdays
    Object.entries(db.users).forEach(([uid, u]) => {
      if (!u.birthday) return
      const parts = String(u.birthday).slice(0, 10).split('-')
      add(`${year}-${parts[1]}-${parts[2]}`, { type: 'birthday', label: `🎂 ${u.name}'s birthday`, color: '#FF4081', uid, key: `bd-${uid}-${year}` })
    })

    // Approved leaves
    visibleUids.forEach((uid) => {
      ;(db.leaves[uid] || []).forEach((leave, li) => {
        if (leave.status !== 'approved') return
        const lt    = helpers.getLeaveType(leave.type)
        const color = lt?.color || '#43a047'
        const uname = uid === currentUserId ? 'My leave' : db.users[uid]?.name || uid
        const start = parseLocalDate(leave.start)
        const end   = parseLocalDate(leave.end)
        for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          add(localDateToStr(new Date(d)), {
            type: 'leave', label: `${uname}: ${leave.type}`, color, uid,
            key: `lv-${uid}-${li}-${localDateToStr(new Date(d))}`,
          })
        }
      })
    })

    return map
  }, [db, visibleUids, currentUserId, helpers, year])

  const cells = useMemo(() => {
    const first    = new Date(year, month, 1)
    const last     = new Date(year, month + 1, 0)
    const startPad = first.getDay() === 0 ? 6 : first.getDay() - 1
    const result   = Array(startPad).fill(null)
    for (let d = 1; d <= last.getDate(); d++) result.push(new Date(year, month, d))
    return result
  }, [year, month])

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0);  setYear(y => y + 1) } else setMonth(m => m + 1) }
  const goToday   = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  // For grid chips: admin sees non-shift events; shifts shown separately in detail
  const gridEvents = (ds) => (eventMap[ds] || []).filter(ev => ev.type !== 'shift')
  const allDayEvents = selected ? (eventMap[selected] || []) : []
  const detailNonShift = allDayEvents.filter(ev => ev.type !== 'shift')
  const detailShifts   = allDayEvents.filter(ev => ev.type === 'shift')
  const detailLeaves   = allDayEvents.filter(ev => ev.type === 'leave')

  const handleAddEvent = () => {
    if (!newEvent.title.trim()) return
    onAddEvent({ title: newEvent.title.trim(), date: addModal, color: newEvent.color })
    setNewEvent({ title: '', color: '#AB47BC' })
    setAddModal(null)
  }

  const leaveTypes = db.leaveTypes || []
  const legendItems = [
    { label: 'Calendar Event', color: '#AB47BC' },
    { label: 'Shift',          color: '#7986CB' },
    { label: 'Birthday',       color: '#FF4081' },
    ...leaveTypes.map((t) => ({ label: t.label || t.name, color: t.color })),
  ]

  const hasDetail = selected && (allDayEvents.length > 0)

  return (
    <div className="cal-root">
      {/* Header */}
      <div className="cal-header">
        <div className="cal-nav">
          <button className="ghost-btn" onClick={prevMonth}>‹</button>
          <span className="cal-month-title">{MONTH_NAMES[month]} {year}</span>
          <button className="ghost-btn" onClick={nextMonth}>›</button>
        </div>
        <button className="ghost-btn" onClick={goToday}>Today</button>
      </div>

      {/* Grid */}
      <div className="cal-grid">
        {DAY_LABELS.map((d) => <div key={d} className="cal-day-hdr">{d}</div>)}
        {cells.map((day, idx) => {
          if (!day) return <div key={`pad-${idx}`} className="cal-cell cal-pad" />
          const ds      = localDateToStr(day)
          const chips   = gridEvents(ds)
          const isToday = ds === today
          return (
            <div
              key={ds}
              className={`cal-cell${isToday ? ' cal-today' : ''}`}
              onClick={() => setSelected(ds === selected ? null : ds)}
            >
              <div className="cal-day-num">{day.getDate()}</div>
              <div className="cal-chips">
                {chips.slice(0, 3).map((ev) => (
                  <div key={ev.key} className="cal-chip"
                    style={{ background: hexAlpha(ev.color, 0.15), color: ev.color, borderLeft: `3px solid ${ev.color}` }}
                    title={ev.label}>
                    {ev.label}
                  </div>
                ))}
                {chips.length > 3 && <div className="cal-chip-more">+{chips.length - 3}</div>}
              </div>
              {isAdmin && (
                <button className="cal-add-btn" title="Add event"
                  onClick={(e) => { e.stopPropagation(); setAddModal(ds); setSelected(null) }}>+</button>
              )}
            </div>
          )
        })}
      </div>

      {/* Day detail panel */}
      {hasDetail && (
        <div className="cal-detail">
          <div className="cal-detail-title">{helpers.fmtDate(selected)}</div>

          {/* Non-shift, non-leave events (calendar events, birthdays) */}
          {detailNonShift.filter(ev => ev.type !== 'leave').map((ev) => (
            <div key={ev.key} className="cal-detail-row" style={{ borderLeft: `4px solid ${ev.color}` }}>
              <span className="cal-detail-label">{ev.label}</span>
              <span className="cal-detail-type" style={{ color: ev.color }}>{ev.type}</span>
              {isAdmin && ev.type === 'event' && (
                <button className="ghost-btn danger-text" onClick={() => onDeleteEvent(ev.id)}>Remove</button>
              )}
            </div>
          ))}

          {/* Who is on leave */}
          {detailLeaves.length > 0 && (
            <div style={{ marginTop: detailNonShift.filter(ev => ev.type !== 'leave').length > 0 ? 12 : 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>On leave this day</div>
              {detailLeaves.map((ev) => (
                <div key={ev.key} className="cal-detail-row" style={{ borderLeft: `4px solid ${ev.color}` }}>
                  <span className="cal-detail-label">{ev.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Who is on shift (admin only) */}
          {isAdmin && detailShifts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>On shift this day</div>
              {detailShifts.map((ev) => (
                <div key={ev.key} className="cal-detail-row" style={{ borderLeft: `4px solid ${ev.color}` }}>
                  <span className="cal-detail-label">{ev.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="cal-legend">
        {legendItems.map((li) => (
          <span key={li.label} className="cal-legend-item">
            <span className="cal-legend-dot" style={{ background: li.color }} />
            {li.label}
          </span>
        ))}
      </div>

      {/* Add Event Modal */}
      {addModal && (
        <Modal title={`Add event — ${helpers.fmtDate(addModal)}`} onClose={() => setAddModal(null)}>
          <label className="field">
            <span>Event title</span>
            <input value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="e.g. Team meeting" autoFocus />
          </label>
          <label className="field">
            <span>Color</span>
            <div className="color-row">
              {['#AB47BC','#5b7fb8','#43a047','#e53935','#fb8c00','#00acc1','#546e7a'].map((c) => (
                <button key={c}
                  className={`color-dot${newEvent.color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewEvent({ ...newEvent, color: c })}
                />
              ))}
            </div>
          </label>
          <button className="primary-btn" onClick={handleAddEvent}>Add event</button>
        </Modal>
      )}
    </div>
  )
}
