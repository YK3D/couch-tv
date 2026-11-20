// The adhan recordings the family home knows. None are kept in git: scripts/get-adhan.py downloads the ones
// you choose into family/adhan/mine/ (git ignored), levels their loudness, and writes mine/have.js, which
// says which ones this TV has (and any of your own recordings you added with --add).
// Sources: AlAdhan's "Download Adhans" page (aladhan.com/download-adhans, the files its own player uses),
// checked 20 Nov 2026. They are for your own use at home; they are not ours to hand out, so they are not
// in this repository. None of these has a separate Fajr recording (with "as-salatu khayrun min an-nawm"):
// add your own with get-adhan.py --add <id> <file> --fajr <fajr file>.
window.FH_ADHANS = [
  { id: "alafasy", name: "Mishary Rashid Alafasy", name_ar: "مشاري راشد العفاسي", file: "adhan/mine/alafasy.mp3",
    url: "https://cdn.aladhan.com/audio/adhans/a9.mp3" },
  { id: "alafasy-2", name: "Mishary Rashid Alafasy (2)", name_ar: "مشاري راشد العفاسي ٢", file: "adhan/mine/alafasy-2.mp3",
    url: "https://cdn.aladhan.com/audio/adhans/a7.mp3" },
  { id: "alafasy-dubai", name: "Mishary Rashid Alafasy (Dubai One)", name_ar: "مشاري راشد العفاسي (دبي)", file: "adhan/mine/alafasy-dubai.mp3",
    url: "https://cdn.aladhan.com/audio/adhans/a4.mp3" },
  { id: "nafees", name: "Ahmad al-Nafees", name_ar: "أحمد النفيس", file: "adhan/mine/nafees.mp3",
    url: "https://cdn.aladhan.com/audio/adhans/a1.mp3" },
  { id: "zahrani", name: "Mansour Al-Zahrani", name_ar: "منصور الزهراني", file: "adhan/mine/zahrani.mp3",
    url: "https://cdn.aladhan.com/audio/adhans/a11-mansour-al-zahrani.mp3" },
  { id: "ozcan", name: "Hafiz Mustafa Özcan (Turkey)", name_ar: "حافظ مصطفى أوزجان", file: "adhan/mine/ozcan.mp3",
    url: "https://cdn.aladhan.com/audio/adhans/a2.mp3" }
];
