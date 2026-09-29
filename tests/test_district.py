"""行政區解析的回歸測試 —— 中文、英文、中英混雜三種形狀。

為什麼需要這支：Meetup 的地址是英文的，既有的中文解析一筆都吃不下，
所以 Meetup 的活動整批落在「未知」。行政區只影響排序不影響過濾，
所以解不出來不會讓活動消失 —— 但也因此壞掉不會有人發現。這支就是那個發現機制。

期望值是人工核對過的，不是跑實作產出來的。fixture 裡只有原始地址。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.jsonld import event_from_jsonld
from crawler.normalize import (_KNOWN_DISTRICTS, _NEW_TAIPEI_DISTRICTS,
                               _TAIPEI_DISTRICTS, EN_DISTRICTS, parse_location)
from crawler.venues import lookup as lookup_venue

FIX = Path(__file__).parent / "fixtures"

# (地址, 期望 city, 期望 district, 這一列在測什麼)
CASES = [
    # --- 中文：既有行為，不能被英文那條路弄壞 ---
    ("台北市大安區和平東路三段66號, Taipei", "臺北市", "大安區", "純中文"),
    ("106大安區大學里新生南路三段60巷7號, Taipei City", "臺北市", "大安區", "中文，縣市被郵遞區號隔開"),
    ("台灣台北市108臺北市萬華區成都路10巷35-37號", "臺北市", "萬華區", "中文，縣市出現兩次（Accupass 的形狀）"),

    # --- 英文 ---
    ("No. 32, Nanyang St, Zhongzheng District, Taipei City,, Taipei City", "臺北市", "中正區", "純英文"),
    ("No. 1號, Section 2, Xinsheng S Rd, 龍門里, Da’an District, Ta", "臺北市", "大安區", "英文 + 彎引號"),
    ("No. 65號, Section 1, Anhe Rd, Dunhuang Village, Da'an District", "臺北市", "大安區", "直引號"),
    ("No. 10, Tacheng St., Datong Dist. 103005, Taipei City", "臺北市", "大同區", "Dist. 縮寫帶點"),
    ("8F., No.16, Fuhe St., Sanchong Dist, New Taipei City", "新北市", "三重區", "Dist 縮寫不帶點 + 新北"),
    ("No. 90, Xicheng Road, Banqiao District, New Taipei City", "新北市", "板橋區", "新北"),
    ("3F, No. 2, Lane 133, Zhongxing St., Yonghe Dist., New Taipei City", "新北市", "永和區", "新北，tw--taipei 半徑溢出來的"),
    ("Jiantan Rd, Shilin District, Taipei City, Taiwan 111, Shilin District", "臺北市", "士林區", "重複的行政區"),

    # --- 中英混雜 ---
    ("Lane 527, Daye Road, fengnian village, beitou 112臺北市北投區豐年里, Taipei", "臺北市", "北投區", "中英混在同一段"),
    ("104, Taiwan, Taipei City, Zhongshan District, 中山區 Linsen N Rd, 286號B1", "臺北市", "中山區", "中英都有，答案一致"),
    ("吉祥里 Alley 52, Lane 245, Section 4, Bade Rd, 29號, Songshan District, Ta", "臺北市", "松山區", "里是中文、區是英文"),

    # --- 必須留「未知」的 ---
    ("No. 526號, Xinzhong N Rd,, Zhongli District", None, None, "中壢：不是雙北，縣市也不該猜"),
    ("TBA, Taipei", None, None, "TBA 字面就是待公布"),
    ("Taipei Main Station, Taipei", None, None, "地標不是地址（場地表才認得，見 VENUE_CASES）"),
    ("Room. 2, 5th Floor, No. 575, Linsen North Road., Taipei", None, None, "林森北路跨中山／大同，本質歧義"),
    ("Lane 179, Tonghe St, Taipei", None, None, "通河街歧義，不硬猜"),
    ("No. 88, Dunhua N Rd, Taipei", None, None, "敦化北路跨松山／大安，本質歧義"),
    (None, None, None, "沒有地址"),

    # --- 以下每一筆都是 code review 抓到的真實假陽性，不是假想案例 ---
    ("Xinyi Distillery Bar, Hsinchu", None, None,
     "Distillery 的前四個字母是 Dist，但它不是 District"),
    ("Banqiao Distribution Hub, Taoyuan", None, None,
     "Distribution 同上"),
    ("No. 1, Xinyi Rd, Xinyi District, Keelung City, Taiwan 201", None, "信義區",
     "基隆也有信義區 → 區名給得出來，縣市不能反推成臺北"),
    ("No. 5, Zhongzheng District, Keelung City", None, "中正區",
     "基隆也有中正區"),
    ("No. 3, Guishan District, Taoyuan City, Taipei", None, None,
     "龜山在桃園，字串裡那個 Taipei 不算數"),
    ("Taipei Cultural Center, Kaohsiung", None, None,
     "機構名裡的 Taipei 不算縣市證據"),
    ("National Taipei University, Sanxia District", "新北市", "三峽區",
     "校名含 Taipei 但實際在三峽 —— 靠行政區反推才對"),
    ("No. 155號3, Section 1, Keelung Rd, 興雅里, Xinyi District, Ta", "臺北市", "信義區",
     "基隆路是台北信義區的路，不能因為有 Keelung 就拒絕反推"),
    ("台灣桃園市中壢區中正路1號", "桃園市", "中壢區",
     "中文的其他縣市照樣解得出來，不受雙北邏輯影響"),
]


# 地址完全解不出行政區、只能靠場地名的。(場地名, 期望 city, 期望 district, 在測什麼)
VENUE_CASES = [
    ("Taipei Main Station", "臺北市", "中正區", "地標：台北車站"),
    ("Taipei Main Station (ON the train)", "臺北市", "中正區", "地標帶括號註記"),
    ("Da An Park Playground / Gym", "臺北市", "大安區", "地標：大安森林公園"),
    ("國家兩廳院", "臺北市", "中正區", "既有的中文場地不能被弄壞"),
    ("TBA, somewhere in Taipei", None, None, "場地也是待公布 → 仍然未知"),
    ("Bailing Rugby Grounds", "臺北市", "士林區", "百齡運動場"),
    ("Bailing Hotel Kaohsiung", None, None, "Bailing 這個字太通用，不能光靠它命中"),
    ("Daan Forest Park", "臺北市", "大安區", "正規化涵蓋 Da An / DaAn / Da’an 各種寫法"),
]


def _resolve(venue, street, locality):
    """走真正的那條路（event_from_jsonld），不要在測試裡複製一份邏輯。"""
    node = {"@type": "Event", "name": "測試用",
            "startDate": "2026-10-01T12:00:00+08:00",
            "location": {"@type": "Place", "name": venue,
                         "address": {"@type": "PostalAddress",
                                     "streetAddress": street,
                                     "addressLocality": locality}}}
    ev = event_from_jsonld(node, source_platform="t", source_id="1", source_url="u")
    return ev.city, ev.district


def main():
    failures = []

    def check(label, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {label}{'  ' + str(detail) if detail else ''}")
        if not cond:
            failures.append(label)

    print("對照表本身 —— 加一行不用改邏輯，所以要擋住打錯字")
    bad = {k: v for k, v in EN_DISTRICTS.items() if v not in _KNOWN_DISTRICTS}
    check("每個英文鍵都對到一個真的行政區", not bad, bad)
    check("雙北 41 區都有英文對照",
          set(EN_DISTRICTS.values()) >= set(_KNOWN_DISTRICTS),
          sorted(set(_KNOWN_DISTRICTS) - set(EN_DISTRICTS.values())))
    check("台北 12 區 + 新北 29 區",
          len(_TAIPEI_DISTRICTS) == 12 and len(_NEW_TAIPEI_DISTRICTS) == 29,
          (len(_TAIPEI_DISTRICTS), len(_NEW_TAIPEI_DISTRICTS)))

    print("\n逐筆核對（期望值是人工核的）")
    for addr, want_city, want_dist, why in CASES:
        got_city, got_dist = parse_location(addr)
        check(f"{why}", (got_city, got_dist) == (want_city, want_dist),
              f"得到 {(got_city, got_dist)}，期望 {(want_city, want_dist)}")

    print("\n場地表 —— 地址解不出行政區時的退路")
    for venue, want_city, want_dist, why in VENUE_CASES:
        check(why, lookup_venue(venue) == (want_city, want_dist),
              f"得到 {lookup_venue(venue)}，期望 {(want_city, want_dist)}")

    print("\n真實樣本的解析率（依活動數加權，不是依相異地址數）")
    doc = json.loads((FIX / "meetup_addresses.json").read_text(encoding="utf-8"))
    rows = doc["addresses"]
    total = resolved = city_only = by_venue = 0
    unresolved = []
    for r in rows:
        city, dist = _resolve(r["venue"], r["streetAddress"], r["addressLocality"])
        _, addr_dist = parse_location(
            ", ".join(p for p in (r["streetAddress"], r["addressLocality"]) if p))
        total += r["n"]
        if dist:
            resolved += r["n"]
            if not addr_dist:
                by_venue += r["n"]
        else:
            if city:
                city_only += r["n"]
            unresolved.append((r["n"], (r["venue"] or r["streetAddress"] or "")[:50]))
    rate = resolved * 100 // total
    print(f"        {total} 場有地址：解出行政區 {resolved}（其中 {by_venue} 靠場地表）、"
          f"只有縣市 {city_only}、完全未知 {total - resolved - city_only}")
    for n, a in sorted(unresolved, reverse=True):
        print(f"          {n}× {a}")
    check("行政區解析率 ≥ 85%", rate >= 85, f"{rate}%")

    print("\n縣市不能憑空冒出來")
    # 縣市有兩個來源：地址裡的縣市字樣，或行政區反推（雙北 41 區名不重複，
    # 所以反推是確定的）。兩者都沒有卻給出縣市，那就是猜的。
    # 不要改成「地址裡一定要有 Taipei 字樣」—— Meetup 的地址常常被截成 "…, Ta"。
    for r in rows:
        blob = " ".join(p for p in (r["venue"], r["streetAddress"],
                                    r["addressLocality"]) if p)
        city, dist = _resolve(r["venue"], r["streetAddress"], r["addressLocality"])
        if city in ("臺北市", "新北市") and dist is None:
            has_token = ("taipei" in blob.lower() or "臺北" in blob
                         or "台北" in blob or "新北" in blob)
            check(f"沒有行政區時，縣市要有字面根據：{blob[:36]}", has_token, blob[:70])

    print()
    if failures:
        print(f"{len(failures)} 項失敗: {failures}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    sys.exit(main())
