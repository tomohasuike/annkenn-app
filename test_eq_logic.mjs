const thresholdMap = { "5-": 45, "5+": 50, "6-": 55, "6+": 60, "7": 70 };
const targetMinScale = thresholdMap["5-"];
const regionQuery = "東京";

const mockEvent = {
    earthquake: { maxScale: 50, time: "2024" },
    points: [ { addr: "東京都新宿区", pref: "東京都", scale: 40 }, { addr: "埼玉県", pref: "埼玉県", scale: 50 }]
};

let isMatch = false;
const maxScale = mockEvent.earthquake.maxScale;

if (maxScale >= targetMinScale) {
    const points = mockEvent.points || [];
    for (const pt of points) {
        if (pt.scale >= targetMinScale && (regionQuery === "本社周辺" || regionQuery === "全域" || pt.addr.includes(regionQuery) || pt.pref.includes(regionQuery))) {
            isMatch = true;
            break;
        }
    }
    if (!isMatch && (regionQuery === "本社周辺" || regionQuery === "全域")) {
        isMatch = true;
    }
}
console.log("Is Match:", isMatch);
