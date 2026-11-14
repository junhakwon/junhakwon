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


def ref(p):
    """(action, name) 튜플 또는 이미 만든 참조 dict를 참조 dict로."""
    return p if isinstance(p, dict) else output_ref(*p)


def named(name):
    """'변수 설정'으로 만든 이름 있는 변수 참조."""
    return {"Type": "Variable", "VariableName": name}


SHORTCUT_INPUT = {"Type": "ExtensionInput"}


def var(action, name=None):
    """매개변수 하나에 변수 하나만 넣을 때 (WFTextTokenAttachment).
    var(action, "출력 이름") 또는 var(named("변수")) / var(SHORTCUT_INPUT)."""
    r = action if name is None else output_ref(action, name)
    return {"Value": r, "WFSerializationType": "WFTextTokenAttachment"}


def text(*parts):
    """문자열과 (action, name) 튜플을 섞어 WFTextTokenString 생성."""
    s, attachments = "", {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            pos = len(s.encode("utf-16-le")) // 2  # 위치는 UTF-16 단위
            attachments["{%d, 1}" % pos] = ref(p)
            s += OBJ
    return {"Value": {"string": s, "attachmentsByRange": attachments},
            "WFSerializationType": "WFTextTokenString"}


def action(identifier, **params):
    params.setdefault("UUID", new_uuid())
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def build(actions, icon_color=4282601983, glyph=59511, accepts_input=False):
    return {
        "WFWorkflowClientVersion": "2607.0.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": icon_color,
                           "WFWorkflowIconGlyphNumber": glyph},
        "WFWorkflowImportQuestions": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowInputContentItemClasses": (["WFStringContentItem", "WFGenericFileContentItem"]
                                              if accepts_input else []),
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowHasShortcutInputVariables": accepts_input,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowActions": actions,
    }


def write(workflow, path):
    with open(path, "wb") as f:
        plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
