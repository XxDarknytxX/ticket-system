import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/*
  Physical ticket stock: 200mm x 92mm
  Pre-printed header: 12mm from top  (logo, company name - already on paper)
  Pre-printed footer: 7.5mm from bottom (terms, website - already on paper)
  Printable content zone: 92mm - 12mm - 7.5mm = 72.5mm tall
  Main pane: 145mm wide | Perforation | Stub: 55mm wide (unchanged)
*/

export default function TicketDocument({ booking }) {
  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const money = (n) => (isFinite(+n) ? Number(n).toFixed(2) : '0.00');

  const rawGender = booking?.passenger_gender || booking?.customer_gender || booking?.gender || '';
  const gender = typeof rawGender === 'string' && rawGender.trim() ? rawGender.trim().toLowerCase() : null;
  const genderLabel = gender ? gender[0].toUpperCase() + gender.slice(1) : null;
  const bookingTypeLabel = booking?.booking_type?.replace('_', ' ') || 'One Way';
  const isReturn = booking?.booking_type === 'return' && booking?.return_date;

  const typeColor = () => '#000000';
  const statusColor = () => '#000000';

  const paymentLabel = (booking?.payment_method_name || booking?.payment_method || '').toString().toUpperCase();
  const issueDate = booking?.booking_date || booking?.created_at;

  // Route name length → font-size tiers so long names scale down instead of
  // truncating. If they're extremely long we also allow wrap onto 2 lines.
  const srcName = (booking?.source || '').toUpperCase();
  const dstName = (booking?.destination || '').toUpperCase();
  const nameLen = Math.max(srcName.length, dstName.length);
  const mainRouteSize =
    nameLen <= 7  ? 'text-[15pt]' :
    nameLen <= 9  ? 'text-[13pt]' :
    nameLen <= 11 ? 'text-[11pt]' :
    nameLen <= 14 ? 'text-[9pt]'  :
                    'text-[8pt]';
  const stubRouteSize =
    nameLen <= 5  ? 'text-[9pt]' :
    nameLen <= 7  ? 'text-[8pt]' :
    nameLen <= 10 ? 'text-[7pt]' :
                    'text-[6pt]';
  // Main pane has plenty of room — only wrap for truly extreme names.
  const mainWrapClass = nameLen > 13 ? 'whitespace-normal break-words leading-tight' : 'truncate';
  // Stub is narrow — wrap onto 2 lines as soon as names outgrow the smallest
  // font tier that still comfortably fits on a single line.
  const stubWrapClass = nameLen > 7 ? 'whitespace-normal break-words leading-none' : 'truncate';

  return (
    <div
      className={[
        'ticket-page mx-auto bg-white overflow-hidden my-3',
        'w-[728px] h-[348px]',
        'print:w-[200mm] print:h-[92mm] print:p-0',
        'print:rounded-none print:shadow-none print:border-none',
        'print-avoid-break',
      ].join(' ')}
      style={{ fontFamily: "'Inter', Arial, Helvetica, sans-serif" }}
    >
      {/*
        Outer wrapper: full 92mm ticket height.
        Top padding = 12mm (pre-printed header zone)
        Bottom padding = 7.5mm (pre-printed footer zone)
        Content fills the 72.5mm between.
      */}
      <div
        className="flex h-full"
        style={{ paddingTop: '12mm', paddingBottom: '7.5mm' }}
      >

        {/* ═══════ MAIN PANE ═══════ */}
        <div className="flex-1 flex flex-col justify-between px-3">

          {/* ── Route Line ── */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`${mainRouteSize} font-black text-black tracking-tight ${mainWrapClass}`}>
                {srcName}
              </span>
              <svg className="w-6 h-6 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className={`${mainRouteSize} font-black text-black tracking-tight ${mainWrapClass}`}>
                {dstName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[8pt] text-black font-bold uppercase">
                {booking?.service_type_name}
              </span>
              <span
                className="text-[7.5pt] font-black uppercase px-2 py-0.5 rounded text-white"
                style={{ background: '#000000' }}
              >
                {bookingTypeLabel}
              </span>
              <span
                className="text-[7.5pt] font-black uppercase px-2 py-0.5 rounded border border-black text-black whitespace-nowrap"
              >
                {booking?.tier === "first_class" ? "First Class" : "Economy"}
              </span>
            </div>
          </div>

          <div className="border-t border-dashed border-black my-1" />

          {/* ── Details + QR ── */}
          <div className="flex-1 flex gap-3 min-h-0 items-center">

            {/* Left: Details 2-column grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1.5 content-center">
              <div>
                <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Passenger</div>
                <div className="font-normal text-black truncate text-[12pt] leading-tight mt-0.5">{booking?.customer_name}</div>
              </div>
              <div>
                <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Gender</div>
                <div className="font-normal text-black text-[11pt] leading-tight mt-0.5">{genderLabel || '—'}</div>
              </div>
              <div>
                <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Travel Date</div>
                <div className="font-normal text-black text-[11pt] leading-tight mt-0.5">{fmtDate(booking?.travel_date)}</div>
              </div>
              <div>
                <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">
                  {isReturn ? 'Return Date' : 'Vessel'}
                </div>
                <div className="font-normal text-black truncate text-[11pt] leading-tight mt-0.5">
                  {isReturn
                    ? fmtDate(booking.return_date)
                    : `${booking?.vessel_name || '—'}${booking?.vessel_capacity ? ` (${booking.vessel_capacity})` : ''}`
                  }
                </div>
              </div>
              <div>
                <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Type</div>
                <span className="inline-block text-[9pt] font-bold uppercase px-2 py-0.5 rounded text-white mt-0.5" style={{ backgroundColor: typeColor() }}>
                  {booking?.passenger_type || 'Adult'}
                </span>
              </div>
              <div>
                <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Status</div>
                <span className="inline-block text-[9pt] font-bold uppercase px-2 py-0.5 rounded text-white mt-0.5" style={{ backgroundColor: statusColor() }}>
                  {booking?.status}
                </span>
              </div>
              <div>
                <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Ticket ID</div>
                <div className="text-[10pt] font-mono font-normal text-black break-all leading-tight mt-0.5">{booking?.ticket_id}</div>
              </div>
              {booking?.valid_until && (
                <div>
                  <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Valid Until</div>
                  <div className="font-normal text-black text-[10.5pt] leading-tight mt-0.5">{fmtDate(booking.valid_until)}</div>
                </div>
              )}
              {booking?.notes && (
                <div className="col-span-2">
                  <div className="text-[8pt] font-bold text-black uppercase tracking-wider leading-none">Notes</div>
                  <div className="text-[9pt] font-normal text-black truncate">{booking.notes}</div>
                </div>
              )}
            </div>

            {/* Right: QR Code — bigger for reliable scanning on the roomier main pane */}
            <div className="flex items-center justify-center shrink-0" style={{ width: '45mm', minWidth: '45mm' }}>
              <QRCodeSVG
                value={booking?.qr_code_data || booking?.ticket_id || 'N/A'}
                size={170}
                level="M"
                includeMargin={true}
                style={{ width: '100%', height: 'auto', maxWidth: '170px' }}
              />
            </div>
          </div>

          <div className="border-t border-dashed border-black my-1" />

          {/* ── Pricing Row ── */}
          <div className="flex items-center justify-between">
            <div className="text-[8pt] text-black font-normal">
              <span className="font-bold text-black">ISSUED:</span> {fmtDate(issueDate)}
              {paymentLabel && (
                <>
                  <span className="mx-1 text-black">|</span>
                  <span className="font-bold text-black">PAID:</span> {paymentLabel}
                </>
              )}
              {(booking?.booked_by_terminal || booking?.booked_by_first_name) && (
                <>
                  <span className="mx-1 text-black">|</span>
                  <span className="text-black">
                    {booking.booked_by_terminal ? `T-${booking.booked_by_terminal}` : ''}
                    {booking.booked_by_terminal && booking.booked_by_first_name ? ' | ' : ''}
                    {booking.booked_by_first_name
                      ? `${booking.booked_by_first_name} ${booking.booked_by_last_name || ''}`.trim()
                      : ''}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[8pt] text-black font-bold">TOTAL</span>
              <span className="text-[16pt] font-bold text-black">FJ${money(booking?.total_price)}</span>
            </div>
          </div>
        </div>

        {/* ═══════ PERFORATION ═══════ */}
        <div className="flex-shrink-0 border-l border-dashed border-black" style={{ marginLeft: '5mm' }} />

        {/* ═══════ STUB PANE ═══════ */}
        {/* Compact mirror of the main pane: every key field so the stub is a
            self-contained receipt after tear. Layout redesigned for the 55mm
            width — details as a single vertical column so nothing truncates
            into the QR. */}
        <div className="flex-shrink-0 flex flex-col justify-between" style={{ width: '55mm', paddingLeft: '2mm', paddingRight: '1.5mm', paddingTop: '2mm' }}>

          {/* ── Route Line ── Route text is vertically centered in the header
              against the stacked pills on the right. */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={`${stubRouteSize} font-black text-black tracking-tight ${stubWrapClass}`}>
                {srcName}
              </span>
              <svg className="w-3.5 h-3.5 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className={`${stubRouteSize} font-black text-black tracking-tight ${stubWrapClass}`}>
                {dstName}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <span
                className="text-[6pt] font-black uppercase px-1 py-0.5 rounded text-white"
                style={{ background: '#000000' }}
              >
                {bookingTypeLabel}
              </span>
              <span className="text-[6pt] font-black uppercase px-1 py-0.5 rounded border border-black text-black whitespace-nowrap">
                {booking?.tier === "first_class" ? "First Class" : "Economy"}
              </span>
            </div>
          </div>

          <div className="border-t border-dashed border-black my-1" />

          {/* ── Details + QR column ──
              Left: single-column vertical stack of PII details (vertically
              centered so it doesn't sit awkwardly at the top).
              Right column stacks: QR at the top, then Ticket ID and Valid
              Until directly beneath it — those get the full 27mm QR width
              so long ticket IDs no longer truncate. */}
          <div className="flex-1 flex gap-2 min-h-0 items-stretch">

            {/* Left: single-column vertical stack, vertically centered */}
            <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
              <div>
                <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none">Passenger</div>
                <div className="font-normal text-black truncate text-[9pt] leading-tight mt-0.5">{booking?.customer_name}</div>
              </div>
              <div>
                <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none">Gender</div>
                <div className="font-normal text-black text-[8pt] leading-tight mt-0.5">{genderLabel || '—'}</div>
              </div>
              <div>
                <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none">Travel Date</div>
                <div className="font-normal text-black text-[8pt] leading-tight mt-0.5">{fmtDate(booking?.travel_date)}</div>
              </div>
              <div>
                <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none">
                  {isReturn ? 'Return Date' : 'Vessel'}
                </div>
                <div className="font-normal text-black truncate text-[8pt] leading-tight mt-0.5">
                  {isReturn ? fmtDate(booking.return_date) : (booking?.vessel_name || '—')}
                </div>
              </div>
            </div>

            {/* Right: QR at top, Ticket ID + Valid Until directly below */}
            <div className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: '27mm', minWidth: '27mm' }}>
              <QRCodeSVG
                value={booking?.qr_code_data || booking?.ticket_id || 'N/A'}
                size={120}
                level="M"
                includeMargin={true}
                style={{ width: '100%', height: 'auto', maxWidth: '120px' }}
              />
              <div className="w-full text-center">
                <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none">Ticket ID</div>
                <div className="font-mono font-normal text-black text-[7pt] leading-tight mt-px whitespace-nowrap tracking-tight">{booking?.ticket_id}</div>
              </div>
              {booking?.valid_until && (
                <div className="w-full text-center">
                  <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none">Valid Until</div>
                  <div className="font-normal text-black text-[7.5pt] leading-tight mt-px">{fmtDate(booking.valid_until)}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Type + Status pills — stacked vertically so the longer
              Status label doesn't force truncation. Status is placed
              beneath Type. ── */}
          <div className="flex flex-col items-start gap-1 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none w-[12mm]">Type</div>
              <span className="inline-block text-[7.5pt] font-bold uppercase px-2 py-0.5 rounded text-white leading-none" style={{ backgroundColor: typeColor() }}>
                {booking?.passenger_type || 'Adult'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="text-[6.5pt] font-bold text-black uppercase tracking-wider leading-none w-[12mm]">Status</div>
              <span className="inline-block text-[7.5pt] font-bold uppercase px-2 py-0.5 rounded text-white leading-none" style={{ backgroundColor: statusColor() }}>
                {booking?.status}
              </span>
            </div>
          </div>

          <div className="border-t border-dashed border-black my-1" />

          {/* ── Pricing Row ── */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="text-[7pt] text-black font-normal leading-tight min-w-0 flex-1">
              <div className="truncate">
                <span className="font-bold">ISSUED:</span> {fmtDate(issueDate)}
              </div>
              {paymentLabel && (
                <div className="truncate">
                  <span className="font-bold">PAID:</span> {paymentLabel}
                </div>
              )}
            </div>
            <div className="flex items-baseline gap-1 flex-shrink-0">
              <span className="text-[7pt] text-black font-bold">TOTAL</span>
              <span className="text-[12pt] font-bold text-black leading-none">FJ${money(booking?.total_price)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
