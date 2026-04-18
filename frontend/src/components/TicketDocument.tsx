import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/*
  Physical ticket stock: 187mm x 82mm
  Pre-printed header: 12mm from top  (logo, company name - already on paper)
  Pre-printed footer: 5mm from bottom (terms, website - already on paper)
  Printable content zone: 82mm - 12mm - 5mm = 65mm tall
  Main pane: 128mm wide | Perforation | Stub: 55mm wide
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

  return (
    <div
      className={[
        'ticket-page mx-auto bg-white overflow-hidden my-3',
        'w-[680px] h-[310px]',
        'print:w-[187mm] print:h-[82mm] print:p-0',
        'print:rounded-none print:shadow-none print:border-none',
        'print-avoid-break',
      ].join(' ')}
      style={{ fontFamily: "'Inter', Arial, Helvetica, sans-serif" }}
    >
      {/*
        Outer wrapper: full 82mm ticket height.
        Top padding = 12mm (pre-printed header zone)
        Bottom padding = 5mm (pre-printed footer zone)
        Content fills the 65mm between.
      */}
      <div
        className="flex h-full"
        style={{ paddingTop: '12mm', paddingBottom: '7.5mm' }}
      >

        {/* ═══════ MAIN PANE ═══════ */}
        <div className="flex-1 flex flex-col justify-between px-2">

          {/* ── Route Line ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[12pt] font-black text-black tracking-tight truncate">
                {booking?.source?.toUpperCase()}
              </span>
              <svg className="w-5 h-5 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-[12pt] font-black text-black tracking-tight truncate">
                {booking?.destination?.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[7pt] text-black font-bold uppercase">
                {booking?.service_type_name}
              </span>
              <span
                className="text-[6.5pt] font-black uppercase px-1.5 py-0.5 rounded text-white"
                style={{ background: '#000000' }}
              >
                {bookingTypeLabel}
              </span>
            </div>
          </div>

          <div className="border-t border-dashed border-black my-0.5" />

          {/* ── Details + QR ── */}
          <div className="flex-1 flex gap-2 min-h-0 items-center">

            {/* Left: Details 2-column grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 content-center">
              <div>
                <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Passenger</div>
                <div className="font-normal text-black truncate text-[11pt] leading-tight">{booking?.customer_name}</div>
              </div>
              <div>
                <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Gender</div>
                <div className="font-normal text-black text-[10pt] leading-tight">{genderLabel || '\u2014'}</div>
              </div>
              <div>
                <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Travel Date</div>
                <div className="font-normal text-black text-[10pt] leading-tight">{fmtDate(booking?.travel_date)}</div>
              </div>
              <div>
                <div className="text-[7pt] font-bold text-black uppercase tracking-wider">
                  {isReturn ? 'Return Date' : 'Vessel'}
                </div>
                <div className="font-normal text-black truncate text-[10pt] leading-tight">
                  {isReturn
                    ? fmtDate(booking.return_date)
                    : `${booking?.vessel_name || '\u2014'}${booking?.vessel_capacity ? ` (${booking.vessel_capacity})` : ''}`
                  }
                </div>
              </div>
              <div>
                <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Type</div>
                <span className="inline-block text-[8pt] font-bold uppercase px-2 py-0.5 rounded text-white" style={{ backgroundColor: typeColor() }}>
                  {booking?.passenger_type || 'Adult'}
                </span>
              </div>
              <div>
                <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Status</div>
                <span className="inline-block text-[8pt] font-bold uppercase px-2 py-0.5 rounded text-white" style={{ backgroundColor: statusColor() }}>
                  {booking?.status}
                </span>
              </div>
              {booking?.tier === "first_class" && (
                <div>
                  <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Class</div>
                  <span className="inline-block text-[8pt] font-bold uppercase px-2 py-0.5 rounded text-white bg-black">
                    First Class
                  </span>
                </div>
              )}
              <div>
                <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Ticket ID</div>
                <div className="text-[9pt] font-mono font-normal text-black break-all leading-tight">{booking?.ticket_id}</div>
              </div>
              {booking?.valid_until && (
                <div>
                  <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Valid Until</div>
                  <div className="font-normal text-black text-[9.5pt] leading-tight">{fmtDate(booking.valid_until)}</div>
                </div>
              )}
              {booking?.notes && (
                <div className="col-span-2">
                  <div className="text-[7pt] font-bold text-black uppercase tracking-wider">Notes</div>
                  <div className="text-[9pt] font-normal text-black truncate">{booking.notes}</div>
                </div>
              )}
            </div>

            {/* Right: QR Code */}
            <div className="flex items-center justify-center shrink-0" style={{ width: '30mm', minWidth: '30mm' }}>
              <QRCodeSVG
                value={booking?.qr_code_data || booking?.ticket_id || 'N/A'}
                size={100}
                level="M"
                includeMargin={true}
                style={{ width: '100%', height: 'auto', maxWidth: '100px' }}
              />
            </div>
          </div>

          <div className="border-t border-dashed border-black my-0.5" />

          {/* ── Pricing Row ── */}
          <div className="flex items-center justify-between">
            <div className="text-[7pt] text-black font-normal">
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
            <div className="flex items-baseline gap-1">
              <span className="text-[7pt] text-black font-bold">TOTAL</span>
              <span className="text-[12pt] font-bold text-black">FJ${money(booking?.total_price)}</span>
            </div>
          </div>
        </div>

        {/* ═══════ PERFORATION ═══════ */}
        <div className="flex-shrink-0 border-l border-dashed border-black" style={{ marginLeft: '4mm' }} />

        {/* ═══════ STUB PANE ═══════ */}
        {/* Compact mirror of the main pane: every key field so the stub is a self-contained receipt after tear */}
        <div className="flex-shrink-0 flex flex-col justify-between" style={{ width: '55mm', paddingLeft: '1.5mm', paddingRight: '1mm' }}>

          {/* ── Route Line ── */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-[8pt] font-black text-black tracking-tight truncate">
                {booking?.source?.toUpperCase()}
              </span>
              <svg className="w-3 h-3 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-[8pt] font-black text-black tracking-tight truncate">
                {booking?.destination?.toUpperCase()}
              </span>
            </div>
            <span
              className="text-[5pt] font-black uppercase px-1 py-0.5 rounded text-white flex-shrink-0"
              style={{ background: '#000000' }}
            >
              {bookingTypeLabel}
            </span>
          </div>

          <div className="border-t border-dashed border-black my-0.5" />

          {/* ── Details + QR ── */}
          <div className="flex-1 flex gap-1 min-h-0 items-center">

            {/* Left: compact 2-col details grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-1 gap-y-0.5 content-center min-w-0">
              <div className="col-span-2">
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Passenger</div>
                <div className="font-normal text-black truncate text-[8pt] leading-tight">{booking?.customer_name}</div>
              </div>
              <div>
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Gender</div>
                <div className="font-normal text-black text-[7.5pt] leading-tight">{genderLabel || '\u2014'}</div>
              </div>
              <div>
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Travel</div>
                <div className="font-normal text-black text-[7.5pt] leading-tight truncate">{fmtDate(booking?.travel_date)}</div>
              </div>
              <div>
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">
                  {isReturn ? 'Return' : 'Vessel'}
                </div>
                <div className="font-normal text-black truncate text-[7.5pt] leading-tight">
                  {isReturn ? fmtDate(booking.return_date) : (booking?.vessel_name || '\u2014')}
                </div>
              </div>
              <div>
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Service</div>
                <div className="font-normal text-black truncate text-[7.5pt] leading-tight">{booking?.service_type_name || '\u2014'}</div>
              </div>
              <div>
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Type</div>
                <span className="inline-block text-[7pt] font-bold uppercase px-1 py-0.5 rounded text-white leading-none" style={{ backgroundColor: typeColor() }}>
                  {booking?.passenger_type || 'Adult'}
                </span>
              </div>
              <div>
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Status</div>
                <span className="inline-block text-[7pt] font-bold uppercase px-1 py-0.5 rounded text-white leading-none" style={{ backgroundColor: statusColor() }}>
                  {booking?.status}
                </span>
              </div>
            </div>

            {/* Right: QR Code */}
            <div className="flex items-center justify-center shrink-0" style={{ width: '19mm', minWidth: '19mm' }}>
              <QRCodeSVG
                value={booking?.qr_code_data || booking?.ticket_id || 'N/A'}
                size={80}
                level="M"
                includeMargin={true}
                style={{ width: '100%', height: 'auto', maxWidth: '80px' }}
              />
            </div>
          </div>

          {/* ── Ticket ID + Valid Until ── */}
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Ticket ID</div>
              <div className="font-mono font-normal text-black text-[7pt] truncate leading-tight">{booking?.ticket_id}</div>
            </div>
            {booking?.valid_until && (
              <div className="text-right flex-shrink-0">
                <div className="text-[6pt] font-bold text-black uppercase tracking-wider leading-none">Valid Until</div>
                <div className="font-normal text-black text-[7pt] leading-tight">{fmtDate(booking.valid_until)}</div>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-black my-0.5" />

          {/* ── Pricing Row ── */}
          <div className="flex items-center justify-between gap-1">
            <div className="text-[6.5pt] text-black font-normal leading-tight min-w-0 flex-1">
              <div className="truncate">
                <span className="font-bold">ISSUED:</span> {fmtDate(issueDate)}
              </div>
              {paymentLabel && (
                <div className="truncate">
                  <span className="font-bold">PAID:</span> {paymentLabel}
                </div>
              )}
            </div>
            <div className="flex items-baseline gap-0.5 flex-shrink-0">
              <span className="text-[6.5pt] text-black font-bold">TOTAL</span>
              <span className="text-[10pt] font-bold text-black leading-none">FJ${money(booking?.total_price)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
