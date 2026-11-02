/*
 * brands.js - who issued a gift card: its look, and its correct name.
 *
 * Card Vault gives every bank a two-tone theme and a short glyph (BANKS in its
 * app.js). This is the same idea for gift-card stores, plus the thing a store
 * list needs that a bank list does not: people type store names freehand, from
 * memory, on a phone keyboard. "Flipcart", "flip kart", "FK" and "Flipkart
 * Gift Card" are all one store, and four spellings would mean four colours,
 * four totals and a combined value that never adds up.
 *
 * So each store has:
 *   name     the canonical spelling, which is what gets saved
 *   g        a 1-2 character glyph (no logos - initials only, like Card Vault)
 *   a, b     the two-tone band, dark -> brand colour
 *   fg       text colour on the band (dark for the yellow brands)
 *   x        an accent, used for the glyph
 *   aka      abbreviations and alternate names fuzzy matching cannot guess
 *
 * Colours are each store's own recognisable hue, approximated - this is a
 * private wallet, not a co-branded product, and no artwork is used.
 *
 * Adding a store is one line. A store that is not listed still gets a stable
 * colour of its own (hashed from the name), so nothing ever renders unthemed.
 */
(function (root) {
  "use strict";

  const W = "#ffffff", INK = "#1a1a1a";
  const LIST = [
    // marketplaces
    { name: "Amazon", g: "a", a: "#0f1419", b: "#232f3e", fg: W, x: "#ff9900", aka: ["amzn", "amazonin"] },
    { name: "Flipkart", g: "F", a: "#1a5dcc", b: "#2874f0", fg: W, x: "#ffe11b", aka: ["fk", "flipkartplus", "fkart"] },
    { name: "Myntra", g: "M", a: "#d1185b", b: "#ff3f6c", fg: W, x: "#ffb38a", aka: ["myntrainsider"] },
    { name: "Ajio", g: "AJ", a: "#1b2a38", b: "#2c4152", fg: W, x: "#d8b46a", aka: ["ajiolife"] },
    { name: "Nykaa", g: "N", a: "#c4155e", b: "#fc2779", fg: W, x: "#ffd1e3", aka: ["nykaafashion", "nykaaman"] },
    { name: "Tata CLiQ", g: "TC", a: "#3a0a24", b: "#a3185c", fg: W, x: "#ffc2dc", aka: ["tatacliq", "cliq", "tatacliqluxury"] },
    { name: "Meesho", g: "Me", a: "#7a1468", b: "#9f2089", fg: W, x: "#f7b5e8", aka: [] },
    { name: "Snapdeal", g: "SD", a: "#b8002a", b: "#e40046", fg: W, x: "#ffc2d1", aka: [] },
    { name: "JioMart", g: "JM", a: "#005680", b: "#0078ad", fg: W, x: "#9fd8f5", aka: ["jio"] },
    { name: "Tata Neu", g: "Nu", a: "#3d1a78", b: "#5b2bb5", fg: W, x: "#f4c34d", aka: ["neu", "tataneu"] },
    // electronics
    { name: "Croma", g: "C", a: "#063f38", b: "#0f8f7a", fg: W, x: "#7cf5d6", aka: [] },
    { name: "Reliance Digital", g: "RD", a: "#b0141d", b: "#e42529", fg: W, x: "#ffd0d1", aka: ["reliancedigital", "rdigital"] },
    { name: "Vijay Sales", g: "VS", a: "#a8000f", b: "#d71920", fg: W, x: "#ffd27a", aka: [] },
    { name: "Samsung", g: "SA", a: "#0b1f6e", b: "#1428a0", fg: W, x: "#9fb2ff", aka: [] },
    { name: "Apple", g: "AP", a: "#1d1d1f", b: "#48484d", fg: W, x: "#d2d2d7", aka: ["itunes", "appstore", "appleitunes"] },
    { name: "Google Play", g: "GP", a: "#01693f", b: "#01875f", fg: W, x: "#fbbc04", aka: ["googleplay", "playstore", "gplay"] },
    { name: "OnePlus", g: "1+", a: "#b8001a", b: "#eb0029", fg: W, x: "#ffc4cc", aka: ["1plus"] },
    // fashion & lifestyle
    { name: "Shoppers Stop", g: "SS", a: "#111111", b: "#2b2b2b", fg: W, x: "#e4002b", aka: ["shoppersstop", "shopperstop"] },
    { name: "Lifestyle", g: "L", a: "#c24e00", b: "#f26b0f", fg: W, x: "#ffd3a8", aka: ["lifestylestores"] },
    { name: "Pantaloons", g: "P", a: "#a3102a", b: "#d71a3b", fg: W, x: "#ffc7d1", aka: [] },
    { name: "Westside", g: "W", a: "#1e1e1e", b: "#3e3e3e", fg: W, x: "#c8a96a", aka: [] },
    { name: "Max Fashion", g: "MX", a: "#00337f", b: "#0057b8", fg: W, x: "#ffcf3f", aka: ["max", "maxfashion"] },
    { name: "Reliance Trends", g: "RT", a: "#7d1035", b: "#b0174b", fg: W, x: "#ffc1d6", aka: ["trends"] },
    { name: "Fabindia", g: "FI", a: "#6b2c14", b: "#8f3d1c", fg: W, x: "#efc08f", aka: [] },
    { name: "H&M", g: "HM", a: "#b3000d", b: "#e50010", fg: W, x: "#ffc4c7", aka: ["hm", "handm", "hennesandmauritz"] },
    { name: "Zara", g: "Z", a: "#0f0f0f", b: "#2e2e2e", fg: W, x: "#e8e8e8", aka: [] },
    { name: "Uniqlo", g: "UQ", a: "#c40000", b: "#ff0000", fg: W, x: "#ffd0d0", aka: [] },
    { name: "Marks & Spencer", g: "MS", a: "#0c3b2e", b: "#1a5d48", fg: W, x: "#d7e36b", aka: ["mands", "marksandspencer", "marksspencer"] },
    { name: "Nike", g: "N", a: "#111111", b: "#353535", fg: W, x: "#f5f5f5", aka: [] },
    { name: "Adidas", g: "AD", a: "#0a0a0a", b: "#2a2a2a", fg: W, x: "#dcdcdc", aka: [] },
    { name: "Puma", g: "PU", a: "#141414", b: "#3a3a3a", fg: W, x: "#e4002b", aka: [] },
    { name: "Bata", g: "BA", a: "#b3001b", b: "#e2001a", fg: W, x: "#ffc6cc", aka: [] },
    { name: "Bewakoof", g: "BW", a: "#e0b800", b: "#fdd835", fg: INK, x: "#1a1a1a", aka: [] },
    { name: "Decathlon", g: "D", a: "#005a92", b: "#0082c3", fg: W, x: "#bfe6ff", aka: [] },
    // beauty, eyewear, jewellery
    { name: "Purplle", g: "Pu", a: "#5b1a8a", b: "#7d2ac1", fg: W, x: "#e6c8ff", aka: ["purple"] },
    { name: "Lenskart", g: "LK", a: "#0d0d4a", b: "#1b1b6e", fg: W, x: "#11daac", aka: [] },
    { name: "Titan", g: "T", a: "#1a1a1a", b: "#3a3a3a", fg: W, x: "#c8a24a", aka: [] },
    { name: "Tanishq", g: "TQ", a: "#5e1a1d", b: "#832729", fg: W, x: "#e0b46a", aka: [] },
    { name: "CaratLane", g: "CL", a: "#4f2c8f", b: "#6d3fbf", fg: W, x: "#f0d4ff", aka: ["caratlane"] },
    // home
    { name: "IKEA", g: "IK", a: "#004a8f", b: "#0058a3", fg: W, x: "#ffdb00", aka: [] },
    { name: "Pepperfry", g: "PF", a: "#c94f12", b: "#f16521", fg: W, x: "#ffd6bd", aka: [] },
    { name: "Urban Company", g: "UC", a: "#121212", b: "#333333", fg: W, x: "#d9d9d9", aka: ["urbanclap", "urbancompany"] },
    { name: "FirstCry", g: "FC", a: "#d9580a", b: "#ff7f1f", fg: W, x: "#ffe0c4", aka: [] },
    // food & grocery
    { name: "Swiggy", g: "S", a: "#e46a0a", b: "#fc8019", fg: W, x: "#ffe1c4", aka: ["swiggyinstamart", "instamart"] },
    { name: "Zomato", g: "Z", a: "#b8212d", b: "#e23744", fg: W, x: "#ffd0d4", aka: [] },
    { name: "Blinkit", g: "b", a: "#e6b422", b: "#f8cb46", fg: INK, x: "#0c831f", aka: ["grofers"] },
    { name: "Zepto", g: "Z", a: "#3b0a6e", b: "#5c1aa3", fg: W, x: "#ff3269", aka: [] },
    { name: "BigBasket", g: "bb", a: "#5a8f14", b: "#84c225", fg: W, x: "#eaffc7", aka: ["bbnow", "bigbasketnow"] },
    { name: "Starbucks", g: "SB", a: "#00492f", b: "#00704a", fg: W, x: "#d4e9e2", aka: ["tatastarbucks"] },
    { name: "Domino's", g: "D", a: "#00507a", b: "#006491", fg: W, x: "#ff4b57", aka: ["dominos", "dominospizza"] },
    { name: "McDonald's", g: "M", a: "#b81d13", b: "#da291c", fg: W, x: "#ffc72c", aka: ["mcd", "mcdonalds", "mcdelivery"] },
    { name: "KFC", g: "K", a: "#a3080c", b: "#e4002b", fg: W, x: "#ffd0d6", aka: [] },
    { name: "Pizza Hut", g: "PH", a: "#9e0b0f", b: "#d01e24", fg: W, x: "#ffd2a8", aka: ["pizzahut"] },
    // travel, rides, movies, wallets
    { name: "MakeMyTrip", g: "MT", a: "#0062c4", b: "#008cff", fg: W, x: "#ff5a60", aka: ["mmt", "makemytrip"] },
    { name: "Cleartrip", g: "CT", a: "#d65a12", b: "#f77728", fg: W, x: "#ffe0c9", aka: [] },
    { name: "Yatra", g: "Y", a: "#b8001f", b: "#e01f26", fg: W, x: "#ffd0d2", aka: [] },
    { name: "Uber", g: "U", a: "#000000", b: "#262626", fg: W, x: "#ffffff", aka: ["ubereats"] },
    { name: "Ola", g: "O", a: "#1c1c1c", b: "#3a3a3a", fg: W, x: "#cddc39", aka: ["olacabs"] },
    { name: "PVR INOX", g: "PV", a: "#e0b000", b: "#ffcb05", fg: INK, x: "#1a1a1a", aka: ["pvr", "inox", "pvrinox", "pvrcinemas"] },
    { name: "BookMyShow", g: "BM", a: "#d6304f", b: "#f84464", fg: W, x: "#ffd6de", aka: ["bms", "bookmyshow"] },
    { name: "Taj", g: "TJ", a: "#5a4115", b: "#7b5a1e", fg: W, x: "#e8c98a", aka: ["ihcl", "tajhotels", "tajexperiences"] },
    { name: "Paytm", g: "P", a: "#002e6e", b: "#00a0dc", fg: W, x: "#bff0ff", aka: [] },
    { name: "PhonePe", g: "Pe", a: "#4b1a8a", b: "#5f259f", fg: W, x: "#e2ccff", aka: [] },
  ];


  // Curated two-tone pairs per category, for the stores below that do not have
  // hand-picked colours (and for stores a user adds). A pair is chosen by a
  // hash of the name, so a store always gets the same one. Families keep a
  // category recognisable at a glance - food warm, jewellery maroon and gold,
  // travel sky - without every store in it looking the same.
  const FAMILIES = {
    food:    [["#9a2a12", "#e2541c", "#ffd29a"], ["#7c2d12", "#c2410c", "#fed7aa"], ["#8a1c1c", "#d93a2b", "#ffd0b5"], ["#6b3410", "#b45a1b", "#ffe0a8"], ["#9f1d4a", "#e0345f", "#ffd1dc"]],
    grocery: [["#14532d", "#2f9e44", "#d3f9b7"], ["#365314", "#65a30d", "#ecfccb"], ["#064e3b", "#0f9e6e", "#c8f7e1"]],
    fashion: [["#3b0a45", "#7b1fa2", "#f3c6ff"], ["#1f2937", "#4b5563", "#e5e7eb"], ["#4a0e2e", "#a3185c", "#ffc2dc"], ["#1e1b4b", "#4338ca", "#c7d2fe"], ["#3f1d0b", "#8a4b22", "#f6d6b8"], ["#0f2a3d", "#1f5f8b", "#cde8ff"], ["#2b1b2e", "#6d3b73", "#f0d0f2"]],
    kids:    [["#0e5a8a", "#1c9ad6", "#fff1a8"], ["#9d174d", "#ec4899", "#fff1a8"], ["#5b21b6", "#8b5cf6", "#fde68a"]],
    jewel:   [["#4a0d12", "#8c1d24", "#f2cf8a"], ["#3b2006", "#8a5a12", "#ffe2a0"], ["#0b3b2e", "#146b52", "#f2d58a"], ["#3a0f2a", "#7a1f4f", "#f5d08a"]],
    beauty:  [["#831843", "#db2777", "#ffd6e8"], ["#6b2142", "#b8466f", "#ffd9e6"], ["#4c1d5f", "#9d4edd", "#f2dcff"], ["#7a2e2e", "#c25e5e", "#ffe1d6"]],
    tech:    [["#0b2a5b", "#1d5fd1", "#bfe0ff"], ["#083344", "#0e7490", "#b8f3ff"], ["#111827", "#374151", "#93c5fd"], ["#1e3a8a", "#3b82f6", "#dbeafe"]],
    home:    [["#3f2d1d", "#8a6239", "#f3dcc0"], ["#1f3b2c", "#3f7a55", "#d7f0de"], ["#5a2a16", "#b5562a", "#ffd9c2"]],
    gift:    [["#7a1030", "#d12a5c", "#ffd5e0"], ["#5b1a7a", "#a43ecf", "#f6d5ff"], ["#0f5a4a", "#1aa384", "#c9fbe9"]],
    travel:  [["#0c4a6e", "#0284c7", "#bae6fd"], ["#134e4a", "#0d9488", "#b9f6ee"], ["#1e3a8a", "#2563eb", "#cfe0ff"], ["#3b2a6b", "#6a4fd0", "#ddd3ff"]],
    fun:     [["#2e1065", "#6d28d9", "#ddd6fe"], ["#4a044e", "#a21caf", "#fbcfe8"], ["#0f172a", "#334155", "#a5f3fc"], ["#7c1d6f", "#db2777", "#fbcfe8"]],
    health:  [["#064e3b", "#059669", "#a7f3d0"], ["#0c4a6e", "#0891b2", "#a5f3fc"], ["#14532d", "#16a34a", "#bbf7d0"]],
    fuel:    [["#7c2d12", "#ea580c", "#fde68a"], ["#1e3a8a", "#1d4ed8", "#fde047"]],
    // Stores a user adds, and any name nobody has listed: the widest spread,
    // 16 pairs x 12 patterns = 192 distinct looks before anything repeats.
    mine:    [["#1e3a8a", "#2563eb", "#bfdbfe"], ["#831843", "#db2777", "#fbcfe8"], ["#134e4a", "#0d9488", "#99f6e4"], ["#7c2d12", "#ea580c", "#fed7aa"],
              ["#4c1d95", "#7c3aed", "#ddd6fe"], ["#14532d", "#16a34a", "#bbf7d0"], ["#78350f", "#b45309", "#fde68a"], ["#164e63", "#0891b2", "#a5f3fc"],
              ["#881337", "#e11d48", "#fecdd3"], ["#312e81", "#4f46e5", "#c7d2fe"], ["#365314", "#4d7c0f", "#d9f99d"], ["#701a75", "#c026d3", "#f5d0fe"],
              ["#3f3f46", "#71717a", "#e4e4e7"], ["#7f1d1d", "#b91c1c", "#fecaca"], ["#0c4a6e", "#0369a1", "#bae6fd"], ["#422006", "#a16207", "#fef08a"]],
  };
  const hashOf = (t) => { let h = 0; t = String(t || "").toLowerCase(); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return h; };
  const initialsOf = (t) => {
    const w = String(t || "").replace(/[^A-Za-z0-9& ]/g, " ").split(/\s+/).filter((x) => x && !/^(the|of|and|&|by|for)$/i.test(x));
    if (!w.length) return "?";
    return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).replace(/^./, (c) => c.toUpperCase());
  };
  function famStore(name, fam, aka) {
    const pairs = FAMILIES[fam] || FAMILIES.mine, h = hashOf(name), p = pairs[h % pairs.length];
    return { name, g: initialsOf(name), a: p[0], b: p[1], fg: "#ffffff", x: p[2], aka: aka || [], fam, seed: (h >>> 4) % 12 };
  }

  // ~260 more stores, taken from what Gyftr and Woohoo actually sell
  // (sitemaps, 03-Oct-2026): category | name | aliases.
  const EXTRA_SRC = `food|Absolute Barbecues|absolutebarbeque,absolutebarbecue,abs
food|Barbeque Nation|bbqnation,barbequenation
food|Baskin Robbins|baskinrobbins
food|Behrouz Biryani|behrouz
food|Bikanervala|
food|Bakingo|
food|Bo-Tai|botai
food|Cafe Coffee Day|ccd,cafecoffeeday
food|Cafe Delhi Heights|
food|Chaayos|
food|Chicago Pizza|
food|Costa Coffee|costa
food|EatSure|
food|EazyDiner|
food|Faasos|
food|Farzi Cafe|
food|FreshMenu|
food|Lite Bite Foods|litebite
food|Made in Punjab|
food|Mainland China|
food|Masala Library|
food|Oh! Calcutta|ohcalcutta
food|Oven Story|ovenstory
food|Punjab Grill|
food|Subway|
food|Sweet Bengal|
food|Sweet Truth|
food|Taco Bell|tacobell
food|TGI Fridays|tgif,tgifridays
food|The Beer Cafe|beercafe
food|The Good Bowl|goodbowl
food|Tim Hortons|timhortons
food|Wendy's|wendys
food|Wow! Momo|wowmomo
food|Wow! China|wowchina
food|Pret A Manger|pret
food|Machaan|
grocery|Nature's Basket|naturesbasket,godrejnaturesbasket
grocery|Lulu Hypermarket|lulu
grocery|Milkbasket|
grocery|Ratnadeep|ratnadeepsupermarket
grocery|Spar Hypermarket|spar
grocery|Smart Bazaar|reliancesmart,reliancesmartbazaar,smartpoint
fashion|Abraham & Thakore|abrahamandthakore
fashion|Aldo|
fashion|Allen Solly|allensolly
fashion|American Eagle|ae
fashion|American Tourister|
fashion|Arrow|
fashion|Aurelia|
fashion|Beverly Hills Polo Club|bhpc
fashion|Beyoung|
fashion|Biba|
fashion|Birkenstock|
fashion|Blissclub|
fashion|Brooks Brothers|
fashion|Call It Spring|
fashion|Campus|campusshoes
fashion|Charles & Keith|charlesandkeith
fashion|ColorPlus|
fashion|Columbia|columbiasportswear
fashion|Fashion Factory|
fashion|FreeCultr|
fashion|Flying Machine|
fashion|Forever New|
fashion|Global Desi|
fashion|Hidesign|
fashion|Hush Puppies|
fashion|Indian Terrain|
fashion|Jockey|
fashion|Koskii|
fashion|Levi's|levis
fashion|Libas|
fashion|Liberty|libertyshoes
fashion|Linen Club|
fashion|Louis Philippe|
fashion|Mango|
fashion|Manyavar|
fashion|Mokobara|
fashion|Nautica|
fashion|Neeman's|neemans
fashion|Next|
fashion|Park Avenue|
fashion|Parx|
fashion|Peter England|
fashion|Planet Fashion|
fashion|Rangriti|
fashion|Rare Rabbit|
fashion|Rareism|
fashion|Raymond|theraymondshop
fashion|Relaxo|
fashion|Ritu Kumar|
fashion|Samsonite|
fashion|Satya Paul|
fashion|Simon Carter|
fashion|Skechers|
fashion|Snitch|
fashion|Soch|
fashion|Speedo|
fashion|Style Bazaar|
fashion|Superdry|
fashion|Taneira|
fashion|Tasva|
fashion|The Collective|
fashion|U.S. Polo Assn.|uspolo,uspoloassn
fashion|Van Heusen|
fashion|V-Mart|vmart
fashion|W for Woman|wforwoman
fashion|Wildcraft|
fashion|Woodland|
fashion|Zudio|
fashion|Tumi|
fashion|Victoria's Secret|victoriassecret
fashion|Hunkemöller|hunkemoller
fashion|Coach|
fashion|Michael Kors|
fashion|Diesel|
fashion|Hugo Boss|
fashion|Armani Exchange|
fashion|Emporio Armani|
fashion|Kate Spade|
fashion|Jimmy Choo|
fashion|Steve Madden|
fashion|Tory Burch|
fashion|Ferragamo|
fashion|Valentino|
fashion|Versace|
fashion|Sandro|
fashion|Maje|
fashion|Paul Smith|
fashion|Dune|dunelondon
fashion|Scotch & Soda|scotchandsoda
fashion|Bally|
fashion|Canali|
fashion|Tod's|tods
fashion|Bottega Veneta|
fashion|Muji|
fashion|GAS|gasjeans
fashion|Ray-Ban|rayban
fashion|Sunglass Hut|
fashion|Lawrence & Mayo|lawrenceandmayo
fashion|Fastrack|
fashion|Helios|
fashion|Citizen|citizenwatches
fashion|Titan Eye+|titaneye
kids|Hamleys|hbyhamleys
kids|Mothercare|
kids|Babyshop|
kids|Chicco|
kids|Hopscotch|
kids|Miniklub|
kids|SuperBottoms|
kids|Me n Moms|menmoms
kids|Lego|
jewel|Kalyan Jewellers|kalyan,kalyanjewellers
jewel|Malabar Gold & Diamonds|malabar,malabargold,malabargoldanddiamonds
jewel|Joyalukkas|joyalukkas
jewel|Jos Alukkas|josalukkas
jewel|Bhima Jewellers|bhima
jewel|GRT Jewellers|grt
jewel|PC Jeweller|pcj,pcjeweller
jewel|Candere|
jewel|Giva|
jewel|Mia by Tanishq|mia
jewel|Indriya|
jewel|Reliance Jewels|
jewel|Surat Diamonds|
jewel|Euphoria|
jewel|Ketan Diamonds|
jewel|MMTC-PAMP|mmtcpamp
jewel|Estele|
jewel|Palmonas|
jewel|PC Chandra|pcchandra
beauty|Bath & Body Works|bathandbodyworks
beauty|Bobbi Brown|
beauty|Foxtale|
beauty|Health & Glow|healthandglow
beauty|Inglot|
beauty|Kama Ayurveda|
beauty|Kimirica|
beauty|Lakme Salon|lakme
beauty|Nat Habit|
beauty|Skinn|
beauty|The Body Shop|bodyshop
beauty|Tira|tirabeauty
beauty|Typsy Beauty|
beauty|Enrich Salon|enrich
beauty|Naturals Salon|naturals
beauty|Jawed Habib|
beauty|Toni & Guy|toniandguy
beauty|Looks Salon|
beauty|Bodycraft|
beauty|O2 Spa|
beauty|Tattva Spa|
beauty|The Man Company|
beauty|Soulflower|
beauty|Himalaya|himalayawellness
beauty|Truefitt & Hill|truefittandhill
beauty|Bblunt|
tech|boAt|boat
tech|Imagine|imagineapple
tech|Philips|
tech|Skullcandy|
tech|Hammer|
tech|Prestige|ttkprestige
tech|Milton|
tech|Cello|
tech|Wonderchef|
tech|Pigeon|
home|Home Centre|homecentre
home|Urban Ladder|
home|Wakefit|
home|Duroflex|
home|Pure Home + Living|purehomeandliving
home|Nestasia|
home|Chumbak|
home|Daily Objects|
home|Clayco|
home|Villeroy & Boch|villeroyandboch
home|West Elm|
home|Pottery Barn|
home|Urban Space|
home|Danube|danubebuildmart
gift|Archies|archiesgallery
gift|Ferns N Petals|fnp,fernsnpetals
gift|IGP|
gift|Flower Aura|
gift|Crossword|
gift|The Postcard|
travel|Air India|
travel|SpiceJet|
travel|EaseMyTrip|emt
travel|Goibibo|
travel|ixigo|
travel|redBus|redbus
travel|Klook|
travel|Zoomcar|
travel|Cordelia Cruises|cordelia
travel|SOTC|
travel|Sterling Holidays|
travel|FabHotels|
travel|Lohono Stays|
travel|Marriott|
travel|ITC Hotels|
travel|The Leela|
travel|Elivaas|
travel|Dreamfolks|
fun|Cinepolis|
fun|District|
fun|Timezone|
fun|Hoichoi|
fun|SonyLIV|
fun|ZEE5|
fun|JioHotstar|hotstar
fun|ShemarooMe|
fun|Gaana|
fun|Steam|
fun|PlayStation|psn
fun|Xbox|
fun|Nintendo|
fun|Roblox|
fun|Valorant|
fun|BGMI|
fun|UniPin|
fun|Discord|
fun|Microsoft|
fun|Cult.fit|cultfit,cult
fun|Fitpass|
fun|Playo|
health|Apollo Pharmacy|apollo
health|Apollo Diagnostics|
health|Netmeds|
health|HealthKart|
health|Healthians|
health|Wellbeing Nutrition|
fuel|Shell|
fuel|IndianOil|iocl
fuel|BPCL|`;
  const have = new Set(LIST.map((x) => x.name.toLowerCase()));
  EXTRA_SRC.split("\n").forEach((line) => {
    const [fam, name, aka] = line.split("|");
    if (!name || have.has(name.toLowerCase())) return;
    LIST.push(famStore(name, fam, (aka || "").split(",").filter(Boolean)));
  });

  // Words that decorate a store name without being part of it. Dropped before
  // matching, so "Flipkart Gift Card" and "Myntra E-Voucher" find the store.
  const NOISE = new Set(["gift", "giftcard", "giftcards", "card", "cards", "egift", "egiftcard",
    "e", "voucher", "vouchers", "evoucher", "evouchers", "shopping", "india", "online",
    "store", "stores", "pay", "the", "official", "instant", "digital", "code", "coupon"]);
  // ...except these, which a store of the SAME company can carry as part of
  // its name (1.3.9: Amazon Pay, Amazon Shopping Voucher are not Amazon).
  // A soft pass keeps them; the full pass drops them as before.
  const SOFT_KEEP = new Set(["pay", "shopping", "digital", "store", "stores"]);

  /** "Flipkart Gift-Card!" -> "flipkart". "&" survives as "and" so H&M and
   *  M&S still have letters to match on. soft=true keeps SOFT_KEEP words. */
  function norm(s, soft) {
    const words = String(s || "").toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "")
      .split(/[^a-z0-9+]+/).filter(Boolean);
    const kept = words.filter((w) => !NOISE.has(w) || (soft && SOFT_KEEP.has(w)));
    // "Reliance Digital": "digital" is noise elsewhere but part of this name.
    return (kept.length ? kept : words).join("");
  }

  // Each store gets an illustration seed (Card Vault's BANKS idea): stores
  // that share a hue - Zomato, KFC, H&M are all red - still look different.
  // Spread over the list so neighbours in it never share a pattern.
  LIST.forEach((s, i) => { if (s.seed === undefined) s.seed = (i * 5) % 12; });

  // 1.3.9 (closed test): Amazon's own gift products as stores of their own.
  // Added AFTER the seeds above, with seeds of their own, so no existing
  // store's card art changes. Same Amazon family look, each its own hue.
  LIST.push(
    { name: "Amazon Pay", g: "aP", a: "#0b2a4a", b: "#146eb4", fg: W, x: "#ff9900", aka: ["apay", "amazonpaygiftcard"], seed: 1 },
    { name: "Amazon Shopping Voucher", g: "aS", a: "#131a22", b: "#37475a", fg: W, x: "#ffb84d", aka: ["amazonshopping", "amazonvoucher"], seed: 6 },
    { name: "Amazon Fresh", g: "aF", a: "#1d4d12", b: "#3f8a24", fg: W, x: "#ffb84d", aka: ["amazonfresh"], seed: 9 },
    { name: "Amazon Gold", g: "aG", a: "#5a3f0c", b: "#a87a17", fg: W, x: "#ffe7a3", aka: ["amazongold", "amazongoldcoin"], seed: 4 });

  const KEYS = new Map();               // normalised key -> store
  // The exact name and its aliases always win; the noise-stripped forms only
  // fill a key nobody owns yet - otherwise "Amazon Pay" (normalised to
  // "amazon") would take over plain Amazon.
  const index = (s) => {
    const own = (k) => KEYS.set(k, s);
    const fill = (k) => { if (k && !KEYS.has(k)) KEYS.set(k, s); };
    own(s.name.toLowerCase().replace(/[^a-z0-9+]/g, ""));
    s.aka.forEach((k) => own(k.replace(/[^a-z0-9+]/g, "")));
    fill(norm(s.name, true));
    fill(norm(s.name));
  };
  // Exact names first for every store, then the derived keys - so list order
  // never decides who owns a name.
  LIST.forEach((s) => { KEYS.set(s.name.toLowerCase().replace(/[^a-z0-9+]/g, ""), s); s.aka.forEach((k) => KEYS.set(k.replace(/[^a-z0-9+]/g, ""), s)); });
  LIST.forEach(index);

  // ---- stores the user adds --------------------------------------------
  // "Kalyan Sweets" is not on any list, so the user adds it: it joins the
  // suggestions on this phone and gets its own colours and pattern from the
  // "mine" family. Kept in localStorage (a device setting, like Card Vault's
  // relations list); the store name itself also travels on every card saved
  // with it, so an imported vault brings its stores along.
  const CUSTOM_KEY = "gcv-custom-stores";
  const CUSTOM = [];
  function loadCustom() {
    let names = [];
    try { names = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); } catch (e) {}
    names.forEach((n) => addCustom(n, true));
  }
  /** Add a store to this phone's list. Returns its canonical name - which is
   *  the EXISTING store if the name is just another spelling of one. */
  function addCustom(name, loading) {
    const t = String(name || "").trim().replace(/\s+/g, " ");
    if (!t) return "";
    const m = match(t);
    if (m && m.how === "exact") return m.store.name;
    const st = famStore(t, "mine", []);
    st.custom = true;
    CUSTOM.push(st); index(st);
    if (!loading) {
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(CUSTOM.map((c) => c.name))); } catch (e) {}
    }
    return st.name;
  }
  loadCustom();

  /** Optimal string alignment distance - Levenshtein plus adjacent swaps, so
   *  "Mytnra" is one slip from "Myntra", not two. Capped for speed. */
  function distance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    const d = [];
    for (let i = 0; i <= a.length; i++) { d.push([i]); }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
        d[i][j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > cap) return cap + 1;
    }
    return d[a.length][b.length];
  }

  /**
   * Find the store a typed name means.
   *   -> { store, how: "exact" | "fuzzy" } or null
   * "exact" is any spelling that normalises to a known key (case, spaces,
   * "gift card" suffixes, listed abbreviations) - safe to apply silently.
   * "fuzzy" is a typo within the allowance below. Short keys get NO fuzz:
   * at four letters one edit turns Puma into Pume into Purple, and a wrong
   * correction is worse than none. A tie between two stores corrects nothing.
   */
  function match(typed) {
    const k = norm(typed);
    if (!k) return null;
    // Most specific first: the name as typed, then with only decoration
    // dropped ("Amazon Pay E-Gift Card" -> amazonpay), then fully normalised.
    const raw = String(typed || "").toLowerCase().replace(/[^a-z0-9+]/g, "");
    for (const key of [raw, norm(typed, true), k]) {
      if (key && KEYS.has(key)) return { store: KEYS.get(key), how: "exact" };
    }
    if (k.length < 4) return null;
    let best = null, bestD = Infinity, tie = false;
    for (const [key, store] of KEYS) {
      if (key.length < 5) continue;
      const allow = key.length >= 8 ? 2 : 1;
      const dd = distance(k, key, allow);
      if (dd > allow) continue;
      if (dd < bestD) { best = store; bestD = dd; tie = false; }
      else if (dd === bestD && best && store !== best) tie = true;
    }
    return best && !tie ? { store: best, how: "fuzzy" } : null;
  }

  /** The name to save. exactOnly=true is the data layer's rule (never guess);
   *  the UI uses fuzzy matches too, but shows the change with an Undo. */
  function canonical(typed, exactOnly) {
    const m = match(typed);
    if (!m || (exactOnly && m.how !== "exact")) return String(typed || "").trim();
    return m.store.name;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { const f = 1 + amt; r *= f; g *= f; b *= f; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    const h = (v) => Math.round(v).toString(16).padStart(2, "0");
    return "#" + h(r) + h(g) + h(b);
  }

  /** Theme for any store name, listed or not. */
  function theme(name) {
    const m = match(name);
    const st = m ? m.store : famStore(String(name || "").trim() || "Gift card", "mine", []);
    return { name: st.name, g: st.g, a: st.a, b: st.b, fg: st.fg, x: st.x, seed: st.seed, known: !!m, custom: !!st.custom };
  }

  /**
   * Type-ahead for the store field - no dropdown of 300 names. Returns up to
   * `limit` stores for what has been typed, best first: name starts with it,
   * then a word in the name starts with it, then an alias does, then it is
   * contained, then a typo away. `extra` adds names already used on cards.
   */
  function suggest(q, extra, limit) {
    const k = String(q || "").toLowerCase().replace(/[^a-z0-9+]/g, "");
    if (!k) return [];
    const pool = LIST.concat(CUSTOM);
    (extra || []).forEach((n) => { if (n && !match(n)) pool.push(famStore(n, "mine", [])); });
    const scored = [];
    const seen = new Set();
    pool.forEach((st) => {
      if (seen.has(st.name)) return;
      const nm = st.name.toLowerCase().replace(/[^a-z0-9+ ]/g, "");
      const flat = nm.replace(/ /g, "");
      let sc = null;
      if (flat.startsWith(k)) sc = 0;
      else if (nm.split(" ").some((w) => w.startsWith(k))) sc = 1;
      else if (st.aka.some((a) => a.startsWith(k))) sc = 2;
      else if (k.length >= 3 && flat.includes(k)) sc = 3;
      else if (k.length >= 4 && distance(k, flat.slice(0, k.length + 1), 1) <= 1) sc = 4;
      if (sc === null) return;
      seen.add(st.name);
      scored.push({ st, sc: sc - (st.custom ? 0.5 : 0) });
    });
    scored.sort((a, b) => a.sc - b.sc || a.st.name.length - b.st.name.length || a.st.name.localeCompare(b.st.name));
    return scored.slice(0, limit || 5).map((x) => ({ name: x.st.name, g: x.st.g, custom: !!x.st.custom, style: style(x.st.name) }));
  }

  /** Is this exactly a store's name or listed alias (case, spaces and
   *  punctuation aside)? The store picker offers "+ Add" for anything else -
   *  "Amazon Pay Later" is not Amazon Pay, however the matching reads it. */
  function isListedName(q) {
    const k = String(q || "").toLowerCase().replace(/[^a-z0-9+]/g, "");
    if (!k) return false;
    return LIST.concat(CUSTOM).some((st) => st.name.toLowerCase().replace(/[^a-z0-9+]/g, "") === k
      || st.aka.some((a) => a.replace(/[^a-z0-9+]/g, "") === k));
  }

  /** Inline CSS variables so a card carries its own store theme. */
  function style(name) {
    const t = theme(name);
    return "--gc-a:" + t.a + ";--gc-b:" + t.b + ";--gc-fg:" + t.fg + ";--gc-x:" + t.x;
  }

  root.brands = { LIST, match, canonical, theme, style, norm, suggest, addCustom, isListedName,
                  customs: () => CUSTOM.map((c) => c.name), names: () => LIST.map((s) => s.name) };
})(window.YCJ = window.YCJ || {});
