"""Shortcut Creator — .shortcut 구조 검증기.

사용: python3 validate_shortcut.py <file.shortcut>
- 서명 파일(AEA1 헤더)인지, 서명 안 된 바이너리 plist인지 판별
- plist: 필수 키, 동작 식별자, UUID 중복, 변수 참조 대상, 제어 흐름(If/메뉴) 짝 검사
"""
import plistlib
import sys

REQUIRED = ["WFWorkflowActions", "WFWorkflowClientVersion", "WFWorkflowIcon",
            "WFWorkflowMinimumClientVersion"]


def walk_refs(obj):
    if isinstance(obj, dict):
        if obj.get("Type") == "ActionOutput" and "OutputUUID" in obj:
            yield obj["OutputUUID"]
        for v in obj.values():
            yield from walk_refs(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_refs(v)


def validate_plist(wf):
    errors, info = [], []
    for k in REQUIRED:
        if k not in wf:
            errors.append(f"필수 키 없음: {k}")
    actions = wf.get("WFWorkflowActions", [])
    seen, groups = {}, {}
    for i, a in enumerate(actions):
        ident = a.get("WFWorkflowActionIdentifier", "")
        p = a.get("WFWorkflowActionParameters", {})
        if not ident.startswith("is.workflow.actions."):
            errors.append(f"#{i} 알 수 없는 식별자: {ident}")
        # 변수 참조는 '이전' 동작만 가리켜야 함
        for ref in walk_refs(p):
            if ref not in seen:
                errors.append(f"#{i} {ident}: 앞에 없는 동작 출력 참조 {ref}")
        u = p.get("UUID")
        if u:
            if u in seen:
                errors.append(f"#{i} UUID 중복 {u}")
            seen[u] = i
        if "GroupingIdentifier" in p:
            groups.setdefault(p["GroupingIdentifier"], []).append((i, ident, p.get("WFControlFlowMode")))
        info.append(f"#{i:02d} {ident.replace('is.workflow.actions.', '')}")
    for g, entries in groups.items():
        modes = [m for _, _, m in entries]
        if modes[0] != 0 or modes[-1] != 2 or modes.count(0) != 1 or modes.count(2) != 1:
            errors.append(f"제어 흐름 짝 오류 {g}: {modes}")
        ident = entries[0][1]
        if ident.endswith("choosefrommenu"):
            items = actions[entries[0][0]]["WFWorkflowActionParameters"].get("WFMenuItems", [])
            cases = [actions[i]["WFWorkflowActionParameters"].get("WFMenuItemTitle")
                     for i, _, m in entries if m == 1]
            if items != cases:
                errors.append(f"메뉴 항목 {items} 과 분기 {cases} 불일치")
    return errors, info


def main(path):
    data = open(path, "rb").read()
    if data[:4] == b"AEA1":
        print(f"[서명됨] Apple Encrypted Archive 형식 (AEA1), {len(data)} bytes")
        return 0
    if not data.startswith(b"bplist00"):
        print("[실패] 바이너리 plist도 서명 파일도 아님")
        return 1
    wf = plistlib.loads(data)
    errors, info = validate_plist(wf)
    print(f"[서명 안 됨] 바이너리 plist, 동작 {len(info)}개")
    print("\n".join(info))
    if errors:
        print("\n[오류]")
        print("\n".join(errors))
        return 1
    print("\n[통과] 구조 검증 OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
