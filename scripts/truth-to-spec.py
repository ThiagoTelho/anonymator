# Converte o gabarito independente de um documento fictício (<nome>.truth.json) no .json de fixture.
# Uso: python3 scripts/truth-to-spec.py fixtures/src/<nome>.truth.json
#
# O gabarito é escrito por quem NÃO conhece as regras do detector (lista toda pessoa, empresa e dado
# pessoal do documento). A fixture resultante:
#   - usa as sugestões automáticas (suggest: true), como o usuário faria;
#   - exige remover toda menção e todo dado pessoal (mustRemove);
#   - exige manter os trechos não pessoais (mustKeep);
#   - aceita como sugestão só o que for menção de alguém do gabarito (allowedSuggestions: pega falsos positivos).
# Itens que o motor ainda não cobre devem ser movidos à mão de mustRemove para knownGaps.
import json, re, sys

truth = json.load(open(sys.argv[1], encoding="utf-8"))
out_path = sys.argv[1].replace("/src/", "/").replace(".truth.json", ".json")

mentions = []
for p in truth.get("people", []):
    mentions += p.get("mentions", []) + [p["name"]]
for c in truth.get("companies", []):
    mentions += c.get("mentions", []) + [c["name"]]

def uniq(xs):
    seen, out = set(), []
    for x in xs:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out

# Política do Anonymator: pronome de tratamento fica no texto ("Sr. [PESSOA_3]"); só o nome some.
TITLE = re.compile(r"^(?:Sr|Sra|Srta|Dr|Dra|Dr\(a\)|Senhor|Senhora|Doutor|Doutora)\.?\s+")
removable = [TITLE.sub("", m) for m in mentions]

spec = {
    "description": truth.get("description", ""),
    "source": "Gabarito independente: " + sys.argv[1],
    "suggest": True,
    "people": [],
    "allowedSuggestions": uniq(mentions + [x["value"] for x in truth.get("pii", [])]),
    "publicAgents": [p["name"] for p in truth.get("people", []) if p.get("role") == "agente_publico"],
    "mustRemove": uniq(removable + [x["value"] for x in truth.get("pii", [])]),
    "mustKeep": truth.get("keep", []),
    "knownGaps": [],
}
json.dump(spec, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(out_path, "a").write("\n")
print(f"{out_path}: {len(spec['mustRemove'])} itens a remover, {len(spec['mustKeep'])} a manter")
