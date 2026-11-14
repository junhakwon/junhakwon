"""단축어 '카카오톡 보내기' 생성 스크립트.

흐름: 받아쓰기 → 빈 입력 확인 → 확인 메뉴(보내기/다시 말하기/취소)
      → 카카오톡 메시지 보내기(숭선이🤍) → 완료 알림
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from sclib import action, build, new_uuid, text, var, write  # noqa: E402

NAME = "카카오톡 보내기"
RECIPIENT = "숭선이🤍"
KAKAO_BUNDLE = "com.iwilab.KakaoTalk"

A = []

# 1) 받는 사람 이름 (텍스트)
recipient = action("is.workflow.actions.gettext", WFTextActionText=RECIPIENT)
A.append(recipient)

# 2) 안내 알림 + 받아쓰기 (한국어, 말을 멈추면 종료)
A.append(action("is.workflow.actions.notification",
                WFNotificationActionTitle="카카오톡 보내기",
                WFNotificationActionBody=f"{RECIPIENT}에게 보낼 메시지를 말씀하세요 🎙️",
                WFNotificationActionSound=False))
dictate = action("is.workflow.actions.dictatetext",
                 WFSpeechLanguage="ko-KR",
                 WFDictateTextStopListening="After Pause")
A.append(dictate)
DICT = (dictate, "받아쓴 텍스트")

# 3) 빈 입력이면 알림 후 종료
g = new_uuid()
A.append(action("is.workflow.actions.conditional", GroupingIdentifier=g,
                WFControlFlowMode=0, WFCondition=101, WFInput={"Type": "Variable", "Variable": var(*DICT)}))
A.append(action("is.workflow.actions.notification",
                WFNotificationActionTitle="카카오톡 보내기",
                WFNotificationActionBody="인식된 내용이 없어서 보내지 않았어요.",
                WFNotificationActionSound=True))
A.append(action("is.workflow.actions.exit"))
A.append(action("is.workflow.actions.conditional", GroupingIdentifier=g, WFControlFlowMode=2))

# 4) 확인 메뉴
m = new_uuid()
items = ["보내기", "다시 말하기", "취소"]
A.append(action("is.workflow.actions.choosefrommenu", GroupingIdentifier=m, WFControlFlowMode=0,
                WFMenuPrompt=text(f"{RECIPIENT}에게 이렇게 보낼까요?\n\n", DICT),
                WFMenuItems=items))

# 4-1) 보내기
A.append(action("is.workflow.actions.choosefrommenu", GroupingIdentifier=m, WFControlFlowMode=1,
                WFMenuItemTitle="보내기"))
A.append(action("is.workflow.actions.sendmessage",
                IntentAppDefinition={"BundleIdentifier": KAKAO_BUNDLE, "Name": "KakaoTalk"},
                IntentAppIdentifier=KAKAO_BUNDLE,
                WFSendMessageActionRecipients=var(recipient, "텍스트"),
                WFSendMessageContent=text(DICT),
                ShowWhenRun=False))
A.append(action("is.workflow.actions.notification",
                WFNotificationActionTitle="카카오톡 보내기",
                WFNotificationActionBody=f"{RECIPIENT}에게 보냈어요 ✅",
                WFNotificationActionSound=False))

# 4-2) 다시 말하기 → 이 단축어를 처음부터 다시 실행
A.append(action("is.workflow.actions.choosefrommenu", GroupingIdentifier=m, WFControlFlowMode=1,
                WFMenuItemTitle="다시 말하기"))
A.append(action("is.workflow.actions.runworkflow",
                WFWorkflow={"workflowName": NAME, "isSelf": True},
                WFWorkflowName=NAME, WFShowWorkflow=False))
A.append(action("is.workflow.actions.exit"))

# 4-3) 취소
A.append(action("is.workflow.actions.choosefrommenu", GroupingIdentifier=m, WFControlFlowMode=1,
                WFMenuItemTitle="취소"))
A.append(action("is.workflow.actions.exit"))

A.append(action("is.workflow.actions.choosefrommenu", GroupingIdentifier=m, WFControlFlowMode=2))

if __name__ == "__main__":
    out = os.path.join(HERE, f"{NAME}.unsigned.shortcut")
    write(build(A, icon_color=4292093695, glyph=59783), out)  # 노란 계열 아이콘
    print("wrote", out, "actions:", len(A))
