"""Shortcut Creator — Apple Shortcuts (.shortcut) plist 빌더 헬퍼.

생성 결과는 '서명되지 않은' 바이너리 plist다. iOS 15+에서 가져오려면
macOS `shortcuts sign`으로 서명해야 한다 (.github/workflows/sign-shortcuts.yml).
"""
import plistlib
import uuid as _uuid

OBJ = "￼"  # 텍스트 안 변수 자리 표시 문자


def new_uuid():
    return str(_uuid.uuid4()).upper()


def output_ref(action, name):
    """다른 동작의 출력값을 가리키는 참조 dict."""
    return {"OutputUUID": action["WFWorkflowActionParameters"]["UUID"],
            "Type": "ActionOutput", "OutputName": name}


def var(action, name):
    """매개변수 하나에 변수 하나만 넣을 때 (WFTextTokenAttachment)."""
    return {"Value": output_ref(action, name), "WFSerializationType": "WFTextTokenAttachment"}


def text(*parts):
    """문자열과 (action, name) 튜플을 섞어 WFTextTokenString 생성."""
    s, attachments = "", {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            pos = len(s.encode("utf-16-le")) // 2  # 위치는 UTF-16 단위
            attachments["{%d, 1}" % pos] = output_ref(*p)
            s += OBJ
    return {"Value": {"string": s, "attachmentsByRange": attachments},
            "WFSerializationType": "WFTextTokenString"}


def action(identifier, **params):
    params.setdefault("UUID", new_uuid())
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def build(actions, icon_color=4282601983, glyph=59511):
    return {
        "WFWorkflowClientVersion": "2607.0.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": icon_color,
                           "WFWorkflowIconGlyphNumber": glyph},
        "WFWorkflowImportQuestions": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowActions": actions,
    }


def write(workflow, path):
    with open(path, "wb") as f:
        plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
