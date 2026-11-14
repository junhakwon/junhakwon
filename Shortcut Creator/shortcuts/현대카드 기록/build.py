"""단축어 '현대카드 기록' 생성 스크립트.

트리거(사용자가 직접 설정): 단축어 앱 → 자동화 → 메시지 → 보낸 사람 현대카드,
  메시지에 "승인" 포함 → 즉시 실행 → 이 단축어 실행 (입력: 메시지)
흐름: 문자 텍스트(입력이 없으면 붙여넣기 요청) → 정규식으로 날짜/사용처/금액/누적 추출
      → 메모 "현대카드 사용내역"에 한 줄 추가 → 알림
한 줄 형식: 11/13 12:26 | 러너스키친 | 12,000원 | 누적1,200,966원
정규식은 현대카드 푸시 알림 형식 기준 (문자 형식은 실물 확인 후 조정 필요).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from sclib import SHORTCUT_INPUT, action, build, named, new_uuid, text, var, write  # noqa: E402

NAME = "현대카드 기록"
RE_DATE = r"\d{1,2}/\d{1,2} \d{1,2}:\d{2}"
RE_AMOUNT = r"[A-Z]{3} [0-9.,]+|[0-9,]+원"
RE_CUM = r"누적 ?[0-9,]+원"
RE_MERCHANT = r"\d{1,2}/\d{1,2} \d{1,2}:\d{2}[^\n]*\n([^\n]+)"

A = []
MSG = named("문자")

# 1) 단축어 입력(문자)을 텍스트로. 직접 실행했으면 붙여넣기 받기
detect = action("is.workflow.actions.detect.text", WFInput=var(SHORTCUT_INPUT))
A.append(detect)
g = new_uuid()
A.append(action("is.workflow.actions.conditional", GroupingIdentifier=g, WFControlFlowMode=0,
                WFCondition=101, WFInput={"Type": "Variable", "Variable": var(detect, "텍스트")}))
ask = action("is.workflow.actions.ask", WFAskActionPrompt="현대카드 승인 문자 내용을 붙여넣어 주세요",
             WFInputType="Text")
A.append(ask)
A.append(action("is.workflow.actions.setvariable", WFVariableName="문자", WFInput=var(ask, "입력 결과")))
A.append(action("is.workflow.actions.conditional", GroupingIdentifier=g, WFControlFlowMode=1))
A.append(action("is.workflow.actions.setvariable", WFVariableName="문자", WFInput=var(detect, "텍스트")))
A.append(action("is.workflow.actions.conditional", GroupingIdentifier=g, WFControlFlowMode=2))


def match(pattern):
    a = action("is.workflow.actions.text.match", WFMatchTextPattern=pattern,
               WFMatchTextCaseSensitive=True, text=text(MSG))
    A.append(a)
    return a


def first(a):
    f = action("is.workflow.actions.getitemfromlist", WFItemSpecifier="First Item",
               WFInput=var(a, "일치 항목"))
    A.append(f)
    return f


date = first(match(RE_DATE))
amount = first(match(RE_AMOUNT))
cum = first(match(RE_CUM))
mer_m = match(RE_MERCHANT)
merchant = action("is.workflow.actions.text.match.getgroup", WFGetGroupType="Group At Index",
                  WFGroupIndex=1, matches=var(mer_m, "일치 항목"))
A.append(merchant)

DATE, AMT, CUM, MER = (date, "목록에서 항목"), (amount, "목록에서 항목"), (cum, "목록에서 항목"), (merchant, "그룹")
line = action("is.workflow.actions.gettext",
              WFTextActionText=text(DATE, " | ", MER, " | ", AMT, " | ", CUM))
A.append(line)

# 2) 메모에 추가 — WFNote는 비워둠: 설치 후 '현대카드 사용내역' 메모를 한 번 선택
A.append(action("is.workflow.actions.appendnote", WFInput=var(line, "텍스트")))

A.append(action("is.workflow.actions.notification", WFNotificationActionTitle="현대카드 기록 💳",
                WFNotificationActionBody=text(MER, " ", AMT, " 기록했어요"), WFNotificationActionSound=False))

if __name__ == "__main__":
    out = os.path.join(HERE, f"{NAME}.unsigned.shortcut")
    write(build(A, icon_color=4282601983, glyph=59658, accepts_input=True), out)
    print("wrote", out, "actions:", len(A))
