"""分類的回歸測試，用 2026-09-12 第一次真實抓取的標題當樣本。

只測標題 —— 那正是「標題優先」這個修正要保證的行為。
新增或調整 TYPE_RULES 之後跑這支，確認沒有把已經對的弄壞。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crawler.normalize import classify

# (標題, 期望類型)。真實資料，未經修飾。
REAL_TITLES = [
    ("昆蟲小腦袋大學問！「看你什麼嘴臉！昆蟲的頭等大事特展」10月18日新奇登場", "exhibition"),
    ("2026馬年特展「霍斯辦案」從「走馬看花」到解密「馬」", "exhibition"),
    ("特展 氛圍地—影像建築", "exhibition"),
    ("內湖戶政「印象內湖．鑑往知來」特展", "exhibition"),
    ("鐵道文化常設展", "exhibition"),
    ("大稻埕戲苑《請戲–布袋戲一條街》特展", "exhibition"),
    ("郵政博物館「Oh!海郵-海洋生物郵票特展」", "exhibition"),
    ("從前從前－繪說童話郵票特展", "exhibition"),
    ("古典光影大師: 林布蘭到哥雅─托雷多美術館珍藏展", "exhibition"),
    ("魔幻時光：日治時期臺灣電影娛樂文化展", "exhibition"),
    ("在黑白紅之間，遇見城市裡未曾說出口的情緒 藝術家 BONi 個展《In the City, Unsaid.》", "exhibition"),
    ("盧芛 創作個展 【海妖的鏡子】 Lu Wei Solo Exhibition: Sirens", "exhibition"),
    ("林冠君 創作個展 【推石-尋找薛西佛斯】", "exhibition"),
    ("開路的人 — 臺北市無形文化資產與保存技術特展", "exhibition"),
    ("33幅星空影像齊聚臺北天文館！2026全國天文攝影巡迴展登場", "exhibition"),
    ("萬物升騰如明星｜鄧宇絜個展", "exhibition"),
    ("晉見山明-塵三個展 Where the Mountain Reveals Itself", "exhibition"),
    ("培根市集：十週年——時光祭", "market"),
    ("金車文藝講堂：複耳工作室創辦人馮志銘【忽然之間：空間聆聽的姿勢】", "talk"),
]

# 標題本身沒有任何類型訊號，OTHER 是誠實的答案，不要為了好看硬湊規則。
HONEST_OTHER = ["共感：存在的節奏", "未安之地", "桑拿大可：一件內褲 一雙襪子"]

# 三個情境的代表性標題，確保 TYPE_RULES 調整時不會誤傷
SCENARIO_TITLES = [
    ("龍洞DWS深水抱石一日體驗", "outdoor_challenge"),
    ("English Conversation Meetup 英文角", "language_exchange"),
    ("週末爵士 live 演出", "music"),
    ("MAJI 假日市集", "market"),
]


def main():
    failures = []
    print("真實標題（第一次抓取的 25 筆）")
    for title, expected in REAL_TITLES:
        got = classify(title)
        ok = got == expected
        if not ok:
            failures.append((title, expected, got))
        print(f"  {'PASS' if ok else 'FAIL'}  {got:18} {title[:36]}")

    print("\n標題無訊號 → 應該老實回 other")
    for title in HONEST_OTHER:
        got = classify(title)
        ok = got == "other"
        if not ok:
            failures.append((title, "other", got))
        print(f"  {'PASS' if ok else 'FAIL'}  {got:18} {title[:36]}")

    print("\n三個情境不能被誤傷")
    for title, expected in SCENARIO_TITLES:
        got = classify(title)
        ok = got == expected
        if not ok:
            failures.append((title, expected, got))
        print(f"  {'PASS' if ok else 'FAIL'}  {got:18} {title[:36]}")

    print("\n描述不該蓋過標題")
    cases = [
        ("昆蟲的頭等大事特展", "介紹昆蟲的美食與料理行為", "exhibition"),
        ("金車文藝講堂", "當我們走進一個展覽，第一眼會先看見作品", "talk"),
        ("日治時期電影娛樂文化展", "現場有音樂演奏與樂團表演", "exhibition"),
    ]
    for title, desc, expected in cases:
        got = classify(title, desc)
        ok = got == expected
        if not ok:
            failures.append((f"{title} + 描述", expected, got))
        print(f"  {'PASS' if ok else 'FAIL'}  {got:18} {title}")

    print()
    if failures:
        print(f"{len(failures)} 項失敗：")
        for t, e, g in failures:
            print(f"  {t[:40]!r}  期望 {e} 得到 {g}")
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
