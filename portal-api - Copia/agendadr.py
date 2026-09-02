import requests
import json

SITE_URL = "https://iberdrola.sharepoint.com/sites/CompartilhamentodePostes"

LISTA = "CONTROLE_DIARIO_DE_TECNICO_DE_FISCALIZACOES"

URL = (
    f"{SITE_URL}/_api/web/lists/GetByTitle('{LISTA}')/items"
)

headers = {
    "Accept": "application/json;odata=verbose"
}

response = requests.get(
    URL,
    headers=headers,
    verify=False
)

print("STATUS:", response.status_code)
print(response.text[:1000])