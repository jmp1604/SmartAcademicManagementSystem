/* ============================================================
   homepage.js
   TimeInAndTimeOutMonitoring / resc / js / homepage.js

   Currently handles:
     - Cookie dialog (jQuery UI)

   When you connect Supabase, add the loadEvents() function
   here using the shared supabase client from config/config.js
   ============================================================ */

// ── Cookie dialog ──────────────────────────────────────────────
$(function () {
    $('#dialog').dialog({
        autoOpen:  true,
        modal:     false,
        resizable: false,
        draggable: false,
        width:     320,
        buttons: {
            'Got it': function () { $(this).dialog('close'); }
        }
    });
});

/* ── Supabase events (add this when ready) ────────────────────
   Step 1: Add this import at the top of this file:
     import { supabase } from '../../config/config.js'

   Step 2: Replace the #event-list placeholder with this

   async function loadEvents() {
       const { data: events, error } = await supabase
           .from('events')
           .select('*')
           .in('status', ['Upcoming', 'On Going'])
           .order('eventStart', { ascending: true });

       const container = document.getElementById('event-list');

       if (error || !events.length) {
           container.innerHTML = `
               <div class="no-events">
                   <i class="fa-regular fa-calendar-xmark"></i>
                   <p>No upcoming or on-going events at the moment.</p>
               </div>`;
           return;
       }

       container.innerHTML = events.map(ev => {
           const startDate = ev.eventStart
               ? new Date(ev.eventStart).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
               : '';
           const endDate = ev.eventEnd
               ? new Date(ev.eventEnd).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
               : '';
           const startTime = ev.start_time
               ? new Date('1970-01-01T' + ev.start_time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
               : '';
           const endTime = ev.end_time
               ? new Date('1970-01-01T' + ev.end_time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
               : '';
           const badgeClass = ev.status === 'On Going' ? 'ongoing' : 'upcoming';
           const dateRange  = (endDate && endDate !== startDate) ? `${startDate} — ${endDate}` : startDate;
           const timeRange  = endTime ? `${startTime} — ${endTime}` : startTime;

           return `
               <article class="event-card">
                   <h3>${ev.event_name}</h3>
                   <span class="badge ${badgeClass}">${ev.status}</span>
                   ${ev.description ? `<p class="desc">${ev.description}</p>` : ''}
                   <div class="event-meta">
                       <p><i class="fa-regular fa-calendar"></i><strong>Date:</strong>&nbsp;${dateRange}</p>
                       <p><i class="fa-regular fa-clock"></i><strong>Time:</strong>&nbsp;${timeRange}</p>
                   </div>
               </article>`;
       }).join('');
   }

   loadEvents();
   ──────────────────────────────────────────────────────────── */