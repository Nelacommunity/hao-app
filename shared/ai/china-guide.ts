// Practical knowledge for foreigners in mainland China, used to ground the Guide agent.
// Rules and fees change often: the agent is told to say so and to point to the official app.
// Last reviewed: October 2026. Keep entries short, factual and verifiable.
import { tx } from '../i18n/tx';

export type GuideTopicId =
  | 'wechat'
  | 'payments'
  | 'metro'
  | 'taxi'
  | 'trains'
  | 'sim'
  | 'shopping'
  | 'hotel'
  | 'health'
  | 'delivery'
  | 'prices';

export const GuideTopics: { id: GuideTopicId; title: string; emoji: string; starter: string }[] = [
  { id: 'wechat', title: tx('Set up WeChat'), emoji: '💬', starter: tx('Help me create a WeChat account and get it working.') },
  { id: 'payments', title: tx('Pay with Alipay / WeChat Pay'), emoji: '💳', starter: tx('Help me set up mobile payments with my foreign card.') },
  { id: 'metro', title: tx('Metro & buses'), emoji: '🚇', starter: tx('How do I use the metro and buses here?') },
  { id: 'taxi', title: tx('Taxis & DiDi'), emoji: '🚕', starter: tx('How do I get a taxi or DiDi?') },
  { id: 'trains', title: tx('Trains & flights'), emoji: '🚄', starter: tx('Help me book a high-speed train ticket.') },
  { id: 'sim', title: tx('SIM, eSIM & internet'), emoji: '📶', starter: tx('How do I get mobile data and stay connected?') },
  { id: 'shopping', title: tx('Shopping & bargaining'), emoji: '🛍️', starter: tx('Help me shop: markets, malls and online.') },
  { id: 'hotel', title: tx('Hotel & registration'), emoji: '🏨', starter: tx('What do I need for hotel check-in and registration?') },
  { id: 'health', title: tx('Health & emergencies'), emoji: '🏥', starter: tx('What should I do if I get sick or need help urgently?') },
  { id: 'delivery', title: tx('Food delivery & apps'), emoji: '🛵', starter: tx('How can I order food delivery?') },
  { id: 'prices', title: tx('Is this price fair?'), emoji: '💴', starter: tx('Is this price fair? A taxi driver wants ¥80 for a short ride.') },
];

export type GuideApp = 'wechat' | 'alipay' | 'didi' | 'amap' | 'railway12306' | 'trip' | 'meituan' | 'taobao' | 'dianping';

export const GuideApps: Record<GuideApp, { name: string; search: string }> = {
  wechat: { name: 'WeChat', search: 'WeChat' },
  alipay: { name: 'Alipay', search: 'Alipay' },
  didi: { name: 'DiDi', search: 'DiDi Rider' },
  amap: { name: 'Amap 高德地图', search: 'Amap' },
  railway12306: { name: 'China Railway 12306', search: '12306' },
  trip: { name: 'Trip.com', search: 'Trip.com' },
  meituan: { name: 'Meituan 美团', search: 'Meituan' },
  taobao: { name: 'Taobao', search: 'Taobao' },
  dianping: { name: 'Dianping 大众点评', search: 'Dianping' },
};

export const CHINA_KNOWLEDGE = `
WECHAT (微信 Weixin)
- Download "WeChat". Sign up with a phone number: foreign numbers usually work. Set the language to English in Me → Settings → General.
- New accounts often need a security check: an existing WeChat user (account usually 6+ months old, not verified for someone else recently) scans a QR code to verify you. Hotel staff or a friend can help.
- Add friends by scanning their QR code (Me → My QR code / + → Scan). Many shops, restaurants and hotels use WeChat mini programs (no extra app needed).
- WeChat Pay: Me → Services (Pay) → Wallet → Bank Cards → add a Visa/Mastercard/JCB/Diners/Discover card, then verify identity with your passport.

MOBILE PAYMENTS (Alipay 支付宝 and WeChat Pay 微信支付)
- Cash (CNY) is legal tender and should be accepted, but most people pay by QR code. Keep some cash as backup.
- Alipay: install, sign up with a foreign phone number, add an international card, verify with passport. Works for shops, metro QR, DiDi, and many mini programs.
- Paying: show your payment code to the cashier, or scan the merchant's QR and enter the amount.
- Foreign cards: small payments are usually fee-free; a fee (around 3%) may apply above a threshold (historically ¥200). Limits and fees change; check the app.

METRO & BUSES
- Single tickets from machines (English option; cash or QR). Many cities accept the Alipay/WeChat "transport code" (乘车码) at the gate: search "transport" or the city's metro mini program.
- Big cities often accept foreign contactless cards at some gates (e.g. parts of Beijing/Shanghai metro). Security check (bag scanner) at metro entrances is normal.
- Metro apps/maps: Amap (高德) and Apple Maps show lines and exits. Exits are lettered/numbered (A, B, C1…).

TAXIS & DIDI
- DiDi (滴滴) app has English and accepts international cards; DiDi is also inside Alipay/WeChat as a mini program.
- Street taxis: use the meter (打表 dǎ biǎo), keep the receipt (发票 fāpiào) in case you leave something behind. Show the driver the destination in Chinese characters.
- Airport/train-station taxis: use the official taxi queue; ignore touts.

TRAINS & FLIGHTS
- High-speed trains (高铁 G/D trains): book on the official 12306 app/site (English, passport registration) or Trip.com. Booking opens ~15 days ahead; popular holidays sell out.
- Bring the same passport used to book. Stations have ID and security checks; arrive 30–60 minutes early (big stations need time). Tickets are electronic, linked to your passport.
- Seat classes: second class (二等座), first class (一等座), business (商务座). Sleeper trains: soft sleeper (软卧), hard sleeper (硬卧).

SIM, eSIM & INTERNET
- Home-carrier roaming or an international travel eSIM is the simplest. Many foreign services (Google, WhatsApp, Instagram, etc.) are not reachable on Chinese networks.
- Local SIM: China Mobile/Unicom/Telecom stores; passport required (real-name registration). Airport counters exist in big cities.
- Free Wi-Fi often needs a Chinese phone number for SMS verification.

SHOPPING
- Markets: bargaining is normal at tourist markets (start around 30–50% of the asking price, stay friendly). Not at supermarkets/malls (fixed prices).
- Online: Taobao/Tmall, JD, Pinduoduo; delivery to hotels is common (give the hotel's Chinese address).
- Tourist tax refund: departure tax refund at participating stores (look for "Tax Free"); some cities offer instant refund at the store. Keep receipts and passport.

HOTEL & REGISTRATION
- Hotels register foreign guests with the police at check-in using your passport; not every hotel is licensed to accept foreigners, so check when booking.
- Staying in a private home/Airbnb-type rental: you must register at the local police station (派出所) within 24 hours in cities (72 hours in rural areas). The host should help.
- Carry your passport: it's needed for trains, hotels, some attractions and SIM cards.

HEALTH & EMERGENCIES
- Emergency numbers: 110 police, 120 ambulance, 119 fire, 122 traffic accidents.
- Big cities have international clinics/hospitals with English-speaking staff (more expensive). Public hospitals: register (挂号) first, pay at each step; bring passport.
- Pharmacies (药店 yàodiàn, green cross) are everywhere; many medicines need a prescription.
- Lost passport: report to police (get a loss report), then contact your embassy; you also need a new visa/exit permit from the Exit-Entry Administration.

FOOD DELIVERY & DAILY APPS
- Meituan (美团) and Ele.me (饿了么) for delivery; also available inside Alipay/WeChat. A Chinese phone number may be needed for some accounts.
- Dianping (大众点评) for restaurant reviews. Amap for maps/navigation. Trip.com for hotels/trains/flights in English.

VISAS (always check official sources; policies change)
- China offers visa-free entry for many nationalities for limited stays, plus visa-free transit for travellers going to a third country. Eligibility, duration and ports vary: check the National Immigration Administration or your embassy.
`.trim();
