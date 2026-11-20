// Open Wallet — local catalogue (schema v1).
//
// Everything the Add flow, the artwork engines and the document vault know
// about regions, categories, providers, banks, card networks and document
// types lives here as plain data, so new entries never need UI changes.
//
// Artwork policy: no third-party logo or card image is bundled. Every
// provider is drawn as a text wordmark in approximate public brand colours
// ("art.kind = 'wordmark'"), created by Open Wallet (MIT). Colours are
// approximations and are NOT verified against brand guidelines. See
// docs/CATALOGUE.md for coverage and how to contribute.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Catalog = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '2026.11.1';
  const ART_SOURCE = { kind: 'wordmark', source: 'Open Wallet original text treatment', licence: 'MIT', verified: false };

  // ---- Regions ---------------------------------------------------------------
  const REGIONS = [
    ['IN', 'India', 'INR'], ['AE', 'United Arab Emirates', 'AED'], ['SA', 'Saudi Arabia', 'SAR'], ['QA', 'Qatar', 'QAR'],
    ['KW', 'Kuwait', 'KWD'], ['BH', 'Bahrain', 'BHD'], ['OM', 'Oman', 'OMR'], ['US', 'United States', 'USD'],
    ['CA', 'Canada', 'CAD'], ['GB', 'United Kingdom', 'GBP'], ['EU', 'European Union', 'EUR'], ['AU', 'Australia', 'AUD'],
    ['NZ', 'New Zealand', 'NZD'], ['SG', 'Singapore', 'SGD'], ['XX', 'Other country or region', 'USD']
  ].map(([code, name, currency]) => ({ code, name, currency }));
  const GCC = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'];
  const regionName = (c) => (REGIONS.find((r) => r.code === c) || { name: c }).name;

  // ---- Add to Wallet categories ---------------------------------------------
  // `route` says which screen opens: providers (searchable directory),
  // templates (choose a ticket type), ids (choose a document), form, other.
  const ADD_CATEGORIES = [
    { id: 'payment', label: 'Payment card', hint: 'Show a credit, debit or prepaid card. Display only, it can’t pay', icon: 'card', route: 'form', template: 'payment' },
    { id: 'loyalty', label: 'Loyalty card', hint: 'Earn and use your rewards and points', icon: 'loyalty', route: 'providers', cat: 'loyalty', search: 'Search loyalty programmes' },
    { id: 'gift', label: 'Gift card', hint: 'Keep a gift card’s number and balance', icon: 'gift', route: 'providers', cat: 'gift', search: 'Search gift cards' },
    { id: 'transport', label: 'Transport pass', hint: 'Metro, bus and travel cards for getting around town', icon: 'transit', route: 'providers', cat: 'transit', search: 'Search city or transport agency' },
    { id: 'tickets', label: 'Tickets & events', hint: 'Movies, concerts, sports, theatre and attractions', icon: 'event', route: 'templates', templates: ['movie', 'event', 'sports', 'amusement', 'entry'] },
    { id: 'travel', label: 'Boarding passes & travel', hint: 'Flights, trains, buses, taxis, ferries, hotels and parking', icon: 'boarding', route: 'templates', templates: ['flight', 'train', 'bus', 'taxi', 'ferry', 'hotel', 'parking'] },
    { id: 'purchase', label: 'Purchases & receipts', hint: 'Order confirmations and receipts with a code', icon: 'gift', route: 'form', template: 'purchase' },
    { id: 'ids', label: 'IDs & personal info', hint: 'Keep copies of ID cards, licences and passports', icon: 'id', route: 'ids', group: 'identity' },
    { id: 'abha', label: 'ABHA health ID', hint: 'Book appointments and get medicare access', icon: 'id', route: 'doc', doc: 'IN.abha', regions: ['IN'] },
    { id: 'health', label: 'Health cards', hint: 'Insurance, health IDs and healthcare memberships', icon: 'health', route: 'ids', group: 'health' },
    { id: 'vehicle', label: 'Vehicle documents', hint: 'Registration, insurance and inspection certificates', icon: 'car', route: 'ids', group: 'vehicle' },
    { id: 'other', label: 'Everything else', hint: 'Import a photo or PDF of any pass, like an event ticket, loyalty card, or receipt', icon: 'photo', route: 'other' }
  ];

  // ---- Pass templates --------------------------------------------------------
  // Field types: text, date, time, money. `upper` uppercases, `mask` hides all
  // but the last 4 in lists, `secret` is never shown unless revealed.
  const F = (k, label, o = {}) => Object.assign({ k, label }, o);
  const TEMPLATES = {
    movie: { label: 'Movie ticket', icon: 'movie', motif: 'film', providerCat: 'movie', providerLabel: 'Cinema',
      fields: [F('branch', 'Cinema and location'), F('title', 'Movie', { req: true }), F('language', 'Language'), F('format', 'Format', { hint: '2D, 3D, IMAX, 4DX… only if it’s on your ticket' }),
        F('date', 'Show date', { type: 'date', req: true }), F('time', 'Show time', { type: 'time' }), F('screen', 'Screen'),
        F('section', 'Section'), F('row', 'Row'), F('seat', 'Seat'), F('ref', 'Booking ID')] },
    flight: { label: 'Boarding pass', icon: 'boarding', motif: 'plane', providerCat: 'flight', providerLabel: 'Airline',
      fields: [F('flightNo', 'Flight number', { req: true, upper: true }), F('fare', 'Fare or cabin'), F('from', 'From (airport code)', { req: true, upper: true, max: 4 }), F('fromName', 'From (city)'),
        F('to', 'To (airport code)', { req: true, upper: true, max: 4 }), F('toName', 'To (city)'), F('date', 'Departure date', { type: 'date', req: true }), F('time', 'Departure time', { type: 'time' }),
        F('arrive', 'Arrival time', { type: 'time' }), F('terminal', 'Terminal'), F('gate', 'Gate'), F('boarding', 'Boarding time', { type: 'time' }), F('zone', 'Boarding group'),
        F('passenger', 'Passenger'), F('seat', 'Seat', { upper: true }), F('ref', 'Booking reference (PNR)', { upper: true })] },
    train: { label: 'Train ticket', icon: 'train', motif: 'train', providerCat: 'train', providerLabel: 'Railway',
      fields: [F('trainName', 'Train name'), F('trainNo', 'Train number', { req: true }), F('from', 'From station', { req: true }), F('to', 'To station', { req: true }),
        F('date', 'Departure date', { type: 'date', req: true }), F('time', 'Departs', { type: 'time' }), F('arrive', 'Arrives', { type: 'time' }), F('platform', 'Platform'),
        F('coach', 'Coach'), F('class', 'Class'), F('seat', 'Seat or berth'), F('passenger', 'Passenger'), F('ref', 'PNR or booking reference', { upper: true })] },
    bus: { label: 'Bus ticket', icon: 'bus', motif: 'bus', providerCat: 'bus', providerLabel: 'Bus operator',
      fields: [F('route', 'Route or service'), F('from', 'Boarding point', { req: true }), F('to', 'Drop-off point', { req: true }), F('date', 'Date', { type: 'date', req: true }),
        F('time', 'Departs', { type: 'time' }), F('seat', 'Seat'), F('passenger', 'Passenger'), F('ref', 'Booking reference', { upper: true })] },
    ferry: { label: 'Ferry or cruise', icon: 'ferry', motif: 'ship', providerCat: 'ferry', providerLabel: 'Operator',
      fields: [F('vessel', 'Vessel'), F('from', 'From port', { req: true }), F('to', 'To port', { req: true }), F('date', 'Date', { type: 'date', req: true }),
        F('time', 'Embarkation time', { type: 'time' }), F('terminal', 'Terminal'), F('seat', 'Cabin or seat'), F('passenger', 'Passenger'), F('ref', 'Booking reference', { upper: true })] },
    transit: { label: 'Transport pass', icon: 'transit', motif: 'metro', providerCat: 'transit', providerLabel: 'Transport operator',
      fields: [F('passType', 'Pass type', { req: true, hint: 'e.g. Monthly pass, Stored value' }), F('zones', 'Zones or route'), F('validFrom', 'Valid from', { type: 'date' }),
        F('validTo', 'Valid until', { type: 'date' }), F('number', 'Card number', { mask: true }), F('fare', 'Fare type'), F('balance', 'Balance (your note)', { type: 'money' })] },
    event: { label: 'Event ticket', icon: 'event', motif: 'stage', providerCat: 'event', providerLabel: 'Ticket seller or organiser',
      fields: [F('title', 'Event', { req: true }), F('venue', 'Venue'), F('date', 'Date', { type: 'date', req: true }), F('time', 'Starts', { type: 'time' }),
        F('ticketType', 'Ticket type'), F('section', 'Section'), F('row', 'Row'), F('seat', 'Seat'), F('ref', 'Order number')] },
    sports: { label: 'Sports ticket', icon: 'sports', motif: 'stadium', providerCat: 'event', providerLabel: 'Ticket seller or club',
      fields: [F('title', 'Match or fixture', { req: true }), F('venue', 'Stadium'), F('date', 'Date', { type: 'date', req: true }), F('time', 'Kick-off', { type: 'time' }),
        F('gate', 'Gate'), F('section', 'Stand or section'), F('row', 'Row'), F('seat', 'Seat'), F('ref', 'Order number')] },
    hotel: { label: 'Hotel booking', icon: 'hotel', motif: 'hotel', providerCat: 'hotel', providerLabel: 'Hotel or booking site',
      fields: [F('property', 'Property', { req: true }), F('address', 'Address'), F('guest', 'Guest'), F('date', 'Check-in', { type: 'date', req: true }),
        F('time', 'Check-in time', { type: 'time' }), F('checkout', 'Check-out', { type: 'date' }), F('room', 'Room type'), F('ref', 'Booking reference', { upper: true })] },
    parking: { label: 'Parking pass', icon: 'parking', motif: 'parking', providerCat: 'parking', providerLabel: 'Parking operator',
      fields: [F('facility', 'Car park', { req: true }), F('vehicle', 'Vehicle plate', { upper: true }), F('date', 'From', { type: 'date', req: true }), F('time', 'Entry time', { type: 'time' }),
        F('validTo', 'Valid until', { type: 'date' }), F('space', 'Bay or level'), F('ref', 'Reference')] },
    loyalty: { label: 'Loyalty card', icon: 'loyalty', motif: 'loyalty', providerCat: 'loyalty', providerLabel: 'Programme',
      fields: [F('member', 'Member name'), F('number', 'Member number', { req: true, mask: true }), F('tier', 'Tier'), F('points', 'Points (your note)')] },
    gift: { label: 'Gift card', icon: 'gift', motif: 'gift', providerCat: 'gift', providerLabel: 'Store or brand',
      fields: [F('number', 'Gift card number', { req: true, mask: true }), F('pin', 'PIN (optional)', { secret: true }), F('balance', 'Balance (your note)', { type: 'money' }), F('validTo', 'Expires', { type: 'date' })] },
    taxi: { label: 'Taxi or ride', icon: 'car', motif: 'taxi', providerCat: 'taxi', providerLabel: 'Taxi or ride company',
      fields: [F('from', 'Pick-up', { req: true }), F('to', 'Drop-off', { req: true }), F('date', 'Date', { type: 'date', req: true }), F('time', 'Pick-up time', { type: 'time' }),
        F('vehicle', 'Vehicle', { hint: 'Car model or plate, only if it’s on your booking' }), F('passenger', 'Passenger'), F('fare', 'Fare (your note)'), F('ref', 'Booking reference', { upper: true })] },
    entry: { label: 'Entry pass', icon: 'event', motif: 'entry', providerCat: 'entry', providerLabel: 'Venue or attraction',
      fields: [F('title', 'Place', { req: true }), F('venue', 'Location'), F('date', 'Date', { type: 'date', req: true }), F('time', 'Entry time', { type: 'time' }),
        F('gate', 'Entry gate'), F('ticketType', 'Ticket type'), F('admits', 'Admits'), F('validTo', 'Valid until', { type: 'date' }), F('ref', 'Ticket number')] },
    amusement: { label: 'Amusement park or attraction', icon: 'event', motif: 'amusement', providerCat: 'amusement', providerLabel: 'Park or attraction',
      fields: [F('title', 'Park or attraction', { req: true }), F('venue', 'Location'), F('date', 'Date', { type: 'date', req: true }), F('time', 'Time', { type: 'time' }),
        F('ticketType', 'Ticket type'), F('admits', 'Guests'), F('ref', 'Booking reference')] },
    purchase: { label: 'Purchase or receipt', icon: 'gift', motif: 'purchase', providerCat: 'gift', providerLabel: 'Store',
      fields: [F('title', 'Item or order', { req: true }), F('date', 'Date', { type: 'date' }), F('amount', 'Amount (your note)', { type: 'money' }), F('ref', 'Order number'), F('notes', 'Notes', { textarea: true })] },
    generic: { label: 'Pass', icon: 'generic', motif: 'generic', providerCat: null, providerLabel: 'Issuer',
      fields: [F('title', 'Name', { req: true }), F('subtitle', 'Description'), F('date', 'Date', { type: 'date' }), F('time', 'Time', { type: 'time' }),
        F('number', 'Number or reference'), F('notes', 'Notes', { textarea: true })] }
  };

  // ---- Providers (cards, passes, tickets) ----------------------------------
  // [id, name, programme/sub, region, colour, text colour, extra]
  const P = [];
  const add = (cat, rows) => rows.forEach(([id, name, sub, region, color, fg, extra]) => P.push(Object.assign(
    { id: `${cat}.${id}`, cat, name, sub: sub || '', region, color, fg: fg || '#ffffff', art: ART_SOURCE, aliases: [] }, extra || {})));

  add('loyalty', [
    ['yesbank', 'Yes Bank', 'Yes Rewardz', 'IN', '#00518f'], ['regenta', 'Regenta Rewards', 'Your Rewards', 'IN', '#3b0a57'],
    ['shiprocket', 'Shiprocket', 'Shipcoin', 'IN', '#6c3fd8'], ['miniklub', 'MiniKlub', 'Your Rewards', 'IN', '#22a99c'],
    ['twid', 'Twid', 'Pay with Rewards', 'IN', '#151515'], ['flipkart', 'Flipkart SuperCoins', 'Flipkart Rewards', 'IN', '#f59e0b', '#1f1300'],
    ['airindia', 'Air India', 'Maharaja Club', 'IN', '#b5121b'], ['indigo', 'IndiGo', 'BluChip', 'IN', '#001b94'],
    ['taj', 'IHCL', 'Taj InnerCircle', 'IN', '#7a5c2e'], ['tataneu', 'Tata Neu', 'NeuCoins', 'IN', '#4b2a86'],
    ['shoppersstop', 'Shoppers Stop', 'First Citizen', 'IN', '#222222'], ['pantaloons', 'Pantaloons', 'Green Card', 'IN', '#00843d'],
    ['iocl', 'IndianOil', 'XTRAREWARDS', 'IN', '#f37021'], ['bpcl', 'Bharat Petroleum', 'SmartDrive', 'IN', '#ffd200', '#1b2a6b'],
    ['apollo', 'Apollo Pharmacy', 'Apollo Circle', 'IN', '#0b7c7a'], ['pvrinox', 'PVR INOX', 'PVR INOX Passport', 'IN', '#f7c600', '#1b1b1b'],
    ['skywards', 'Emirates', 'Skywards', 'AE', '#c60c30'], ['etihadguest', 'Etihad', 'Etihad Guest', 'AE', '#9c7a3c'],
    ['share', 'Majid Al Futtaim', 'SHARE', 'AE', '#1a3c7a'], ['blue', 'Al-Futtaim', 'Blue Rewards', 'AE', '#002e6d'],
    ['lulu', 'LuLu', 'LuLu Happiness', 'AE', '#0a8a3a'], ['airrewards', 'Air Arabia', 'AirRewards', 'AE', '#d71920'],
    ['qrpc', 'Qatar Airways', 'Privilege Club', 'QA', '#5c0632'], ['alfursan', 'Saudia', 'Alfursan', 'SA', '#006c35'],
    ['sindbad', 'Oman Air', 'Sindbad', 'OM', '#0b6b74'], ['falconflyer', 'Gulf Air', 'Falconflyer', 'BH', '#8a6d3b'],
    ['oasisclub', 'Kuwait Airways', 'Oasis Club', 'KW', '#0063af'],
    ['starbucks', 'Starbucks', 'Starbucks Rewards', 'US', '#00704a'], ['cvs', 'CVS Pharmacy', 'ExtraCare', 'US', '#cc0000'],
    ['walgreens', 'Walgreens', 'myWalgreens', 'US', '#e31837'], ['target', 'Target', 'Target Circle', 'US', '#cc0000'],
    ['delta', 'Delta', 'SkyMiles', 'US', '#003366'], ['united', 'United', 'MileagePlus', 'US', '#002244'],
    ['aa', 'American Airlines', 'AAdvantage', 'US', '#0078d2'], ['marriott', 'Marriott', 'Marriott Bonvoy', 'US', '#1c1c1c'],
    ['hilton', 'Hilton', 'Hilton Honors', 'US', '#104c97'], ['costco', 'Costco', 'Costco Membership', 'US', '#e31837'],
    ['tesco', 'Tesco', 'Clubcard', 'GB', '#00539f'], ['nectar', 'Nectar', 'Nectar card', 'GB', '#6f2c91'],
    ['boots', 'Boots', 'Advantage Card', 'GB', '#05054b'], ['ba', 'British Airways', 'The British Airways Club', 'GB', '#075aaa'],
    ['ikea', 'IKEA', 'IKEA Family', 'EU', '#0058a3'], ['lidl', 'Lidl', 'Lidl Plus', 'EU', '#0050aa'],
    ['milesmore', 'Lufthansa Group', 'Miles & More', 'EU', '#05164d'], ['flyingblue', 'Air France-KLM', 'Flying Blue', 'EU', '#0f2d69'],
    ['petrocanada', 'Petro-Canada', 'Petro-Points', 'CA', '#d52b1e'], ['flybuys', 'Flybuys', 'Flybuys', 'AU', '#0b4ea2']
  ]);

  add('gift', [
    ['pvrinox', 'PVR INOX Gift Card (India)', 'Cinema', 'IN', '#f7c600', '#1b1b1b'], ['dominos', 'Domino’s Gift Card (India)', 'Food', 'IN', '#006491'],
    ['westside', 'Westside Gift Card (India)', 'Fashion', 'IN', '#1a1a1a'], ['aurelia', 'Aurelia Gift Card (India)', 'Fashion', 'IN', '#d9732b'],
    ['w', 'W Gift Card (India)', 'Fashion', 'IN', '#b3262e'], ['amazonin', 'Amazon India', 'Shopping', 'IN', '#232f3e'],
    ['flipkart', 'Flipkart Gift Card', 'Shopping', 'IN', '#2874f0'], ['myntra', 'Myntra Gift Card', 'Fashion', 'IN', '#e72b6d'],
    ['tanishq', 'Tanishq Gift Card', 'Jewellery', 'IN', '#7a2230'], ['croma', 'Croma Gift Card', 'Electronics', 'IN', '#0b3d47'],
    ['starbucksin', 'Tata Starbucks Card', 'Coffee', 'IN', '#00704a'], ['bookmyshow', 'BookMyShow Gift Card', 'Entertainment', 'IN', '#c4242b'],
    ['amazonae', 'Amazon.ae', 'Shopping', 'AE', '#232f3e'], ['noon', 'noon', 'Shopping', 'AE', '#feee00', '#1b1b1b'],
    ['luluae', 'LuLu Gift Card', 'Supermarket', 'AE', '#0a8a3a'], ['vox', 'VOX Cinemas', 'Cinema', 'AE', '#d0021b'],
    ['carrefour', 'Carrefour', 'Supermarket', 'AE', '#004e9f'], ['jarir', 'Jarir Bookstore', 'Books & electronics', 'SA', '#d71920'],
    ['amazon', 'Amazon.com', 'Shopping', 'US', '#232f3e'], ['targetgc', 'Target GiftCard', 'Shopping', 'US', '#cc0000'],
    ['bestbuy', 'Best Buy', 'Electronics', 'US', '#0046be'], ['homedepot', 'The Home Depot', 'Home', 'US', '#f96302'],
    ['walmart', 'Walmart', 'Shopping', 'US', '#0071ce'], ['amc', 'AMC Theatres', 'Cinema', 'US', '#c8102e'],
    ['johnlewis', 'John Lewis & Partners', 'Shopping', 'GB', '#1a1a1a'], ['argos', 'Argos', 'Shopping', 'GB', '#d42114'],
    ['love2shop', 'Love2shop', 'Multi-store', 'GB', '#d4006f'], ['zalando', 'Zalando', 'Fashion', 'EU', '#ff6900']
  ]);

  const T = (id, label, sub, region, color, city, fg) => [id, label, sub, region, color, fg || null, { city }];
  add('transit', [
    T('hmrl', 'Hyderabad, Telangana, IN', 'Hyderabad Metro Rail Limited', 'IN', '#163f8f', 'Hyderabad'),
    T('kmrl', 'Kochi, Kerala, IN', 'Kochi Metro Rail Limited', 'IN', '#00a19a', 'Kochi'),
    T('upsrtc', 'Uttar Pradesh, IN', 'UPSRTC', 'IN', '#c8102e', 'Lucknow'),
    T('dmrc', 'Delhi, IN', 'Delhi Metro Rail Corporation', 'IN', '#cf3733', 'Delhi'),
    T('bmrcl', 'Bengaluru, Karnataka, IN', 'Namma Metro (BMRCL)', 'IN', '#7b2d8e', 'Bengaluru'),
    T('mumbaimetro', 'Mumbai, Maharashtra, IN', 'Mumbai Metro', 'IN', '#0b5394', 'Mumbai'),
    T('best', 'Mumbai, Maharashtra, IN', 'BEST buses', 'IN', '#b71c1c', 'Mumbai'),
    T('cmrl', 'Chennai, Tamil Nadu, IN', 'Chennai Metro Rail', 'IN', '#00843d', 'Chennai'),
    T('kolkata', 'Kolkata, West Bengal, IN', 'Kolkata Metro', 'IN', '#6d4c41', 'Kolkata'),
    T('rta', 'Dubai, AE', 'RTA · Nol card', 'AE', '#c8102e', 'Dubai'),
    T('itc', 'Abu Dhabi, AE', 'ITC · Hafilat card', 'AE', '#0b4f6c', 'Abu Dhabi'),
    T('srta', 'Sharjah, AE', 'Sharjah RTA', 'AE', '#1f6f50', 'Sharjah'),
    T('riyadh', 'Riyadh, SA', 'Riyadh Metro · Darb', 'SA', '#0b6e4f', 'Riyadh'),
    T('doha', 'Doha, QA', 'Doha Metro · Qatar Rail', 'QA', '#7a1f3d', 'Doha'),
    T('muscat', 'Muscat, OM', 'Mwasalat', 'OM', '#c8102e', 'Muscat'),
    T('bahrain', 'Manama, BH', 'Bahrain Public Transport · GO card', 'BH', '#d71920', 'Manama'),
    T('kptc', 'Kuwait City, KW', 'KPTC', 'KW', '#00539b', 'Kuwait City'),
    T('mta', 'New York, NY, US', 'MTA · OMNY', 'US', '#0039a6', 'New York'),
    T('cta', 'Chicago, IL, US', 'CTA · Ventra', 'US', '#00a1de', 'Chicago'),
    T('clipper', 'San Francisco Bay Area, CA, US', 'Clipper', 'US', '#1f5fa9', 'San Francisco'),
    T('wmata', 'Washington, DC, US', 'WMATA · SmarTrip', 'US', '#5a5a5a', 'Washington'),
    T('lametro', 'Los Angeles, CA, US', 'LA Metro · TAP', 'US', '#e16710', 'Los Angeles'),
    T('tfl', 'London, GB', 'Transport for London · Oyster', 'GB', '#0019a8', 'London'),
    T('tfgm', 'Manchester, GB', 'Bee Network', 'GB', '#ffcc00', 'Manchester', '#1b1b1b'),
    T('bvg', 'Berlin, DE', 'BVG', 'EU', '#f0d722', 'Berlin', '#1b1b1b'),
    T('idfm', 'Paris, FR', 'Île-de-France Mobilités · Navigo', 'EU', '#00aa91', 'Paris'),
    T('gvb', 'Amsterdam, NL', 'GVB', 'EU', '#0063d3', 'Amsterdam'),
    T('madrid', 'Madrid, ES', 'Metro de Madrid', 'EU', '#e3001b', 'Madrid'),
    T('presto', 'Toronto, ON, CA', 'PRESTO', 'CA', '#3b8c2a', 'Toronto'),
    T('opal', 'Sydney, NSW, AU', 'Opal', 'AU', '#1d1d1b', 'Sydney'),
    T('myki', 'Melbourne, VIC, AU', 'myki', 'AU', '#94b43b', 'Melbourne', '#1b1b1b'),
    T('ezlink', 'Singapore, SG', 'EZ-Link', 'SG', '#00539f', 'Singapore')
  ]);

  add('movie', [
    ['pvrinox', 'PVR INOX', 'Cinemas', 'IN', '#f7c600', '#1b1b1b'], ['cinepolis', 'Cinépolis', 'Cinemas', 'IN', '#003da5'],
    ['miraj', 'Miraj Cinemas', 'Cinemas', 'IN', '#b71c1c'], ['vox', 'VOX Cinemas', 'Cinemas', 'AE', '#d0021b'],
    ['reel', 'Reel Cinemas', 'Cinemas', 'AE', '#111111'], ['novo', 'Novo Cinemas', 'Cinemas', 'QA', '#4a148c'],
    ['muvi', 'Muvi Cinemas', 'Cinemas', 'SA', '#e6007e'], ['amc', 'AMC Theatres', 'Theatres', 'US', '#c8102e'],
    ['regal', 'Regal', 'Cinemas', 'US', '#8b0000'], ['cinemark', 'Cinemark', 'Theatres', 'US', '#d71920'],
    ['odeon', 'ODEON', 'Cinemas', 'GB', '#1b4f9c'], ['cineworld', 'Cineworld', 'Cinemas', 'GB', '#c2185b'],
    ['vue', 'Vue', 'Cinemas', 'GB', '#1a1a1a'], ['pathe', 'Pathé', 'Cinemas', 'EU', '#ffc600', '#1b1b1b']
  ]);

  const A_ = (id, name, iata, region, color, extra) => [id, name, iata, region, color, null, Object.assign({ iata }, extra || {})];
  add('flight', [
    A_('airindia', 'Air India', 'AI', 'IN', '#b5121b', { surface: '#f7f3ec', ink: '#1b1b1b', scene: 'city' }), A_('indigo', 'IndiGo', '6E', 'IN', '#001b94'),
    A_('akasa', 'Akasa Air', 'QP', 'IN', '#ff5e1f'), A_('spicejet', 'SpiceJet', 'SG', 'IN', '#d71920'), A_('aiexpress', 'Air India Express', 'IX', 'IN', '#e3530f'),
    A_('salamair', 'SalamAir', 'OV', 'OM', '#5f6a85', { scene: 'plane' }), A_('omanair', 'Oman Air', 'WY', 'OM', '#0b6b74'),
    A_('emirates', 'Emirates', 'EK', 'AE', '#c60c30'), A_('etihad', 'Etihad Airways', 'EY', 'AE', '#9c7a3c'),
    A_('flydubai', 'flydubai', 'FZ', 'AE', '#1c3e6e'), A_('airarabia', 'Air Arabia', 'G9', 'AE', '#d71920'),
    A_('qatar', 'Qatar Airways', 'QR', 'QA', '#5c0632'), A_('saudia', 'Saudia', 'SV', 'SA', '#006c35'),
    A_('flynas', 'flynas', 'XY', 'SA', '#0d8a8a'), A_('gulfair', 'Gulf Air', 'GF', 'BH', '#8a6d3b'), A_('kuwait', 'Kuwait Airways', 'KU', 'KW', '#0063af'),
    A_('delta', 'Delta Air Lines', 'DL', 'US', '#003366'), A_('united', 'United Airlines', 'UA', 'US', '#002244'),
    A_('american', 'American Airlines', 'AA', 'US', '#0078d2'), A_('southwest', 'Southwest Airlines', 'WN', 'US', '#304cb2'),
    A_('jetblue', 'JetBlue', 'B6', 'US', '#003876'), A_('alaska', 'Alaska Airlines', 'AS', 'US', '#01426a'),
    A_('ba', 'British Airways', 'BA', 'GB', '#075aaa'), A_('virgin', 'Virgin Atlantic', 'VS', 'GB', '#b0121b'), A_('easyjet', 'easyJet', 'U2', 'GB', '#ff6600'),
    A_('lufthansa', 'Lufthansa', 'LH', 'EU', '#05164d'), A_('airfrance', 'Air France', 'AF', 'EU', '#002157'), A_('klm', 'KLM', 'KL', 'EU', '#00a1de'),
    A_('ryanair', 'Ryanair', 'FR', 'EU', '#073590'), A_('turkish', 'Turkish Airlines', 'TK', 'EU', '#c70a0c'),
    A_('aircanada', 'Air Canada', 'AC', 'CA', '#d22630'), A_('qantas', 'Qantas', 'QF', 'AU', '#e40000'), A_('singapore', 'Singapore Airlines', 'SQ', 'SG', '#1d2b5b')
  ]);

  add('train', [
    ['ir', 'Indian Railways', 'IRCTC', 'IN', '#1d3e8a'], ['namobharat', 'Namo Bharat', 'NCRTC', 'IN', '#2b3a8c'],
    ['hhr', 'Haramain High Speed Railway', 'SAR', 'SA', '#9a7b3f'], ['sar', 'Saudi Arabia Railways', 'SAR', 'SA', '#00664f'],
    ['amtrak', 'Amtrak', '', 'US', '#1a5185'], ['via', 'VIA Rail', '', 'CA', '#ffc72c', '#1b1b1b'],
    ['lner', 'LNER', '', 'GB', '#ce0e2d'], ['gwr', 'Great Western Railway', '', 'GB', '#0b3b2e'], ['avanti', 'Avanti West Coast', '', 'GB', '#004354'],
    ['db', 'Deutsche Bahn', '', 'EU', '#ec0016'], ['sncf', 'SNCF Voyageurs', '', 'EU', '#3d2b8c'], ['trenitalia', 'Trenitalia', '', 'EU', '#006a3b'],
    ['renfe', 'Renfe', '', 'EU', '#6b1f5c'], ['ns', 'NS', '', 'EU', '#ffc917', '#003082'], ['sbb', 'SBB CFF FFS', '', 'EU', '#eb0000'],
    ['eurostar', 'Eurostar', '', 'EU', '#1a2142']
  ]);

  add('bus', [
    ['upsrtc', 'UPSRTC', 'Uttar Pradesh', 'IN', '#c8102e'], ['msrtc', 'MSRTC', 'Maharashtra', 'IN', '#b5121b'],
    ['ksrtc', 'KSRTC', 'Karnataka', 'IN', '#d71920'], ['tgsrtc', 'TGSRTC', 'Telangana', 'IN', '#0d47a1'],
    ['redbus', 'redBus', 'Bus tickets', 'IN', '#d84e55'], ['intrcity', 'IntrCity SmartBus', 'Intercity', 'IN', '#2e2a72'],
    ['saptco', 'SAPTCO', 'Saudi Arabia', 'SA', '#006c35'], ['mwasalat', 'Mwasalat', 'Oman', 'OM', '#c8102e'],
    ['rtabus', 'RTA Intercity', 'Dubai', 'AE', '#c8102e'], ['greyhound', 'Greyhound', 'US', 'US', '#0067b1'],
    ['flixbus', 'FlixBus', 'Europe', 'EU', '#73d700', '#0b2e00'], ['megabus', 'megabus', 'UK', 'GB', '#002e5d'],
    ['nationalexpress', 'National Express', 'UK', 'GB', '#c8102e']
  ]);

  add('ferry', [
    ['dubaiferry', 'Dubai Ferry', 'RTA', 'AE', '#0b5d8f'], ['kswtd', 'Kerala State Water Transport', 'Kerala', 'IN', '#1565c0'],
    ['pando', 'P&O Ferries', 'UK', 'GB', '#00205b'], ['dfds', 'DFDS', 'Europe', 'EU', '#002b45'], ['stena', 'Stena Line', 'Europe', 'EU', '#003b7a'],
    ['bcferries', 'BC Ferries', 'Canada', 'CA', '#003a70'], ['wsf', 'Washington State Ferries', 'US', 'US', '#00664f'],
    ['msc', 'MSC Cruises', 'Cruise', 'EU', '#0a2240'], ['royalcaribbean', 'Royal Caribbean', 'Cruise', 'US', '#00296b']
  ]);

  add('event', [
    ['bookmyshow', 'BookMyShow', 'Tickets', 'IN', '#c4242b'], ['district', 'District', 'Tickets', 'IN', '#111111'],
    ['platinumlist', 'Platinumlist', 'Tickets', 'AE', '#1a1a2e'], ['ticketmaster', 'Ticketmaster', 'Tickets', 'US', '#026cdf'],
    ['ticketmasteruk', 'Ticketmaster UK', 'Tickets', 'GB', '#026cdf'], ['axs', 'AXS', 'Tickets', 'US', '#0d1c3d'],
    ['seatgeek', 'SeatGeek', 'Tickets', 'US', '#ff5b49'], ['eventbrite', 'Eventbrite', 'Tickets', 'XX', '#d1410c'],
    ['eventim', 'Eventim', 'Tickets', 'EU', '#002b5c']
  ]);

  add('hotel', [
    ['taj', 'Taj Hotels', 'IHCL', 'IN', '#7a5c2e'], ['oberoi', 'The Oberoi Group', '', 'IN', '#1a1a1a'], ['itc', 'ITC Hotels', '', 'IN', '#6d4c41'],
    ['oyo', 'OYO', '', 'IN', '#ee2a24'], ['jumeirah', 'Jumeirah', '', 'AE', '#9e8a5b'], ['rotana', 'Rotana', '', 'AE', '#6b2d5c'],
    ['marriott', 'Marriott', 'Bonvoy', 'US', '#1c1c1c'], ['hilton', 'Hilton', '', 'US', '#104c97'], ['hyatt', 'Hyatt', '', 'US', '#2a2a2a'],
    ['ihg', 'IHG Hotels & Resorts', '', 'GB', '#2d2d2d'], ['accor', 'Accor', 'ALL', 'EU', '#050033'], ['booking', 'Booking.com', '', 'EU', '#003580']
  ]);

  add('parking', [
    ['parkplus', 'Park+', '', 'IN', '#4a2fbd'], ['rtaparking', 'RTA Parking', 'Dubai', 'AE', '#c8102e'], ['parkin', 'Parkin', 'Dubai', 'AE', '#0a7d5a'],
    ['spothero', 'SpotHero', '', 'US', '#c2185b'], ['parkmobile', 'ParkMobile', '', 'US', '#1b75bb'],
    ['justpark', 'JustPark', '', 'GB', '#00b67a'], ['ringgo', 'RingGo', '', 'GB', '#0072ce'], ['apcoa', 'APCOA', '', 'EU', '#003b6f']
  ]);

  add('taxi', [
    ['uber', 'Uber', 'Rides', 'XX', '#000000'], ['careem', 'Careem', 'Rides', 'AE', '#1ab35a'], ['dubaitaxi', 'Dubai Taxi', 'RTA', 'AE', '#c8102e'],
    ['ola', 'Ola', 'Rides', 'IN', '#1c1c1c'], ['rapido', 'Rapido', 'Rides', 'IN', '#f9c933', '#1b1b1b'], ['bolt', 'Bolt', 'Rides', 'EU', '#34d186', '#0b2e1a'],
    ['lyft', 'Lyft', 'Rides', 'US', '#ff00bf'], ['indrive', 'inDrive', 'Rides', 'XX', '#c1f11d', '#1b1b1b'], ['otaxi', 'OTaxi', 'Oman', 'OM', '#00a0b0']
  ]);

  add('entry', [
    ['asi', 'Archaeological Survey of India', 'Monuments', 'IN', '#7a4b2a'], ['burjkhalifa', 'Burj Khalifa At the Top', 'Attraction', 'AE', '#1f2d3d'],
    ['motf', 'Museum of the Future', 'Museum', 'AE', '#2b2b2b'], ['louvre', 'Musée du Louvre', 'Museum', 'EU', '#3b3b3b'],
    ['britishmuseum', 'British Museum', 'Museum', 'GB', '#1a1a1a'], ['expocity', 'Expo City Dubai', 'Attraction', 'AE', '#e05a2b']
  ]);

  add('amusement', [
    ['wonderla', 'Wonderla', 'Amusement park', 'IN', '#e4002b'], ['imagica', 'Imagicaa', 'Theme park', 'IN', '#5b2d8e'],
    ['ferrariworld', 'Ferrari World Abu Dhabi', 'Theme park', 'AE', '#d40000'], ['imgworlds', 'IMG Worlds of Adventure', 'Theme park', 'AE', '#e5007e'],
    ['wbworld', 'Warner Bros. World Abu Dhabi', 'Theme park', 'AE', '#0b4ea2'], ['yaswater', 'Yas Waterworld', 'Water park', 'AE', '#00a3e0'],
    ['sixflags', 'Six Flags', 'Theme park', 'US', '#1d3c8f'], ['legoland', 'LEGOLAND', 'Theme park', 'XX', '#e3000b']
  ]);

  // ---- Card networks and IIN rules ------------------------------------------
  // Prefix rules for the payment network only (public ranges published by
  // the networks). Longest matching prefix wins.
  const NETWORKS = [
    { id: 'visa', name: 'Visa', ranges: ['4'] },
    { id: 'mastercard', name: 'Mastercard', ranges: ['51-55', '2221-2720'] },
    { id: 'amex', name: 'American Express', ranges: ['34', '37'] },
    { id: 'discover', name: 'Discover', ranges: ['6011', '644-649', '65'] },
    // RuPay-JCB co-branded cards (353x, 356x) fall inside the JCB range and are shown as JCB.
    { id: 'rupay', name: 'RuPay', ranges: ['60', '6521', '6522', '508', '81', '82'] },
    { id: 'jcb', name: 'JCB', ranges: ['3528-3589'] },
    { id: 'unionpay', name: 'UnionPay', ranges: ['62'] },
    { id: 'diners', name: 'Diners Club', ranges: ['36', '300-305', '38-39'] },
    { id: 'maestro', name: 'Maestro', ranges: ['50', '56-58', '639', '67'] }
  ];

  // ---- Card issuers ----------------------------------------------------------
  // `iins`: verified issuer IIN prefixes. None are bundled (no licensed BIN
  // source was available); issuer matches come from the person's choice or
  // from prefixes they confirmed on this device. Product names are public;
  // the artwork drawn for them is an Open Wallet design in the issuer's
  // colours, not the bank's own card face.
  const ISSUERS = [];
  const bank = (country, id, name, c1, c2, fg, products, extra) => ISSUERS.push(Object.assign({
    id, name, country, colors: [c1, c2 || c1], fg: fg || '#ffffff', iins: [], art: ART_SOURCE, aliases: [],
    products: (products || []).map(([pid, pname, tier, networks]) => ({ id: pid, name: pname, tier: tier || 'mid', networks: networks || [] }))
  }, extra || {}));

  bank('IN', 'axis', 'Axis Bank', '#97144d', '#5a0c2e', null, [['magnus', 'Magnus', 'premium', ['visa', 'mastercard']], ['atlas', 'Atlas', 'mid', ['visa']], ['ace', 'ACE', 'entry', ['visa']], ['flipkart', 'Flipkart Axis Bank', 'entry', ['visa', 'mastercard']]]);
  bank('IN', 'hdfc', 'HDFC Bank', '#004c8f', '#002a55', null, [['infinia', 'Infinia', 'premium', ['visa', 'mastercard']], ['dcb', 'Diners Club Black', 'premium', ['diners']], ['regalia', 'Regalia Gold', 'mid', ['visa', 'mastercard']], ['millennia', 'Millennia', 'entry', ['visa', 'mastercard', 'rupay']], ['moneyback', 'MoneyBack+', 'entry', ['visa', 'mastercard', 'rupay']]]);
  bank('IN', 'icici', 'ICICI Bank', '#b02a30', '#f37e20', null, [['emeralde', 'Emeralde Private Metal', 'premium', ['visa']], ['sapphiro', 'Sapphiro', 'mid', ['visa', 'mastercard']], ['rubyx', 'Rubyx', 'mid', ['visa', 'mastercard']], ['coral', 'Coral', 'entry', ['visa', 'mastercard', 'rupay']], ['amazonpay', 'Amazon Pay ICICI', 'entry', ['visa']]]);
  bank('IN', 'sbi', 'SBI Card', '#22409a', '#00b5ef', null, [['elite', 'SBI Card ELITE', 'premium', ['visa', 'mastercard']], ['prime', 'SBI Card PRIME', 'mid', ['visa', 'mastercard']], ['simplyclick', 'SimplyCLICK', 'entry', ['visa', 'mastercard']], ['cashback', 'Cashback SBI Card', 'entry', ['visa']]], { aliases: ['State Bank of India', 'SBI'] });
  bank('IN', 'kotak', 'Kotak Mahindra Bank', '#003874', '#ed1c24', null, [['white', 'White', 'premium'], ['league', 'League Platinum', 'mid'], ['811', '811 Debit', 'entry']], { aliases: ['Kotak'] });
  bank('IN', 'idfcfirst', 'IDFC FIRST Bank', '#9c1d26', '#5e0f15', null, [['wealth', 'Wealth', 'premium'], ['select', 'Select', 'mid'], ['millennia', 'Millennia', 'entry'], ['classic', 'Classic', 'entry']]);
  bank('IN', 'indusind', 'IndusInd Bank', '#8b1f3f', '#4a0f22', null, [['pinnacle', 'Pinnacle', 'premium'], ['legend', 'Legend', 'mid'], ['tiger', 'Tiger', 'entry']]);
  bank('IN', 'federal', 'Federal Bank', '#004a8f', '#f4a21d', null, [['celesta', 'Celesta', 'premium'], ['signet', 'Signet', 'mid'], ['scapia', 'Scapia Federal', 'entry']]);
  bank('IN', 'bob', 'Bank of Baroda', '#f15a29', '#a8360f', null, [['eterna', 'Eterna', 'premium'], ['premier', 'Premier', 'mid'], ['easy', 'Easy', 'entry']], { aliases: ['BOB', 'Baroda'] });
  bank('IN', 'pnb', 'Punjab National Bank', '#a20a3a', '#fbb040', null, [['select', 'RuPay Select', 'mid', ['rupay']], ['wave', 'Wave', 'entry']], { aliases: ['PNB'] });
  bank('IN', 'yes', 'Yes Bank', '#00518f', '#002f55', null, [['marquee', 'Marquee', 'premium'], ['reserv', 'Reserv', 'mid'], ['prosperity', 'Prosperity', 'entry']]);
  bank('IN', 'au', 'AU Small Finance Bank', '#6d2077', '#f37021', null, [['zenith', 'Zenith', 'premium'], ['vetta', 'Vetta', 'mid'], ['lit', 'LIT', 'entry']], { aliases: ['AU Bank'] });
  bank('IN', 'rbl', 'RBL Bank', '#21409a', '#0d1f55', null, [['insignia', 'Insignia', 'premium'], ['worldsafari', 'World Safari', 'mid'], ['shoprite', 'ShopRite', 'entry']]);
  bank('IN', 'canara', 'Canara Bank', '#0091d5', '#ffd200', null, [['classic', 'Classic Debit', 'entry']]);
  bank('AE', 'enbd', 'Emirates NBD', '#00205b', '#f7941d', null, [['skywardsinfinite', 'Skywards Infinite', 'premium', ['visa']], ['marriott', 'Marriott Bonvoy World Elite', 'premium', ['mastercard']], ['uemaar', 'U By Emaar', 'mid'], ['duo', 'Duo', 'mid']]);
  bank('AE', 'fab', 'First Abu Dhabi Bank', '#001f5c', '#5a8dd6', null, [['elite', 'Elite', 'premium'], ['etihad', 'Etihad Guest', 'mid'], ['cashback', 'Cashback', 'entry']], { aliases: ['FAB'] });
  bank('AE', 'adcb', 'ADCB', '#e31b23', '#8f0d12', null, [['traveller', 'Traveller', 'mid'], ['touchpoints', 'TouchPoints', 'entry'], ['365', '365 Cashback', 'entry']], { aliases: ['Abu Dhabi Commercial Bank'] });
  bank('AE', 'dib', 'Dubai Islamic Bank', '#005b3f', '#00331f', null, [['prime', 'Prime', 'premium'], ['shams', 'SHAMS', 'mid'], ['consumer', 'Consumer', 'entry']], { aliases: ['DIB'] });
  bank('AE', 'mashreq', 'Mashreq', '#f26a21', '#a6400d', null, [['solitaire', 'Solitaire', 'premium'], ['noon', 'noon', 'mid'], ['cashback', 'Cashback', 'entry']]);
  bank('AE', 'rakbank', 'RAKBANK', '#ed1c24', '#7d0a0f', null, [['world', 'World', 'premium'], ['airarabia', 'Air Arabia', 'mid'], ['titanium', 'Titanium', 'entry']]);
  bank('AE', 'adib', 'Abu Dhabi Islamic Bank', '#0072bc', '#003e6b', null, [['etihad', 'Etihad Guest', 'mid'], ['cashback', 'Cashback', 'entry']], { aliases: ['ADIB'] });
  bank('AE', 'cbd', 'Commercial Bank of Dubai', '#005eb8', '#00a651', null, [['one', 'One', 'mid'], ['supersaver', 'Super Saver', 'entry']], { aliases: ['CBD'] });
  bank('QA', 'qnb', 'QNB', '#5c2d6e', '#2e1438', null, []);
  bank('QA', 'cbq', 'Commercial Bank of Qatar', '#e30613', '#7d050c', null, [], { aliases: ['CBQ'] });
  bank('SA', 'snb', 'Saudi National Bank', '#006a4d', '#003827', null, [], { aliases: ['SNB', 'AlAhli'] });
  bank('SA', 'alrajhi', 'Al Rajhi Bank', '#004b87', '#00284a', null, []);
  bank('SA', 'riyad', 'Riyad Bank', '#004c97', '#c8a24a', null, []);
  bank('OM', 'bankmuscat', 'Bank Muscat', '#e31837', '#7a0c1d', null, []);
  bank('OM', 'nbo', 'National Bank of Oman', '#1d3f74', '#b48c3e', null, [], { aliases: ['NBO'] });
  bank('KW', 'kfh', 'Kuwait Finance House', '#006747', '#003524', null, [], { aliases: ['KFH'] });
  bank('BH', 'nbb', 'National Bank of Bahrain', '#c8102e', '#6e0918', null, [], { aliases: ['NBB'] });
  bank('US', 'chase', 'Chase', '#117aca', '#0a4c80', null, [['sapphirereserve', 'Sapphire Reserve', 'premium', ['visa']], ['sapphirepreferred', 'Sapphire Preferred', 'mid', ['visa']], ['freedom', 'Freedom Unlimited', 'entry', ['visa']]]);
  bank('US', 'bofa', 'Bank of America', '#012169', '#e31837', null, [['premiumrewards', 'Premium Rewards', 'premium', ['visa']], ['customizedcash', 'Customized Cash Rewards', 'entry', ['visa']], ['travel', 'Travel Rewards', 'entry', ['visa']]]);
  bank('US', 'wellsfargo', 'Wells Fargo', '#b31b1b', '#ffcd41', null, [['autograph', 'Autograph', 'mid', ['visa']], ['activecash', 'Active Cash', 'entry', ['visa']]]);
  bank('US', 'capitalone', 'Capital One', '#004879', '#d03027', null, [['venturex', 'Venture X', 'premium', ['visa']], ['savor', 'Savor', 'mid', ['mastercard']], ['quicksilver', 'Quicksilver', 'entry', ['visa', 'mastercard']]]);
  bank('US', 'citi', 'Citi', '#003b70', '#056dae', null, [['strata', 'Strata Premier', 'premium', ['mastercard']], ['doublecash', 'Double Cash', 'entry', ['mastercard']], ['customcash', 'Custom Cash', 'entry', ['mastercard']]]);
  bank('US', 'amex', 'American Express', '#006fcf', '#00175a', null, [['platinum', 'Platinum Card', 'premium', ['amex']], ['gold', 'Gold Card', 'mid', ['amex']], ['green', 'Green Card', 'mid', ['amex']], ['bluecash', 'Blue Cash', 'entry', ['amex']]], { networkLocked: 'amex' });
  bank('US', 'discover', 'Discover', '#ff6000', '#b33f00', null, [['it', 'Discover it', 'entry', ['discover']]], { networkLocked: 'discover' });
  bank('GB', 'hsbc', 'HSBC', '#db0011', '#7a0009', null, [['premier', 'Premier', 'premium'], ['advance', 'Advance', 'mid']]);
  bank('GB', 'barclays', 'Barclays', '#00aeef', '#00395d', null, [['avios', 'Barclaycard Avios', 'mid', ['mastercard']], ['rewards', 'Barclaycard Rewards', 'entry', ['visa']]], { aliases: ['Barclaycard'] });
  bank('GB', 'stanchart', 'Standard Chartered', '#0473ea', '#38d200', null, [['ultimate', 'Ultimate', 'premium'], ['smart', 'Smart', 'entry']], { aliases: ['StanChart'] });
  bank('GB', 'lloyds', 'Lloyds Bank', '#006a4d', '#003a2a', null, [['avios', 'Avios Rewards', 'mid'], ['platinum', 'Platinum', 'entry']]);
  bank('GB', 'santander', 'Santander', '#ec0000', '#8a0000', null, [['edge', 'Edge', 'mid'], ['allinone', 'All in One', 'entry']]);
  bank('GB', 'monzo', 'Monzo', '#ff4f40', '#14233c', null, [['debit', 'Debit', 'entry', ['mastercard']]]);
  bank('EU', 'ing', 'ING', '#ff6200', '#a03c00', null, []);
  bank('EU', 'bnp', 'BNP Paribas', '#00915a', '#004d2f', null, []);
  bank('EU', 'deutsche', 'Deutsche Bank', '#0018a8', '#000c55', null, []);
  bank('EU', 'n26', 'N26', '#36a18b', '#1b5146', null, []);
  bank('EU', 'revolut', 'Revolut', '#191c1f', '#4f55f1', null, []);
  bank('CA', 'rbc', 'RBC Royal Bank', '#005daa', '#ffd200', null, []);
  bank('CA', 'td', 'TD Bank', '#008a00', '#004d00', null, []);
  bank('AU', 'commbank', 'CommBank', '#ffcc00', '#e0a800', '#1b1b1b', []);

  // ---- Identity, health and vehicle documents --------------------------------
  // group: identity | health | vehicle. `pattern` checks the format only; it
  // never proves a document is genuine. `official` links to the issuer's own
  // site (opened in the browser, never scraped).
  const DOCS = [];
  const doc = (region, id, name, group, o) => DOCS.push(Object.assign({
    id: `${region}.${id}`, region, name, group, authority: '', numberLabel: 'Document number', sides: 2, expiry: true,
    sensitivity: 'high', color: '#3c4a5c', official: null, fields: [], mask: 'last4'
  }, o));
  const OFF = (label, url) => ({ label, url });

  doc('IN', 'aadhaar', 'Aadhaar', 'identity', { authority: 'UIDAI', numberLabel: 'Aadhaar number', pattern: '^\\d{12}$', check: 'verhoeff', expiry: false, sensitivity: 'very-high', color: '#5b3f8c', sub: 'Add a digital Aadhaar', official: OFF('Get your e-Aadhaar from UIDAI', 'https://myaadhaar.uidai.gov.in/'), fields: ['dob', 'gender', 'address'] });
  doc('IN', 'maadhaar', 'Masked Aadhaar', 'identity', { authority: 'UIDAI', numberLabel: 'Last 4 digits', pattern: '^\\d{4}$', mask: 'none', expiry: false, sensitivity: 'very-high', color: '#5b3f8c', official: OFF('Download masked Aadhaar from UIDAI', 'https://myaadhaar.uidai.gov.in/') });
  doc('IN', 'pan', 'PAN card', 'identity', { authority: 'Income Tax Department', numberLabel: 'PAN', pattern: '^[A-Z]{5}\\d{4}[A-Z]$', sides: 1, expiry: false, sensitivity: 'very-high', color: '#1f5e8c', official: OFF('Get e-PAN from the Income Tax Department', 'https://www.incometax.gov.in/'), fields: ['dob', 'father'] });
  doc('IN', 'dl', 'Driving licence', 'identity', { authority: 'State transport department', numberLabel: 'Licence number', pattern: '^[A-Z]{2}[-\\s]?\\d{2}[-\\s]?\\d{11}$', color: '#1e6b52', official: OFF('DigiLocker (official)', 'https://www.digilocker.gov.in/'), fields: ['dob', 'classes', 'validTo'] });
  doc('IN', 'voter', 'Voter ID (EPIC)', 'identity', { authority: 'Election Commission of India', numberLabel: 'EPIC number', pattern: '^[A-Z]{3}\\d{7}$', expiry: false, color: '#6b4f2a', official: OFF('Download e-EPIC from ECI', 'https://voters.eci.gov.in/') });
  doc('IN', 'passport', 'Passport', 'identity', { authority: 'Ministry of External Affairs', numberLabel: 'Passport number', pattern: '^[A-Z]\\d{7}$', sensitivity: 'very-high', color: '#1b2f5e', fields: ['dob', 'nationality', 'validTo'] });
  doc('IN', 'ration', 'Ration card', 'identity', { authority: 'State food & civil supplies department', numberLabel: 'Ration card number', expiry: false, color: '#7a5a1e' });
  doc('IN', 'abha', 'ABHA health ID', 'health', { authority: 'National Health Authority', numberLabel: 'ABHA number', pattern: '^\\d{2}-?\\d{4}-?\\d{4}-?\\d{4}$', expiry: false, sides: 1, sensitivity: 'very-high', color: '#1f6f8b', sub: 'Book appointments and get medicare access', official: OFF('Create or download your ABHA card (NHA)', 'https://abha.abdm.gov.in/'), fields: ['abhaAddress'] });
  doc('IN', 'cghs', 'CGHS card', 'health', { authority: 'Ministry of Health and Family Welfare', numberLabel: 'Beneficiary ID', color: '#1f6f8b' });
  doc('IN', 'healthins', 'Health insurance card', 'health', { authority: 'Your insurer', numberLabel: 'Policy or member number', color: '#2b7a5b' });
  doc('IN', 'rc', 'Vehicle registration (RC)', 'vehicle', { authority: 'Regional Transport Office', numberLabel: 'Registration number', pattern: '^[A-Z]{2}\\s?\\d{1,2}\\s?[A-Z]{0,3}\\s?\\d{4}$', mask: 'none', color: '#3c4a5c', official: OFF('Parivahan (official)', 'https://parivahan.gov.in/'), fields: ['makeModel', 'validTo'] });
  doc('IN', 'motorins', 'Vehicle insurance', 'vehicle', { authority: 'Your insurer', numberLabel: 'Policy number', color: '#2b5a7a', fields: ['vehicleNo', 'validTo'] });
  doc('IN', 'puc', 'PUC certificate', 'vehicle', { authority: 'Authorised PUC centre', numberLabel: 'Certificate number', mask: 'none', sides: 1, color: '#4c6b2f', fields: ['vehicleNo', 'validTo'] });

  doc('AE', 'eid', 'Emirates ID', 'identity', { authority: 'Federal Authority for Identity, Citizenship, Customs & Port Security', numberLabel: 'ID number', pattern: '^784-?\\d{4}-?\\d{7}-?\\d$', sensitivity: 'very-high', color: '#2e5e4e', official: OFF('UAE PASS (official digital identity)', 'https://uaepass.ae/') });
  doc('AE', 'dl', 'UAE driving licence', 'identity', { authority: 'Licensing authority (RTA, ADP…)', numberLabel: 'Licence number', color: '#7a3b2e' });
  doc('AE', 'mulkiya', 'Vehicle registration (Mulkiya)', 'vehicle', { authority: 'Licensing authority', numberLabel: 'Plate number', mask: 'none', color: '#3c4a5c', fields: ['makeModel', 'validTo'] });
  doc('AE', 'residence', 'Residence visa', 'identity', { authority: 'ICP / GDRFA', numberLabel: 'File number', sensitivity: 'very-high', sides: 1, color: '#5a4a2e' });
  doc('AE', 'healthins', 'Health insurance card', 'health', { authority: 'Your insurer', numberLabel: 'Member number', color: '#2b7a5b' });
  doc('SA', 'nid', 'Saudi national ID', 'identity', { authority: 'Ministry of Interior', numberLabel: 'ID number', pattern: '^1\\d{9}$', sensitivity: 'very-high', color: '#1e5b3a', official: OFF('Absher (official)', 'https://www.absher.sa/') });
  doc('SA', 'iqama', 'Iqama (resident ID)', 'identity', { authority: 'Ministry of Interior', numberLabel: 'Iqama number', pattern: '^2\\d{9}$', sensitivity: 'very-high', color: '#2e4a6b', official: OFF('Absher (official)', 'https://www.absher.sa/') });
  doc('SA', 'dl', 'Saudi driving licence', 'identity', { authority: 'Ministry of Interior', numberLabel: 'Licence number', color: '#7a3b2e' });
  doc('SA', 'istimara', 'Vehicle registration (Istimara)', 'vehicle', { authority: 'Ministry of Interior', numberLabel: 'Plate or serial number', mask: 'none', color: '#3c4a5c' });
  doc('QA', 'qid', 'Qatar ID', 'identity', { authority: 'Ministry of Interior', numberLabel: 'QID number', pattern: '^\\d{11}$', sensitivity: 'very-high', color: '#5c0632' });
  doc('QA', 'dl', 'Qatar driving licence', 'identity', { authority: 'Ministry of Interior', numberLabel: 'Licence number', color: '#7a3b2e' });
  doc('KW', 'civil', 'Kuwait Civil ID', 'identity', { authority: 'PACI', numberLabel: 'Civil ID number', pattern: '^\\d{12}$', sensitivity: 'very-high', color: '#00539b' });
  doc('KW', 'dl', 'Kuwait driving licence', 'identity', { authority: 'Ministry of Interior', numberLabel: 'Licence number', color: '#7a3b2e' });
  doc('BH', 'cpr', 'Bahrain CPR card', 'identity', { authority: 'Information & eGovernment Authority', numberLabel: 'CPR number', pattern: '^\\d{9}$', sensitivity: 'very-high', color: '#a3132b' });
  doc('BH', 'dl', 'Bahrain driving licence', 'identity', { authority: 'General Directorate of Traffic', numberLabel: 'Licence number', color: '#7a3b2e' });
  doc('OM', 'civil', 'Oman resident card / civil ID', 'identity', { authority: 'Royal Oman Police', numberLabel: 'Civil number', sensitivity: 'very-high', color: '#8b1a2b' });
  doc('OM', 'dl', 'Oman driving licence', 'identity', { authority: 'Royal Oman Police', numberLabel: 'Licence number', color: '#7a3b2e' });

  doc('US', 'dl', 'State driver’s license', 'identity', { authority: 'State DMV', numberLabel: 'License number', color: '#2e4a6b', fields: ['state', 'classes', 'validTo'] });
  doc('US', 'stateid', 'State ID card', 'identity', { authority: 'State DMV', numberLabel: 'ID number', color: '#3b5a7a', fields: ['state'] });
  doc('US', 'passport', 'U.S. passport', 'identity', { authority: 'U.S. Department of State', numberLabel: 'Passport number', sensitivity: 'very-high', color: '#1b2f5e' });
  doc('US', 'greencard', 'Permanent Resident Card', 'identity', { authority: 'USCIS', numberLabel: 'USCIS number', sensitivity: 'very-high', color: '#2b6b4f' });
  doc('US', 'ssn', 'Social Security card', 'identity', { authority: 'Social Security Administration', numberLabel: 'SSN', pattern: '^\\d{3}-?\\d{2}-?\\d{4}$', sides: 1, expiry: false, sensitivity: 'very-high', color: '#46546b', warn: 'Very sensitive. Only keep a copy here if you really need it.' });
  doc('US', 'medicare', 'Medicare card', 'health', { authority: 'CMS', numberLabel: 'Medicare number (MBI)', expiry: false, color: '#1f5e8c' });
  doc('US', 'healthins', 'Health insurance card', 'health', { authority: 'Your insurer', numberLabel: 'Member ID', color: '#2b7a5b' });
  doc('US', 'reg', 'Vehicle registration', 'vehicle', { authority: 'State DMV', numberLabel: 'Plate number', mask: 'none', color: '#3c4a5c' });
  doc('US', 'title', 'Vehicle title', 'vehicle', { authority: 'State DMV', numberLabel: 'Title number', expiry: false, sides: 1, color: '#4a4a5c' });
  doc('US', 'autoins', 'Auto insurance card', 'vehicle', { authority: 'Your insurer', numberLabel: 'Policy number', color: '#2b5a7a' });
  doc('CA', 'dl', 'Provincial driver’s licence', 'identity', { authority: 'Provincial licensing office', numberLabel: 'Licence number', color: '#7a2e2e' });
  doc('CA', 'health', 'Provincial health card', 'health', { authority: 'Provincial health ministry', numberLabel: 'Health number', color: '#2b7a5b' });
  doc('GB', 'dl', 'UK driving licence', 'identity', { authority: 'DVLA / DVA', numberLabel: 'Licence number', color: '#c2185b' });
  doc('GB', 'passport', 'UK passport', 'identity', { authority: 'HM Passport Office', numberLabel: 'Passport number', sensitivity: 'very-high', color: '#5c1a33' });
  doc('GB', 'brp', 'Residence permit', 'identity', { authority: 'Home Office', numberLabel: 'Document number', sensitivity: 'very-high', color: '#2e4a6b' });
  doc('GB', 'nhs', 'NHS number', 'health', { authority: 'NHS', numberLabel: 'NHS number', pattern: '^\\d{3}\\s?\\d{3}\\s?\\d{4}$', expiry: false, sides: 1, color: '#005eb8' });
  doc('GB', 'ghic', 'GHIC / EHIC', 'health', { authority: 'NHS Business Services Authority', numberLabel: 'Card number', sides: 1, color: '#003399' });
  doc('GB', 'v5c', 'Vehicle log book (V5C)', 'vehicle', { authority: 'DVLA', numberLabel: 'Registration number', mask: 'none', expiry: false, color: '#3c4a5c' });
  doc('EU', 'nid', 'National identity card', 'identity', { authority: 'National authority', numberLabel: 'Card number', sensitivity: 'very-high', color: '#2e4a6b' });
  doc('EU', 'dl', 'EU driving licence', 'identity', { authority: 'National licensing authority', numberLabel: 'Licence number', color: '#c2185b' });
  doc('EU', 'residence', 'Residence permit', 'identity', { authority: 'National immigration authority', numberLabel: 'Permit number', sensitivity: 'very-high', color: '#3b5a7a' });
  doc('EU', 'ehic', 'European Health Insurance Card', 'health', { authority: 'National health insurer', numberLabel: 'Card number', sides: 1, color: '#003399' });
  doc('EU', 'reg', 'Vehicle registration certificate', 'vehicle', { authority: 'National vehicle authority', numberLabel: 'Registration number', mask: 'none', color: '#3c4a5c' });
  doc('AU', 'dl', 'State driver licence', 'identity', { authority: 'State transport authority', numberLabel: 'Licence number', color: '#2e6b4a' });
  doc('AU', 'medicare', 'Medicare card', 'health', { authority: 'Services Australia', numberLabel: 'Medicare number', color: '#1f6f3b' });
  // Generic types, offered in every region.
  doc('XX', 'passport', 'Passport', 'identity', { authority: 'Issuing country', numberLabel: 'Passport number', sensitivity: 'very-high', color: '#1b2f5e' });
  doc('XX', 'nid', 'National ID card', 'identity', { authority: 'Issuing authority', numberLabel: 'ID number', sensitivity: 'very-high', color: '#2e4a6b' });
  doc('XX', 'dl', 'Driving licence', 'identity', { authority: 'Issuing authority', numberLabel: 'Licence number', color: '#7a3b2e' });
  doc('XX', 'residence', 'Residence permit', 'identity', { authority: 'Issuing authority', numberLabel: 'Permit number', sensitivity: 'very-high', color: '#3b5a7a' });
  doc('XX', 'student', 'Student or university ID', 'identity', { authority: 'School or university', numberLabel: 'Student number', mask: 'none', color: '#4a3b7a' });
  doc('XX', 'employee', 'Employee badge', 'identity', { authority: 'Employer', numberLabel: 'Employee number', mask: 'none', sides: 1, color: '#46546b' });
  doc('XX', 'health', 'Health insurance card', 'health', { authority: 'Insurer', numberLabel: 'Member number', color: '#2b7a5b' });
  doc('XX', 'vaccination', 'Vaccination record', 'health', { authority: 'Health provider', numberLabel: 'Record number', mask: 'none', expiry: false, color: '#2b6b7a' });
  doc('XX', 'vreg', 'Vehicle registration', 'vehicle', { authority: 'Vehicle authority', numberLabel: 'Registration number', mask: 'none', color: '#3c4a5c' });
  doc('XX', 'vins', 'Vehicle insurance', 'vehicle', { authority: 'Insurer', numberLabel: 'Policy number', color: '#2b5a7a' });
  doc('XX', 'other', 'Other document', 'identity', { authority: '', numberLabel: 'Reference', color: '#46546b' });

  const DOC_FIELD_LABELS = { dob: 'Date of birth', gender: 'Gender', address: 'Address', father: 'Father’s name', classes: 'Vehicle classes', validTo: 'Valid until',
    nationality: 'Nationality', abhaAddress: 'ABHA address', makeModel: 'Make and model', vehicleNo: 'Vehicle number', state: 'State' };

  // ---- Lookups ---------------------------------------------------------------
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const inRegion = (r, region) => !region || r === region || (region === 'GCC' && GCC.includes(r));
  function providers(cat, { region, q } = {}) {
    const words = norm(q).split(' ').filter(Boolean);
    return P.filter((p) => p.cat === cat && inRegion(p.region, region)
      && words.every((w) => norm([p.name, p.sub, p.city, p.iata, regionName(p.region)].concat(p.aliases).join(' ')).includes(w)));
  }
  const provider = (id) => P.find((p) => p.id === id) || null;
  const issuer = (id) => ISSUERS.find((b) => b.id === id) || null;
  const network = (id) => NETWORKS.find((n) => n.id === id) || null;
  const docType = (id) => DOCS.find((d) => d.id === id) || null;
  function docsFor(region, group) {
    const local = DOCS.filter((d) => d.region === region && (!group || d.group === group));
    const have = new Set(local.map((d) => d.id.split('.')[1]));
    return local.concat(DOCS.filter((d) => d.region === 'XX' && (!group || d.group === group) && !have.has(d.id.split('.')[1])));
  }
  function issuersFor(q, region) {
    const words = norm(q).split(' ').filter(Boolean);
    return ISSUERS.filter((b) => inRegion(b.country, region)
      && words.every((w) => norm([b.name, regionName(b.country)].concat(b.aliases, b.products.map((p) => p.name)).join(' ')).includes(w)));
  }

  return {
    VERSION, ART_SOURCE, REGIONS, GCC, regionName, ADD_CATEGORIES, TEMPLATES, PROVIDERS: P, NETWORKS, ISSUERS, DOCS, DOC_FIELD_LABELS,
    providers, provider, issuer, network, docType, docsFor, issuersFor, norm
  };
});
