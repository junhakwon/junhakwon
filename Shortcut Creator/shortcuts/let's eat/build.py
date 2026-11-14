"""단축어 "let's eat" 생성 스크립트.

흐름: 받아쓰기 → 빈 입력 확인 → 검색어를 클립보드에 복사
      → coupangeats://search?keyword=<검색어> 열기 → 안내 알림

한계: iOS 단축어는 다른 앱의 버튼(맨 위 결과)을 대신 누를 수 없음.
      쿠팡이츠 검색 딥링크 형식은 비공개라 'keyword' 파라미터는 미검증 추정값.
      딥링크가 안 통해도 검색어가 클립보드에 있어 붙여넣기만 하면 됨.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from sclib import action, build, new_uuid, text, var, write  # noqa: E402

NAME = "let's eat"
SEARCH_URL = "coupangeats://search?keyword="

A = []
A.append(action("is.workflow.actions.notification", WFNotificationActionTitle="let's eat 🍽️",
                WFNotificationActionBody="뭐 먹고 싶어요? 말씀하세요 🎙️", WFNotificationActionSound=False))
dictate = action("is.workflow.actions.dictatetext", WFSpeechLanguage="ko-KR",
                 WFDictateTextStopListening="After Pause")
A.append(dictate)
DICT = (dictate, "받아쓴 텍스트")

g = new_uuid()
A.append(action("is.workflow.actions.conditional", GroupingIdentifier=g, WFControlFlowMode=0,
                WFCondition=101, WFInput={"Type": "Variable", "Variable": var(*DICT)}))
A.append(action("is.workflow.actions.notification", WFNotificationActionTitle="let's eat",
                WFNotificationActionBody="인식된 내용이 없어서 검색하지 않았어요.", WFNotificationActionSound=True))
A.append(action("is.workflow.actions.exit"))
A.append(action("is.workflow.actions.conditional", GroupingIdentifier=g, WFControlFlowMode=2))

# 딥링크가 안 통할 때를 대비해 검색어를 클립보드에 복사
A.append(action("is.workflow.actions.setclipboard", WFInput=var(*DICT)))

enc = action("is.workflow.actions.urlencode", WFEncodeMode="Encode", WFInput=var(*DICT))
A.append(enc)
url = action("is.workflow.actions.url", WFURLActionURL=text(SEARCH_URL, (enc, "URL 인코딩된 텍스트")))
A.append(url)

A.append(action("is.workflow.actions.notification", WFNotificationActionTitle="let's eat 🍽️",
                WFNotificationActionBody=text("'", DICT, "' 검색할게요. 결과가 안 보이면 검색창에 붙여넣기 하세요 (복사됨)"),
                WFNotificationActionSound=False))
A.append(action("is.workflow.actions.openurl", WFInput=var(url, "URL")))

if __name__ == "__main__":
    out = os.path.join(HERE, f"{NAME}.unsigned.shortcut")
    write(build(A, icon_color=4251333119, glyph=59446), out)
    print("wrote", out, "actions:", len(A))
