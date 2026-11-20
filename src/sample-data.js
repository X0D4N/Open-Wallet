// Sample content shown on first launch (schema v2).
//
// Provider names come from the local catalogue (nominative use only: no
// logos, no official artwork). Every person, booking, seat and code here is
// made up, and every sample code is marked as a demo so it is never shown as
// a valid ticket. Cards keep only a display "last 4"; nothing here is a real
// payment credential.
'use strict';

function day(n, hour = 12, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const iso = (n, h, m) => day(n, h, m).toISOString();
const demo = (value, format = 'qr') => ({ value, format, source: 'demo' });

function sampleWallet() {
  const year = new Date().getFullYear();
  const flight = day(3, 20, 5);
  const salam = day(9, 21, 19);
  const movie = day(1, 19, 0);
  const train = day(12, 6, 10);
  const concert = day(21, 19, 30);
  const hotel = day(9, 15, 0);
  return {
    version: 2,
    settings: { theme: 'system', defaultCardId: 'card_enbd', region: 'IN' },
    cards: [
      {
        id: 'card_enbd', issuerId: 'enbd', networkId: 'mastercard', kind: 'credit', last4: '0937', holder: 'Alex Morgan', showHolder: false,
        expMonth: 3, expYear: year + 2, showExpiry: false, contactless: true, addedAt: iso(-60),
        transactions: [
          { id: 'tx4', merchant: 'Bean & Leaf Coffee', amount: -4.75, currency: 'USD', date: iso(0, 8, 12), category: 'Food & drink' },
          { id: 'tx6', merchant: 'Lumen Cinema', amount: -24.0, currency: 'USD', date: iso(-4, 19, 30), status: 'pending', category: 'Entertainment' }
        ]
      },
      {
        id: 'card_visa', issuerName: 'Harbor Credit Union', networkId: 'visa', kind: 'debit', last4: '4821', holder: 'Alex Morgan',
        expMonth: 8, expYear: year + 3, showExpiry: true, contactless: true, addedAt: iso(-120),
        transactions: [
          { id: 'tx1', merchant: 'Corner Grocer', amount: -42.18, currency: 'USD', date: iso(-1, 18, 22), category: 'Groceries' },
          { id: 'tx3', merchant: 'Refund · Paper Lantern', amount: 12.0, currency: 'USD', date: iso(-6, 14, 40), status: 'refund', category: 'Shopping' }
        ]
      },
      {
        id: 'card_hdfc', issuerId: 'hdfc', productId: 'millennia', networkId: 'visa', kind: 'credit', last4: '5512', holder: 'Alex Morgan',
        expMonth: 11, expYear: year + 4, showExpiry: false, contactless: true, addedAt: iso(-30),
        transactions: [
          { id: 'tx5', merchant: 'Skyway Travel', amount: -318.4, currency: 'USD', date: iso(-2, 20, 3), category: 'Travel' },
          { id: 'tx7', merchant: 'Oak & Pine Books', amount: -17.99, currency: 'USD', date: iso(-9, 13, 15), category: 'Shopping' }
        ]
      }
    ],
    passes: [
      {
        id: 'pass_ai', template: 'flight', providerId: 'flight.airindia', source: 'sample', barcode: demo('DEMO-BOARDING-AI0588-DEL-BOM-02F'),
        fields: { flightNo: 'AI 588', from: 'DEL', fromName: 'Delhi', to: 'BOM', toName: 'Mumbai', date: ymd(flight), time: hm(flight), terminal: '1', gate: '24', passenger: 'Alex Morgan', seat: '2F', ref: 'DEMO42', fare: 'Business', boarding: '19:25' }
      },
      {
        id: 'pass_movie', template: 'movie', providerId: 'movie.pvrinox', source: 'sample', barcode: demo('DEMO-CINEMA-232-12-02'),
        fields: { branch: 'Sample City Mall, Delhi', title: 'The Last Monsoon', format: 'IMAX', date: ymd(movie), time: hm(movie), section: '232', row: '12', seat: '2', screen: '4', ref: 'DEMOBK7731' }
      },
      {
        id: 'pass_salam', template: 'flight', providerId: 'flight.salamair', source: 'sample', barcode: demo('DEMO-BOARDING-OV0246-SHJ-MCT-02F'),
        fields: { flightNo: 'OV 246', fare: 'Saver fare', from: 'SHJ', fromName: 'Sharjah', to: 'MCT', toName: 'Muscat', date: ymd(salam), time: hm(salam), seat: '2F', passenger: 'Alex Morgan' }
      },
      {
        id: 'pass_train', template: 'train', providerId: 'train.ir', source: 'sample', barcode: demo('DEMO-RAIL-PNR-0000000000'),
        fields: { trainName: 'Sample Express', trainNo: '00000', from: 'New Delhi', to: 'Agra Cantt', date: ymd(train), time: hm(train), arrive: '08:05', coach: 'C2', class: 'Chair car', seat: '34', passenger: 'Alex Morgan', ref: 'DEMOPNR001' }
      },
      {
        id: 'pass_concert', template: 'event', providerId: 'event.bookmyshow', source: 'sample', barcode: demo('DEMO-EVENT-GA-88412'),
        fields: { title: 'Lumen Festival', venue: 'Riverside Grounds', date: ymd(concert), time: hm(concert), ticketType: 'Day pass', section: 'GA' }
      },
      {
        id: 'pass_hotel', template: 'hotel', providerId: 'hotel.taj', source: 'sample',
        fields: { property: 'Sample Seaside Hotel', address: 'Marine Drive, Mumbai', guest: 'Alex Morgan', date: ymd(hotel), time: hm(hotel), checkout: ymd(day(11)), room: 'Deluxe, sea view', ref: 'DEMOHTL55' }
      },
      {
        id: 'pass_yes', template: 'loyalty', providerId: 'loyalty.yesbank', source: 'sample', barcode: demo('7730019922', 'code128'),
        fields: { member: 'Alex Morgan', number: '7730019922', points: '1,240', tier: 'Gold' }
      },
      {
        id: 'pass_metro', template: 'transit', providerId: 'transit.hmrl', source: 'sample', currency: 'INR', barcode: demo('DEMO-METRO-00451209'),
        fields: { passType: 'Monthly pass', zones: 'All lines', validFrom: ymd(day(-10)), validTo: ymd(day(20)), number: '00451209', fare: 'Adult' },
        history: [
          { id: 'th1', merchant: 'Ameerpet (sample trip)', amount: -30, currency: 'INR', date: iso(-1, 8, 2) },
          { id: 'th2', merchant: 'Added value (sample)', amount: 500, currency: 'INR', date: iso(-7, 17, 44) }
        ]
      },
      {
        id: 'pass_gift', template: 'gift', providerId: 'gift.pvrinox', source: 'sample', currency: 'INR', barcode: demo('6006491200553', 'code128'),
        fields: { number: '6006491200553', balance: '1500', validTo: ymd(day(300)) }
      }
    ]
  };
}

module.exports = { sampleWallet };
